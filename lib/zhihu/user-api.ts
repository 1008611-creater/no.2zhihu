import "server-only";

import { ZhihuApiError } from "./errors";

/**
 * 知乎用户数据 API 客户端（OAuth 授权后代表用户读取）。
 *
 * 权威文档：zhihu-hackathon/assets/zhihu-cli-skill.zip → references/user-api.md
 * 参考实现：zhihu-hackathon/assets/hello-world-oauth/lib/oauth.mjs
 *
 * ⚠️ 三条最容易写错、写错还不报错的约定：
 *
 *   1. **双头鉴权**。Access Secret 鉴权「调用方是我们」，X-OAuth-Token 指明
 *      「代表哪个用户」。少前者 = 匿名调用方被拒；把 OAuth token 当 Bearer
 *      = 拿员工卡刷别人的门。app_key 从来不是 X-OAuth-Token。
 *
 *   2. **业务码是 0 才是成功**。注意这与 OAuth 的 /access_token、/user
 *      不同 —— 那两个用的是 20000。两套码值不能互相套用。
 *
 *   3. 域名是 `developer.zhihu.com`，不是 `openapi.zhihu.com`。
 *      openapi 只负责 authorize / access_token / user 三件事。
 */

const BASE = "https://developer.zhihu.com";
const TIMEOUT_MS = 15_000;

export interface UserApiResult<T> {
  ok: boolean;
  /** 成功时的条目；失败或空数据为 null。 */
  item: T | null;
  /** 成功但有数据 / 成功但无数据 / 失败，三态如实区分。 */
  status: "success" | "empty" | "error";
  message: string | null;
}

function accessSecret(): string {
  return process.env.ZHIHU_ACCESS_SECRET?.trim() || "";
}

function headers(oauthToken: string): Record<string, string> {
  const secret = accessSecret();
  if (!secret) {
    throw new ZhihuApiError({
      message: "ZHIHU_ACCESS_SECRET 未配置，无法调用用户数据接口",
      kind: "config",
      endpoint: "user",
    });
  }
  return {
    Authorization: `Bearer ${secret}`,
    "X-OAuth-Token": oauthToken,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    "Content-Type": "application/json",
  };
}

/** 取 Data.Items[0]，即「一条样本」。列表页不需要，但接口验证需要。 */
function firstItem(payload: Record<string, unknown>): Record<string, unknown> | null {
  const data = (payload.Data ?? payload.data) as Record<string, unknown> | undefined;
  const items = data?.Items ?? data?.items;
  return Array.isArray(items) && items.length > 0
    ? (items[0] as Record<string, unknown>)
    : null;
}

/**
 * 调一个用户数据接口，取第一条。
 *
 * 为什么统一只取一条：这些接口在本项目里的用途是「验证授权链路通了，
 * 且能读到这位用户自己的东西」—— 广场和 Mesh 用不到用户的完整历史。
 * 取一条既能证明链路，又把响应体控在最小。
 */
export async function fetchFirstItem(
  oauthToken: string,
  path: string,
  query: Record<string, string>,
): Promise<UserApiResult<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${new URLSearchParams(query)}`, {
      headers: headers(oauthToken),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    return { ok: false, item: null, status: "error", message: "网络请求失败" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, item: null, status: "error", message: `响应不是 JSON（HTTP ${res.status}）` };
  }

  // 用户数据接口的成功码是 0（OAuth 那两个接口是 20000，别混）。
  const code = Number(payload.Code ?? payload.code ?? 0);
  if (code !== 0) {
    const msg =
      typeof payload.Message === "string"
        ? payload.Message
        : typeof payload.message === "string"
          ? payload.message
          : `接口返回 Code ${code}`;
    return { ok: false, item: null, status: "error", message: msg };
  }

  if (!res.ok) {
    return { ok: false, item: null, status: "error", message: `HTTP ${res.status}` };
  }

  const item = firstItem(payload);
  // 成功但没数据是正常情况（新账号没有收藏夹），不算失败。
  return item
    ? { ok: true, item, status: "success", message: null }
    : { ok: true, item: null, status: "empty", message: "接口成功但没有数据。" };
}

/**
 * 逐项读取授权用户的公开数据。
 *
 * 收藏夹内容依赖第一条收藏夹的 UrlToken；没有收藏夹就跳过，
 * 记为 empty 而不是 error —— 空数据不等于故障（官方验收标准如此）。
 */
export async function fetchUserSnapshot(oauthToken: string) {
  const results: Array<{
    id: string;
    name: string;
    result: UserApiResult<Record<string, unknown>>;
  }> = [];

  // 显式标注，避免 TS 把各分支推断成互斥联合（可选键 vs undefined）
  const defs: Array<{ id: string; name: string; path: string; query: Record<string, string> }> = [
    {
      id: "contents",
      name: "我的创作",
      path: "/api/v1/user/contents",
      query: { ContentType: "all", Offset: "0", Limit: "1", SortField: "ts", SortOrder: "desc" },
    },
    { id: "followees", name: "我的关注", path: "/api/v1/user/followees", query: { Offset: "0", Limit: "1" } },
    { id: "favlists", name: "我的收藏夹", path: "/api/v1/user/favlists", query: { Limit: "1" } },
    { id: "collections", name: "近期收藏", path: "/api/v1/user/collections", query: { Limit: "1" } },
  ];

  for (const d of defs) {
    results.push({ id: d.id, name: d.name, result: await fetchFirstItem(oauthToken, d.path, d.query) });
  }

  return results;
}
