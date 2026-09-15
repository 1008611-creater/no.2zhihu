import "server-only";

import { ZhihuApiError, kindForCode } from "./errors";

/**
 * 知乎 OAuth 2.0 服务端客户端。
 *
 * 官方文档：docs/zhihu-api/references/zhihu_oauth_integrated.md
 * 流程：authorize → 回调带 authorization_code → 换 access_token → 取用户信息
 *
 * 三条铁律（对应 AGENTS.md §1）：
 *   1. app_key 与 access_token 绝不出服务端 —— 本模块首行 server-only，
 *      前端只能拿到 /api/auth/session 里那点公开字段。
 *   2. 换 token 时必须原样回传申请应用时登记的 redirect_uri，哪怕它和当前
 *      请求的地址不同（线上/本地两个回调地址各自登记，不猜、不拼）。
 *   3. 凭证缺失时如实降级为「未配置」，不假装登录成功。
 */

const OAUTH_AUTHORIZE = "https://openapi.zhihu.com/authorize";
const OAUTH_TOKEN = "https://openapi.zhihu.com/access_token";

/** 「获取用户信息」接口。文档未给出正文，按官方约定的 openapi 前缀调用。 */
const OAUTH_USER = "https://openapi.zhihu.com/user";

const TIMEOUT_MS = 12_000;

export interface OAuthConfig {
  appId: string;
  appKey: string;
  /** 申请应用时登记的默认回调地址 */
  redirectUri: string;
  /** 允许的回调地址白名单（线上 + 本地）。第二个地址用于本地调试。 */
  allowedRedirects: string[];
}

/** 读 OAuth 凭证。任何一项为空都视为未配置 —— 三件套缺一不可。 */
export function oauthConfig(): OAuthConfig | null {
  const appId = process.env.ZHIHU_APP_ID?.trim();
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY?.trim();
  const redirectUri = process.env.ZHIHU_REDIRECT_URI?.trim();
  if (!appId || !appKey || !redirectUri) return null;

  // 知乎要求回调地址与申请时登记的完全一致，所以本地调试要么用登记过的那一个，
  // 要么把第二个也登记上。这里只做「声明了哪几个」的白名单，不做任何拼接。
  const extra = process.env.ZHIHU_REDIRECT_URI_ALT?.trim();
  const allowedRedirects = [redirectUri, ...(extra ? [extra] : [])];
  return { appId, appKey, redirectUri, allowedRedirects };
}

export function hasOAuth(): boolean {
  return oauthConfig() !== null;
}

/** 从本次请求推出回调地址；只有落在白名单里才采用，否则退回登记值。 */
export function resolveRedirectUri(reqUrl: string): string {
  const cfg = oauthConfig();
  if (!cfg) return "";
  const origin = new URL(reqUrl).origin;
  const candidate = `${origin}/api/auth/callback`;
  return cfg.allowedRedirects.includes(candidate) ? candidate : cfg.redirectUri;
}

/**
 * 本站对外的公开 origin（用于登录后跳回 /mesh 这类绝对地址）。
 *
 * ⚠️ 为什么不能直接用 `new URL(req.url).origin`：
 * Next.js 14 的 Route Handler 在反代后面（`next start` 监听 127.0.0.1:3000、
 * nginx 转发）拿到的 `req.url` 里 host 仍是 **本机监听地址**，
 * 于是 origin 恒为 `http://localhost:3000` —— 用户登录完会被跳到
 * `https://localhost:3000/mesh`，一个根本不存在的地址（2026-09-15 线上实测）。
 *
 * 这里改成从**已登记的合法回调地址**反推 origin（那是配置里唯一的可信来源），
 * 并且用白名单校验请求带来的 origin，防止 Host 头被伪造导致开放重定向。
 */
export function publicOrigin(reqUrl: string): string {
  const cfg = oauthConfig();
  // 未配置 OAuth 时没有可信来源，退化为请求 origin（此时也不会有登录流程）。
  if (!cfg) {
    try {
      return new URL(reqUrl).origin;
    } catch {
      return "";
    }
  }
  // 请求 origin 若在白名单里（本地调试命中 ALT），优先用它，保证本地跳转也正确。
  try {
    const reqOrigin = new URL(reqUrl).origin;
    for (const allowed of cfg.allowedRedirects) {
      if (allowed.startsWith(reqOrigin + "/")) return reqOrigin;
    }
  } catch {
    /* ignore */
  }
  // 否则一律用登记的主回调地址反推 —— 这是唯一不会被请求方篡改的来源。
  return new URL(cfg.redirectUri).origin;
}

/** 面向用户的未配置说明。前端直接展示，不编造「登录成功」。 */
export const OAUTH_UNCONFIGURED_MESSAGE =
  "知乎 OAuth 登录尚未开通：服务端缺少 ZHIHU_APP_ID / ZHIHU_OAUTH_APP_KEY。" +
  "这两项需向 openplatform@zhihu.com 申请后配置，当前如实说明，不假装已登录。";

/** 构造授权页地址。state 由调用方生成并校验，用于防 CSRF。 */
export function authorizeUrl(state: string, redirectUri?: string): string {
  const cfg = oauthConfig();
  if (!cfg) {
    throw new ZhihuApiError({ message: "OAuth not configured", kind: "config", endpoint: "oauth.authorize" });
  }
  const q = new URLSearchParams({
    redirect_uri: redirectUri || cfg.redirectUri,
    app_id: cfg.appId,
    response_type: "code",
    state,
  });
  return `${OAUTH_AUTHORIZE}?${q.toString()}`;
}

export interface ZhihuToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  /** 本地算出的过期时刻（毫秒），方便直接比较。 */
  expiresAt: number;
}

/**
 * 用 authorization_code 换 access_token。
 *
 * 注意这里是 POST + form-urlencoded，不是本平台其它接口的 JSON + Bearer，
 * 参数名也是 snake_case（app_id / app_key / grant_type / redirect_uri / code）。
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<ZhihuToken> {
  const cfg = oauthConfig();
  if (!cfg) {
    throw new ZhihuApiError({ message: "OAuth not configured", kind: "config", endpoint: "oauth.token" });
  }

  const body = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    grant_type: "authorization_code",
    redirect_uri: redirectUri || cfg.redirectUri,
    code,
  });

  let res: Response;
  try {
    res = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ZhihuApiError({ message: "token exchange network failure", kind: "network", endpoint: "oauth.token", cause });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ZhihuApiError({
      message: `token exchange failed: ${res.status}`,
      kind: res.status === 401 || res.status === 403 ? "auth" : "upstream",
      endpoint: "oauth.token",
      status: res.status,
    });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new ZhihuApiError({ message: "token response not JSON", kind: "parse", endpoint: "oauth.token", cause });
  }

  // 响应可能直接给 access_token，也可能包在 data / Data 里。
  // 注意：20001 这类**失败**响应里 data 是「错误描述字符串」而不是对象，
  // 所以这里必须先判类型再用，否则会把错误文案当成 token 容器。
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const inner =
    asRecord(data.data) ?? asRecord(data.Data) ?? (data as Record<string, unknown>);

  // ⚠️ 业务成功码是 20000。绝不能把非零 code 一律当错误 ——
  // 20000 被误判会直接让「明明换到了 token」变成登录失败。
  //
  // 反过来，真失败时 HTTP 仍是 200 + `{"code":20001,"data":"Access denied: not exists"}`。
  // 此时必须把上游的 code 与原始 message 如实带出：否则运维只能看到
  // 一句「缺少 access_token」，把「凭证没批下来」误判成「代码写错了」。
  const bizCode = data.code ?? data.Code;
  const accessToken = typeof inner.access_token === "string" ? inner.access_token : "";

  if (!accessToken && bizCode !== undefined && Number(bizCode) !== 20000) {
    const upstreamMsg = typeof data.data === "string" ? data.data : typeof data.message === "string" ? data.message : "";
    throw new ZhihuApiError({
      message: `token exchange rejected: code=${String(bizCode)}${upstreamMsg ? ` msg=${upstreamMsg}` : ""}`,
      kind: kindForCode(Number(bizCode)),
      code: Number(bizCode),
      endpoint: "oauth.token",
    });
  }

  if (!accessToken) {
    throw new ZhihuApiError({
      message: `token response missing access_token${bizCode !== undefined ? ` (code=${String(bizCode)})` : ""}`,
      kind: "parse",
      endpoint: "oauth.token",
    });
  }

  const rawExpires = inner.expires_in ?? inner.ExpiresIn;
  const expiresIn = Number.isFinite(Number(rawExpires)) ? Number(rawExpires) : 3600;
  const tokenType = typeof inner.token_type === "string" ? inner.token_type : "Bearer";
  return {
    accessToken,
    tokenType,
    expiresIn,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** 授权用户的公开信息。只保留展示需要的字段，其余一律丢弃。 */
export interface ZhihuUser {
  /** 知乎 url_token，用于拼个人主页地址 */
  id: string;
  /** 显示名 */
  name: string;
  /** 头像地址（可能为空，前端需有兜底） */
  avatarUrl?: string;
  /** 一句话介绍 */
  headline?: string;
  /** 个人主页地址 */
  url?: string;
  /**
   * 资料是否成功读到。
   * false = 只有 token 成功、昵称头像没取到（登录仍然算成功）。
   * 前端据此显示「已登录，但昵称暂时没读到」而不是假装拿到了。
   */
  profileLoaded?: boolean;
}

/**
 * `/user` 没成功时的降级信号。
 *
 * **不是错误**：token 已经换到了，登录本身成功。只是「顺带取资料」没成。
 * 单独建一个类是为了让上层能精确区分「登录失败」与「登录成功但资料缺失」。
 */
export class ZhihuUserDegraded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZhihuUserDegraded";
  }
}

/**
 * 取授权用户信息。
 *
 * ⚠️ 这条不是「拿 OAuth token 当 Bearer」的常规做法。官方参考实现
 * （zhihu-hackathon/assets/hello-world-oauth/lib/oauth.mjs）与
 * references/oauth.md 都写明：代表某个已授权用户调用用户数据接口时，
 * 必须**同时**带两个头 ——
 *
 *   Authorization: Bearer <开放平台 Access Secret>   ← 鉴权「调用方是我们」
 *   X-OAuth-Token:  <该用户的 OAuth access_token>    ← 指明「代表哪个用户」
 *
 * 少了 Access Secret 会被当成匿名调用方拒绝；把 OAuth token 当 Bearer
 * 则会被当成「用员工卡刷别人的门」。`app_key` 也不是 X-OAuth-Token。
 *
 * 当前文档没有给出 /user 的正式响应 schema，所以只做宽松读取，
 * 取不到就留空 —— 不编造字段（AGENTS.md §1.2）。
 */
export async function fetchUser(token: ZhihuToken): Promise<ZhihuUser> {
  const accessSecret = process.env.ZHIHU_ACCESS_SECRET?.trim() || "";
  // 没配 Access Secret 就退回单头调用：可能失败，但失败会如实抛出，
  // 不会伪造出一个用户。
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-OAuth-Token": token.accessToken,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    Authorization: accessSecret ? `Bearer ${accessSecret}` : `${token.tokenType} ${token.accessToken}`,
  };

  let res: Response;
  try {
    res = await fetch(OAUTH_USER, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // 网络层失败同理降级：token 已在手，不该被一次取资料的超时拖垮登录。
    throw new ZhihuUserDegraded(
      `user fetch network failure: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // ⚠️ 同一条纪律：`/user` 拿不到资料**不等于登录失败**。
    // 线上实测：带上正确的 Access Secret + 任意 token，`/user` 会直接回
    // HTTP 500（`<html>500: Internal Server Error</html>`）。若这里抛致命错，
    // 用户就永远登不进去 —— 而 token 明明已经换到了。
    // 所以整个「取资料」阶段的失败一律降级，只有「换 token」失败才致命。
    throw new ZhihuUserDegraded(
      `user fetch failed: ${res.status}${text ? ` body=${text.slice(0, 120)}` : ""}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    // 同上：非 JSON 响应也只是资料缺失。500 页面走 HTML 分支正是这种情况。
    throw new ZhihuUserDegraded(`user response not JSON (${text.slice(0, 120)})`);
  }

  // 业务成功码是 20000（不是 0，也不是 HTTP 200 的语义）——
  // 详见 references/oauth.md「已验证的协议偏差」。
  //
  // ⚠️ 关键修正（2026-09-15 线上实测）：
  // `/user` 失败**不能让整个登录失败**。走到这里时 token 已经换到了，登录
  // 事实上已经成功；只是「顺带取昵称头像」这一步没成功而已。
  // 官方参考实现（assets/hello-world-oauth/lib/oauth.mjs）正是这么处理的：
  //   try { profile = await ... } catch { profile = null }
  // 之前这里直接 throw，导致用户授权后被弹「知乎开放平台暂时不可用」，
  // 表现为「点了授权但登不进去」。
  const bizCode = data.code ?? data.Code;
  if (bizCode !== undefined && Number(bizCode) !== 20000) {
    const upstreamMsg =
      typeof data.data === "string" ? data.data : typeof data.message === "string" ? data.message : "";
    // 不抛异常，改抛一个「可降级」信号：用空身份返回，让上层决定如何展示。
    throw new ZhihuUserDegraded(
      `user response code ${String(bizCode)}${upstreamMsg ? ` msg=${upstreamMsg}` : ""}`,
    );
  }

  // 部分返回会包一层 data / Data。
  const inner = (data.data && typeof data.data === "object"
    ? data.data
    : data.Data && typeof data.Data === "object"
      ? data.Data
      : data) as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = inner[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };

  const id = pick("id", "url_token", "uid", "UrlToken");
  const name = pick("name", "nickname", "display_name", "Fullname", "fullname");
  // 同上：拿不到身份也只是资料缺失，不代表登录失败。
  if (!id && !name) {
    throw new ZhihuUserDegraded("user response missing identity");
  }

  return {
    id: id ?? name ?? "",
    name: name ?? id ?? "",
    avatarUrl: pick("avatar_url", "avatarUrl", "avatar", "AvatarUrl"),
    headline: pick("headline", "description", "Headline"),
    url: pick("url", "profile_url", "Url") ?? (id ? `https://www.zhihu.com/people/${id}` : undefined),
    profileLoaded: true,
  };
}
