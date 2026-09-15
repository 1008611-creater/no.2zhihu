import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cookies } from "next/headers";
import type { ZhihuUser } from "./oauth";

/**
 * 登录会话：只存「谁登录了」这点公开信息，用签名 cookie 承载。
 *
 * 为什么不用数据库：P0 的镜像问题数据全在浏览器 localStorage，登录态也一样
 * 不需要持久服务端存储 —— 一个 HMAC 签名的 cookie 就够，且评审换机器也不受影响。
 *
 * 铁律：access_token 绝不进 cookie。它只活在回调那一次请求的内存里，
 * 用完即弃。cookie 里只有知乎用户 id / 昵称 / 头像，签个名防止篡改。
 */

const COOKIE_NAME = "zhihu_session";
const MAX_AGE_S = 60 * 60 * 24 * 7;

/** 签名密钥：优先专用 secret，退回 Access Secret（两者都只在服务端）。 */
function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.ZHIHU_ACCESS_SECRET?.trim() ||
    ""
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 防 CSRF 用的 state：一次性随机串，存在短时效 cookie 里。 */
export const OAUTH_STATE_COOKIE = "zhihu_oauth_state";
/** 发起授权时实际使用的 redirect_uri。换 token 必须回传完全相同的值。 */
export const OAUTH_REDIRECT_COOKIE = "zhihu_oauth_redirect";

export async function issueState(redirectUri: string): Promise<string> {
  const state = randomBytes(16).toString("base64url");
  const store = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  store.set(OAUTH_STATE_COOKIE, state, opts);
  store.set(OAUTH_REDIRECT_COOKIE, redirectUri, opts);
  return state;
}

/**
 * 校验回调带回的 state，并取回本次授权用的 redirect_uri；一次性。
 *
 * ⚠️ 知乎当前实测**不回传 state**（见官方 references/oauth.md「已验证的协议偏差」）。
 * 所以「没收到 state」既可能是 CSRF 攻击，也可能是平台的既定行为 —— 两者在
 * 回调这一层无法区分。产品上的处理是：不拦截登录，但把 stateVerified 记成
 * false 并在 UI 如实标注「未完成 CSRF 校验」，而不是假装安全。
 *
 * 返回值的 stateVerified 语义：
 *   true  = 收到了 state 且与 cookie 一致，校验通过；
 *   false = 完全没收到 state（平台现状，降级但放行）；
 *   "mismatch" = 收到了但对不上 —— 这才是真异常，调用方应拒绝本次登录。
 */
export async function consumeState(
  received: string | null,
): Promise<{ verified: boolean | "mismatch"; redirectUri: string }> {
  const store = await cookies();
  const expected = store.get(OAUTH_STATE_COOKIE)?.value;
  const redirectUri = store.get(OAUTH_REDIRECT_COOKIE)?.value ?? "";
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(OAUTH_REDIRECT_COOKIE);

  if (!received) return { verified: false, redirectUri };
  if (!expected) return { verified: "mismatch", redirectUri };

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return { verified: "mismatch", redirectUri };
  return { verified: timingSafeEqual(a, b), redirectUri };
}

export async function setSession(
  user: ZhihuUser,
  stateVerified: boolean,
  sessionId: string,
): Promise<void> {
  const payload = b64url(
    JSON.stringify({ u: user, sv: stateVerified, sid: sessionId, exp: Date.now() + MAX_AGE_S * 1000 }),
  );
  const sig = sign(payload);
  if (!sig) return; // 没有签名密钥时不写会话，宁可未登录也不写不可信数据。
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  // 退出时同时丢掉内存里的 token，不给下一个登录者留后门。
  const sid = await currentSessionId();
  dropToken(sid ?? undefined);
  store.delete(COOKIE_NAME);
}

/** 只取签名里的 sid，不校验用户结构 —— 供退出登录时清理 token 用。 */
async function currentSessionId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw.slice(0, dot), "base64url").toString("utf8"));
    return typeof parsed?.sid === "string" ? parsed.sid : null;
  } catch {
    return null;
  }
}

/**
 * 取「当前会话 + 它的 OAuth token」。
 *
 * 用户数据接口需要 token，而 token 只存在于服务端内存，所以调用方必须
 * 用这个组合函数一次拿到两者 —— 避免有人图省事把 token 塞进 cookie。
 */
export async function getSessionWithToken(): Promise<
  { user: ZhihuUser; stateVerified: boolean; accessToken: string } | null
> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  let parsed: { u?: ZhihuUser; sv?: boolean; exp?: number; sid?: string };
  try {
    parsed = JSON.parse(Buffer.from(raw.slice(0, dot), "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed.u || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;

  const accessToken = readToken(parsed.sid);
  if (!accessToken) return null; // 进程重启或 token 过期 —— 让前端重新登录。

  return { user: parsed.u, stateVerified: parsed.sv === true, accessToken };
}

/**
 * 读当前登录用户。签名不对、过期、结构不对一律返回 null。
 *
 * 除了「谁登录过」，还如实回报 `tokenValid`（现在是否还能取到数据）。
 * 这两件事必须分开说，因为 cookie 只能证明前者：
 *   · cookie 有效期 7 天，签名自证，服务重启不影响；
 *   · access_token 只活在进程内存，**服务一重启就没了**。
 * 不回报它的话，前端会显示「已登录」而每个取数请求都 401 ——
 * 用户看到的是一个自己解释不了的错误（实测踩过：一天重启 22 次，
 * 出现「/api/auth/session 200 带 user，但 /api/auth/user-data 401」）。
 * 所以这里如实回报，让 UI 能说清「登录已过期，请重新登录」。
 *
 * 为什么不把 token 持久化来解决：知乎**不支持 refresh_token**（官方文档 0 处提及），
 * access_token 本身只有 1 小时有效期。落盘只能把可用窗口从「到下次重启」
 * 延到「1 小时」，却要把用户的钥匙写进硬盘。收益有限、代价是安全边界，
 * 不值得 —— 宁可让他重新点一次登录。
 */
export async function getSession(): Promise<
  { user: ZhihuUser; stateVerified: boolean; tokenValid: boolean } | null
> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  const expected = sign(payload);
  if (!expected) return null;
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { u?: ZhihuUser; sv?: boolean; exp?: number; sid?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed.u || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
  return {
    user: parsed.u,
    stateVerified: parsed.sv === true,
    tokenValid: readToken(parsed.sid) !== null,
  };
}

/* ---------------------------------------------------------------------------
 * OAuth access token 的暂存（内存 + 加密落盘）
 *
 * 为什么不写进 cookie：cookie 会到浏览器。access_token 代表「这位用户的
 * 全部授权」，一旦下发到客户端就等于把钥匙给了前端 —— 铁律禁止。
 *
 * 2026-09-15 修正：原先只放进程内存，当时的假设是「重启即失效，用户重新点
 * 一次登录即可」。实测这个假设不成立 ——
 *   · 本服务部署极频繁（journalctl：6 小时 23 次重启，全是主动 Stopping）；
 *   · 每次重启清空内存 token，而 session cookie 有 7 天寿命；
 *   · 两者寿命不一致 → 用户卡在「顶栏显示已登录、一用就 401」的半登录态。
 * 现在额外加密落盘，让 token 跨重启存活（仍受它自身 1 小时有效期约束）。
 *
 * 安全边界：文件用 AES-256-GCM 加密、权限 0600，密钥由 SESSION_SECRET 派生，
 * 不额外引入配置项；磁盘不可写或密钥缺失时静默退回纯内存，不阻断登录。
 * 仍然不做的事：token 绝不进 cookie、绝不回传前端。
 * ------------------------------------------------------------------------- */

interface TokenEntry {
  accessToken: string;
  expiresAt: number;
}

/** 落盘路径：默认 <cwd>/.data/，可用 ZHIHU_TOKEN_FILE 覆盖。 */
const TOKEN_FILE =
  process.env.ZHIHU_TOKEN_FILE?.trim() || join(process.cwd(), ".data", "zhihu-tokens.json");

/** 内存缓存（快路径）；持久化文件是它的后备。 */
const TOKENS = new Map<string, TokenEntry>();

let diskLoaded = false;

/** 密钥由会话签名密钥派生 —— 同一个 secret 管两件事，少一个配置项。 */
function tokenCipherKey(): Buffer | null {
  const secret = sessionSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update("no2zhihu-token-store-v1").digest();
}

/** 首次读取时把磁盘上的条目解密回内存；单条解不开就跳过，不影响其余条目。 */
function loadTokensFromDisk(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  const key = tokenCipherKey();
  if (!key) return;
  try {
    if (!existsSync(TOKEN_FILE)) return;
    const raw = JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as Record<
      string,
      { iv: string; tag: string; data: string }
    >;
    const now = Date.now();
    for (const [sid, box] of Object.entries(raw)) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64url"));
        decipher.setAuthTag(Buffer.from(box.tag, "base64url"));
        const plain = Buffer.concat([
          decipher.update(Buffer.from(box.data, "base64url")),
          decipher.final(),
        ]).toString("utf8");
        const entry = JSON.parse(plain) as TokenEntry;
        if (entry.expiresAt > now) TOKENS.set(sid, entry);
      } catch {
        // 密钥轮换过或文件被改动 → 这条解不开，跳过即可。
      }
    }
  } catch {
    // 文件损坏 / 不可读 → 退回纯内存，不阻断登录。
  }
}

/** 原子写回（先写临时文件再 rename），避免半写把好数据弄坏。 */
function saveTokensToDisk(): void {
  const key = tokenCipherKey();
  if (!key) return;
  try {
    const out: Record<string, { iv: string; tag: string; data: string }> = {};
    for (const [sid, entry] of TOKENS) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(entry), "utf8"), cipher.final()]);
      out[sid] = {
        iv: iv.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
        data: data.toString("base64url"),
      };
    }
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    const tmp = `${TOKEN_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
    renameSync(tmp, TOKEN_FILE);
  } catch {
    // 磁盘不可写 → 降级为纯内存，不阻断登录。
  }
}

/** 登录成功后存下 token，返回会话 id（写进签名的 cookie）。 */
export function storeToken(accessToken: string, expiresAt: number): string {
  loadTokensFromDisk();
  const sid = randomBytes(18).toString("base64url");
  TOKENS.set(sid, { accessToken, expiresAt });
  purgeExpiredTokens();
  saveTokensToDisk();
  return sid;
}

/** 按会话 id 取 token；过期即视为不存在，并顺手清掉。 */
export function readToken(sid: string | undefined): string | null {
  if (!sid) return null;
  loadTokensFromDisk();
  const entry = TOKENS.get(sid);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    TOKENS.delete(sid);
    saveTokensToDisk();
    return null;
  }
  return entry.accessToken;
}

export function dropToken(sid: string | undefined): void {
  if (!sid) return;
  loadTokensFromDisk();
  TOKENS.delete(sid);
  saveTokensToDisk();
}

/** 清掉已过期的条目，避免长时间运行后内存无限增长。 */
function purgeExpiredTokens(): void {
  const now = Date.now();
  for (const [id, entry] of TOKENS) {
    if (entry.expiresAt <= now) TOKENS.delete(id);
  }
}
