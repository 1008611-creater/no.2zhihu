import { NextResponse } from "next/server";

import { hasOAuth } from "@/lib/zhihu/oauth";
import { clearSession, getSession } from "@/lib/zhihu/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 当前登录状态。
 *
 * 只回公开字段（昵称 / 头像 / 主页），access_token 永不外露。
 * `available` 告诉前端 OAuth 是否已开通 —— 未开通时前端显示「未开通」，
 * 而不是给一个点了报错的按钮。
 *
 * `stateVerified` 如实回报：知乎当前的回调不回传 state，所以这里通常是
 * false。前端据此在界面上标注「未完成 CSRF 校验」，不谎称生产级安全。
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    ok: true,
    available: hasOAuth(),
    user: session?.user ?? null,
    stateVerified: session?.stateVerified ?? false,
  });
}

/** 退出登录。 */
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
