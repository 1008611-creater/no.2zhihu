import "server-only";

import { cached } from "./cache";
import { ZhihuApiError, kindForCode } from "./errors";
import type {
  HackathonWork,
  HotListResult,
  QuestionAnswersResult,
  QuestionRecommendation,
  QuotaItem,
  SearchResult,
  ZhidaCompletion,
  ZhidaMessage,
} from "./types";

/**
 * 知乎开放平台服务端客户端。
 *
 * 实测契约（2026-09-14）：
 *   Authorization: Bearer <Access Secret>
 *   X-Request-Timestamp: <秒级 Unix 时间戳>
 *   Content-Type: application/json
 *
 * 该模块只能在服务端运行，Access Secret 绝不进入前端 bundle。
 *
 * 参数大小写坑（2026-09-14 实测）：搜索类接口的条数参数是 `Count`，不是 `Limit`。
 * 传错名字上游不会报错，而是静默按默认值返回 10 条，容易在联调时误判为「正常」。
 *
 * system 角色坑（2026-09-15 实测）：`POST /v1/chat/completions` 对 `system` 的遵从**不够稳定**
 * —— 同一条 messages 曾出现「先失败、后成功」。注意它**不是被丢弃**：A/B 实测两种写法
 * 成功率相同。折叠处理见 foldSystemIntoUser()。
 */

const API_BASE = "https://developer.zhihu.com";
const HACKATHON_BASE = "https://api.zhihu.com/km-indep-home/hackathon/v2";
const TIMEOUT_MS = 12_000;

/** 上游额度非常有限，缓存策略集中在这里定义。 */
export const TTL = {
  quota: 60_000,
  hot: 10 * 60_000,
  search: 5 * 60_000,
  answers: 10 * 60_000,
  recommendations: 30 * 60_000,
  zhida: 30 * 60_000,
  hackathon: 30 * 60_000,
} as const;

export function hasCredentials(): boolean {
  return Boolean(process.env.ZHIHU_ACCESS_SECRET?.trim());
}

function requireSecret(): string {
  const secret = process.env.ZHIHU_ACCESS_SECRET?.trim();
  if (!secret) {
    throw new ZhihuApiError({
      message: "ZHIHU_ACCESS_SECRET is not configured",
      kind: "config",
      endpoint: "env",
    });
  }
  return secret;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${requireSecret()}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    "Content-Type": "application/json",
    ...extra,
  };
}

async function requestOnce<T>(
  endpoint: string,
  init: RequestInit = {},
  opts: { envelope?: boolean } = { envelope: true },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (cause) {
    throw new ZhihuApiError({
      message: `network failure calling ${endpoint}`,
      kind: "network",
      endpoint,
      cause,
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch (cause) {
    throw new ZhihuApiError({
      message: `unparseable response from ${endpoint}`,
      kind: "parse",
      endpoint,
      status: res.status,
      cause,
    });
  }

  if (!res.ok) {
    throw new ZhihuApiError({
      message: `HTTP ${res.status} from ${endpoint}`,
      kind:
        res.status === 401 || res.status === 403
          ? "auth"
          : res.status === 429
            ? "rate_limit"
            : "upstream",
      endpoint,
      status: res.status,
    });
  }

  if (opts.envelope !== false) {
    const env = parsed as { Code?: number; Message?: string; Data?: unknown } | null;
    if (env && typeof env.Code === "number") {
      if (env.Code !== 0) {
        throw new ZhihuApiError({
          message: env.Message || `upstream code ${env.Code}`,
          kind: kindForCode(env.Code),
          endpoint,
          code: env.Code,
          status: res.status,
        });
      }
      return env.Data as T;
    }
  }

  return parsed as T;
}

/**
 * 串行闸门 + 退避重试。
 *
 * 为什么必须有：实测（2026-09-14）知乎开放平台对同一 Secret 的并发请求会直接返回
 * `rate limit exceeded`，而镜像引擎需要同时为多个分身取证据。若并发发出，
 * 部分分身会拿到空来源，页面上就会出现「该视角没有证据」的假象 —— 这违反
 * 「不编造、不假装」的铁律。因此这里把上游调用强制排成一条队列，并对限流做指数退避。
 *
 * 排队只影响首字节延迟（单次约 0.5s），不额外消耗额度：串行与并发的总调用次数完全相同。
 */

/** 相邻两次上游请求的最小间隔，给平台的 QPS 限制留出余量。 */
const MIN_GAP_MS = 350;

/** 限流后的重试次数与退避基数。 */
const RETRY_LIMIT = 3;
const RETRY_BASE_MS = 700;

let gate: Promise<void> = Promise.resolve();
let lastCallAt = 0;

/**
 * 执行一次上游调用。
 *
 * serialize=true（默认）：排进全局单通道队列并保持最小间隔。内容检索类接口实测
 * 在并发时会返回 30001，必须串行。
 *
 * serialize=false：直答（/v1/chat/completions）实测可安全并发（3 路并发约 2 秒
 * 全部成功），串行只会白白拉长演示等待时间，因此放行。
 */
function run<T>(serialize: boolean, task: () => Promise<T>): Promise<T> {
  if (!serialize) return task();

  const queued = gate.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCallAt = Date.now();
    }
  });
  // 队列本身不因单次失败而中断，失败只影响本次调用者。
  gate = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 只对「可恢复」的失败重试：限流、上游 5xx、网络抖动。 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ZhihuApiError)) return false;
  if (err.kind === "rate_limit" || err.kind === "network") return true;
  return err.kind === "upstream" && (err.status ?? 500) >= 500;
}

function request<T>(
  endpoint: string,
  init: RequestInit = {},
  opts: { envelope?: boolean; serialize?: boolean; retries?: number } = { envelope: true, serialize: true },
): Promise<T> {
  return run<T>(opts.serialize !== false, async () => {
    let lastErr: unknown;
    const retryLimit = opts.retries ?? RETRY_LIMIT;
    for (let attempt = 0; attempt <= retryLimit; attempt++) {
      try {
        return await requestOnce<T>(endpoint, init, opts);
      } catch (err) {
        lastErr = err;
        if (attempt === retryLimit || !isRetryable(err)) throw err;
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
    throw lastErr;
  });
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------- 额度 ------------------------------- */

export function getQuota(apiIds?: string[]): Promise<QuotaItem[]> {
  const key = `quota:${apiIds?.join(",") ?? "all"}`;
  return cached(
    key,
    () =>
      request<QuotaItem[]>(
        `${API_BASE}/api/v1/quota${qs({ APIIDs: apiIds?.join(",") })}`,
        { headers: authHeaders() },
      ),
    { ttlMs: TTL.quota },
  );
}

/* ------------------------------ 搜索 ------------------------------- */

export function zhihuSearch(query: string, limit = 10): Promise<SearchResult> {
  return cached(
    `zhihu_search:${query}:${limit}`,
    () =>
      request<SearchResult>(
        `${API_BASE}/api/v1/content/zhihu_search${qs({ Query: query, Count: limit })}`,
        { headers: authHeaders() },
      ),
    { ttlMs: TTL.search },
  );
}

export function globalSearch(query: string, limit = 10): Promise<SearchResult> {
  return cached(
    `global_search:${query}:${limit}`,
    () =>
      request<SearchResult>(
        `${API_BASE}/api/v1/content/global_search${qs({ Query: query, Count: limit })}`,
        { headers: authHeaders() },
      ),
    { ttlMs: TTL.search },
  );
}

/* ------------------------------ 热榜 ------------------------------- */

export function hotList(limit = 30): Promise<HotListResult> {
  return cached(
    `hot_list:${limit}`,
    () =>
      request<HotListResult>(`${API_BASE}/api/v1/content/hot_list${qs({ Limit: limit })}`, {
        headers: authHeaders(),
      }),
    { ttlMs: TTL.hot },
  );
}

/* --------------------------- 问题与回答 ---------------------------- */

export function questionAnswers(
  questionUrl: string,
  limit = 10,
  offset = 0,
): Promise<QuestionAnswersResult> {
  return cached(
    `question_answers:${questionUrl}:${limit}:${offset}`,
    () =>
      request<QuestionAnswersResult>(
        `${API_BASE}/api/v1/content/question_answers${qs({
          QuestionUrl: questionUrl,
          Limit: limit,
          Offset: offset,
        })}`,
        { headers: authHeaders() },
      ),
    { ttlMs: TTL.answers },
  );
}

export function questionRecommendations(
  opts: { query?: string; count?: number } = {},
): Promise<QuestionRecommendation[]> {
  const { query, count = 5 } = opts;
  return cached(
    `qrec:${query ?? "profile"}:${count}`,
    () =>
      request<{ Items: QuestionRecommendation[] }>(
        `${API_BASE}/api/v1/user/question_recommendations${qs({ Query: query, Count: count })}`,
        { headers: authHeaders() },
      ).then((d) => d.Items ?? []),
    { ttlMs: TTL.recommendations },
  );
}

/* ------------------------------ 直答 ------------------------------- */

/**
 * 把 `system` 消息折叠进第一条 `user` 消息。
 *
 * ⚠️ 这不是因为上游「丢弃 system」—— 实测它**会**处理 system：
 *   同一句格式约束分别放 system / user，各 3 次独立采样（换不同主题避开缓存），
 *   两边都是 3/3 生效；真实蒸馏提示词做 A/B，两边也都是 3/3 成功。
 *
 * 保留折叠是因为上游对 `system` 的遵从**不够稳定**：同一条 messages 曾出现
 * 「07:22 失败、07:53 成功」这种时好时坏的情况。把指令放进 `user`（离生成更近的
 * 位置）是对这种不稳定的低成本对冲 —— 实测对生成质量无副作用（回答长度与
 * 雷同度均无变化），所以宁可多这一道归一化。
 *
 * 折叠顺序：system 内容放在 user 消息**最前面**，原始 user 内容跟在后面。
 * 实测这个顺序（指令在前、材料在后）模型会稳定照做；反过来容易被材料带跑
 * —— 例如只给材料时，直答会按本能输出「信源评估报告」而不是要求的 JSON。
 *
 * 调用方仍可照常写 `role: "system"`（读起来更符合原意），由这里统一补偿。
 */
function foldSystemIntoUser(messages: ZhidaMessage[]): ZhidaMessage[] {
  if (!messages.some((m) => m.role === "system")) return messages;

  const head = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const at = rest.findIndex((m) => m.role === "user");

  if (at < 0) return [...rest, { role: "user", content: head }];
  return rest.map((m, i) => (i === at ? { ...m, content: head + "\n\n" + m.content } : m));
}

/** 公共人物追加只允许一次生成尝试，失败由用户决定是否再次发起。 */
export function publicFigureCompletion(messages: ZhidaMessage[]): Promise<ZhidaCompletion> {
  return request<ZhidaCompletion>(`${API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model: "zhida-fast-1p5", messages: foldSystemIntoUser(messages), stream: false }),
  }, { envelope: false, serialize: false, retries: 0 });
}

export function zhida(
  messages: ZhidaMessage[],
  opts: { model?: string; temperature?: number } = {},
): Promise<ZhidaCompletion> {
  const { model = "zhida-fast-1p5", temperature } = opts;
  // 先折叠再算缓存键：否则「同一段 user 内容 + 不同 system 指令」会命中同一份缓存。
  const sent = foldSystemIntoUser(messages);
  const key = `zhida:${model}:${JSON.stringify(sent)}`;
  return cached(
    key,
    () =>
      request<ZhidaCompletion>(
        `${API_BASE}/v1/chat/completions`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ model, messages: sent, stream: false, temperature }),
        },
        // 直答与内容检索的限流维度不同：实测可并发，故不排队。
        { envelope: false, serialize: false },
      ),
    { ttlMs: TTL.zhida },
  );
}

/** 直答的便捷封装：返回纯文本，失败时抛出 ZhihuApiError。 */
export async function zhidaText(
  messages: ZhidaMessage[],
  opts: { model?: string } = {},
): Promise<string> {
  const out = await zhida(messages, opts);
  return out.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ---------------------------- 黑客松内容 ---------------------------- */

/**
 * 实测结论（2026-09-14）：这两个地址是知乎站内页面用的接口，服务端直连一律 401
 * （AuthenticationInvalidRequest / ERR_PARSE_LOGIN_TICKET），需要浏览器登录态，
 * 开放平台 Access Secret 对它无效。保留封装是为了在凭证/登录态具备时可直接启用；
 * 当前调用会如实抛出鉴权错误，由路由层返回真实提示，不使用任何替代数据。
 */

export function hackathonStories(): Promise<HackathonWork[]> {
  return cached(
    "hackathon:stories",
    () => request<HackathonWork[]>(`${HACKATHON_BASE}/story/list`, {}, { envelope: false }),
    { ttlMs: TTL.hackathon },
  );
}

export function hackathonKnowledge(): Promise<HackathonWork[]> {
  return cached(
    "hackathon:knowledge",
    () => request<HackathonWork[]>(`${HACKATHON_BASE}/knowledge/list`, {}, { envelope: false }),
    { ttlMs: TTL.hackathon },
  );
}
