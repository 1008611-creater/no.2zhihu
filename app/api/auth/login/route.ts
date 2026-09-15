import { NextResponse } from "next/server";

import { authorizeUrl, hasOAuth, OAUTH_UNCONFIGURED_MESSAGE, resolveRedirectUri } from "@/lib/zhihu/oauth";
import { issueState } from "@/lib/zhihu/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发起知乎 OAuth 授权。
 *
 * 回调地址按「申请时登记过的白名单」来定：线上用 zhihu.cauai.fun，
 * 本地用 localhost:3000，两者都登记后这个接口会自动选对的那个（见 resolveRedirectUri）。
 *
 * 未配置凭证时返回 503 + 一句真话 —— 前端的登录按钮会把这句原样显示出来，
 * 而不是弹一个假的「登录成功」。这不是错误处理，是诚实性要求（AGENTS.md §1.4）。
 */
export async function GET(req: Request) {
  if (!hasOAuth()) {
    return NextResponse.json(
      { ok: false, error: OAUTH_UNCONFIGURED_MESSAGE, kind: "config" },
      { status: 503 },
    );
  }

  const redirectUri = resolveRedirectUri(req.url);
  const state = await issueState(redirectUri);
  return NextResponse.redirect(authorizeUrl(state, redirectUri));
}
