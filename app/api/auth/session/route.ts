import { NextResponse } from "next/server";

import { hasOAuth } from "@/lib/zhihu/oauth";
import { clearSession, getSession, getSessionWithToken } from "@/lib/zhihu/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 当前登录状态。
 *
 * 只回公开字段（昵称 / 头像 / 主页），access_token 永不外露。
 * `available` 告诉前端 OAuth 是否已开通 —— 未开通时前端显示「未开通」，
 * 而不是给一个点了报错的按钮。
 *
 * 2026-09-15 修正：这个接口原先只看签名 cookie，不看 token 还在不在。
 * 于是服务重启（本服务部署频繁，journalctl 实测 6 小时 23 次）清掉内存 token
 * 之后，这里仍然回一个 user，而 /api/auth/user-data 如实回 401 ——
 * 前端同时拿到「已登录」和「未登录」两个答案，用户看到的就是
 * 「明明登录了却什么都用不了」。现在以 token 为准：cookie 还在但 token 没了
 * 就等于未登录，并顺手清掉那个已经换不出任何东西的 cookie，
 * 让前端走正常的重新登录路径，而不是卡在中间态。
 *
 * `stateVerified` 如实回报：知乎当前的回调不回传 state，所以这里通常是
 * false。前端据此在界面上标注「未完成 CSRF 校验」，不谎称生产级安全。
 */
export async function GET() {
  const session = await getSession();
  // 「能用的登录」= cookie 有效 **且** token 还在。只有 cookie 不算。
  const withToken = session ? await getSessionWithToken() : null;

  if (session && !withToken) {
    await clearSession();
    return NextResponse.json({
      ok: true,
      available: hasOAuth(),
      user: null,
      signedIn: false,
      expired: true,
      stateVerified: false,
    });
  }

  return NextResponse.json({
    ok: true,
    available: hasOAuth(),
    user: session?.user ?? null,
    signedIn: Boolean(withToken),
    expired: false,
    stateVerified: session?.stateVerified ?? false,
  });
}

/** 退出登录。 */
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
