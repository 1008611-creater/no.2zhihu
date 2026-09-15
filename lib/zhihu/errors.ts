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
    // OAuth 换 token 失败要单独说清楚 —— 20001 在 OAuth 场景下几乎总是
    // 「app_id 还没被知乎侧开通」，而不是 Access Secret 过期。混用同一句
    // 文案会把「等平台审批」误导成「去改密钥」。
    if (this.endpoint === "oauth.token" && this.kind === "auth") {
      return `知乎 OAuth 登录未开通：平台未识别当前 app_id（code=${this.code ?? "?"}）。请确认应用是否已在 openplatform@zhihu.com 申请通过、且回调地址与登记值完全一致。`;
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
