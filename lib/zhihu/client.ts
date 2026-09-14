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
  opts: { envelope?: boolean; serialize?: boolean } = { envelope: true, serialize: true },
): Promise<T> {
  return run<T>(opts.serialize !== false, async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
      try {
        return await requestOnce<T>(endpoint, init, opts);
      } catch (err) {
        lastErr = err;
        if (attempt === RETRY_LIMIT || !isRetryable(err)) throw err;
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

export function zhida(
  messages: ZhidaMessage[],
  opts: { model?: string; temperature?: number } = {},
): Promise<ZhidaCompletion> {
  const { model = "zhida-fast-1p5", temperature } = opts;
  const key = `zhida:${model}:${JSON.stringify(messages)}`;
  return cached(
    key,
    () =>
      request<ZhidaCompletion>(
        `${API_BASE}/v1/chat/completions`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ model, messages, stream: false, temperature }),
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
