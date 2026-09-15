export type ZhihuErrorKind =
  | "config"
  | "auth"
  | "quota"
  | "rate_limit"
  | "risk_control"
  | "bad_request"
  | "upstream"
  | "network"
  | "parse";

const KIND_BY_CODE: Record<number, ZhihuErrorKind> = {
  10001: "bad_request",
  20001: "auth",
  30001: "rate_limit",
  30002: "quota",
  30003: "risk_control",
  90001: "upstream",
};

export class ZhihuApiError extends Error {
  readonly kind: ZhihuErrorKind;
  readonly code?: number;
  readonly status?: number;
  readonly endpoint: string;

  constructor(opts: {
    message: string;
    kind: ZhihuErrorKind;
    endpoint: string;
    code?: number;
    status?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ZhihuApiError";
    this.kind = opts.kind;
    this.code = opts.code;
    this.status = opts.status;
    this.endpoint = opts.endpoint;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  /** 面向用户的降级文案，前端可直接展示。 */
  get userMessage(): string {
    // OAuth 换 token 失败要单独说清楚 —— 泛泛一句「请检查 Access Secret」
    // 会把好几种完全不同的原因混为一谈。
    //
    // 2026-09-15 线上实测定下三种语义（都在 `message` 里，格式 `... msg=...`）：
    //   - `code is expired`        → 授权码超时（用户来回折腾太久），重登即可
    //   - `not exists`             → 授权码不存在 / 已被用过，重登即可
    //   - `missing parameter: xxx` → 我们请求少传了字段，是代码问题
    //   - `Invalid ...` 其它       → 按上游原话展示
    // **不要再写「app_id 未开通」**：实测真实授权码返回的是 `code is expired`
    // 而非 `not exists`，证明 app_id 是有效的（无效 app_id 根本发不出 code）。
    if (this.endpoint === "oauth.token" && this.kind === "auth") {
      const raw = this.message.replace(/^token exchange rejected:\s*/, "");
      const detail = raw.includes("msg=") ? raw.slice(raw.indexOf("msg=") + 4) : raw;
      if (/expired/i.test(detail)) return "登录授权码已过期（授权过程太久）。请再点一次「知乎登录」。";
      if (/not exists/i.test(detail)) return "这次登录的授权码已失效或已使用过。请再点一次「知乎登录」。";
      if (/missing parameter/i.test(detail)) return `知乎拒绝了换 token 请求：${detail}。这是本站的配置问题，可直接反馈。`;
      return `知乎 OAuth 换 token 失败：${detail || `code=${this.code ?? "?"}`}。请把这句话截图反馈。`;
    }
    switch (this.kind) {
      case "config":
        return "服务端尚未配置知乎开放平台凭证，当前为只读降级模式。";
      case "auth":
        return "知乎开放平台鉴权失败，请检查 Access Secret 是否已更换。";
      case "quota":
        return "今日调用额度已用尽，请稍后再试。";
      case "rate_limit":
        return "请求过于频繁，请稍后再试。";
      case "risk_control":
        return "该请求被平台风控拦截。";
      case "bad_request":
        return "请求参数不被平台接受。";
      case "network":
        return "网络连接知乎开放平台失败，请稍后重试。";
      case "parse":
        return "平台返回内容无法解析。";
      default:
        return "知乎开放平台暂时不可用，请稍后重试。";
    }
  }
}

export function kindForCode(code: number): ZhihuErrorKind {
  return KIND_BY_CODE[code] ?? "upstream";
}
