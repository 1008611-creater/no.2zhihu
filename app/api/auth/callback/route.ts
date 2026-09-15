import { NextResponse } from "next/server";

import {
  exchangeCode,
  fetchUser,
  hasOAuth,
  OAUTH_UNCONFIGURED_MESSAGE,
  publicOrigin,
  ZhihuUserDegraded,
} from "@/lib/zhihu/oauth";
import { consumeState, setSession, storeToken } from "@/lib/zhihu/session";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth 回调。
 *
 * 三处与「标准 OAuth」不同，都按官方实测为准：
 *   1. 授权码在 `authorization_code` 查询参数里，不是标准的 `code`。
 *      两种都接受，但以 `authorization_code` 为主路径。
 *   2. 知乎当前**不回传 state**。所以「没收到 state」放行并如实标注
 *      未完成 CSRF 校验；只有「收到了但对不上」才拒绝（那才是真异常）。
 *   3. redirect_uri 必须与发起授权时完全一致，从 cookie 取回，不重新推导。
 *
 * 无论成功失败都重定向回 /me?tab=mesh 并带上结果，不让用户卡在纯文本错误页上。
 * ⚠️ 落地页必须是 /me?tab=mesh，不能是 /mesh —— PR #9 之后 /mesh 变成了
 *    redirect("/me?tab=mesh")，重定向会丢掉 auth / authError 参数，
 *    于是「登录成功没有确认、登录失败没有原因」。
 * 全程在服务端完成 —— app_key 和 access_token 一次都不会出现在 URL 或前端。
 *
 * ⚠️ 回跳地址的 origin 用 `publicOrigin()` 推导，**不能用 `url.origin`**：
 * 反代后面 `req.url` 的 host 是 `localhost:3000`，会把用户跳到不存在的地址。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("authorization_code") ?? url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const back = (params: Record<string, string>) => {
    const to = new URL("/me?tab=mesh", publicOrigin(req.url));
    Object.entries(params).forEach(([k, v]) => to.searchParams.set(k, v));
    return NextResponse.redirect(to);
  };

  if (errorParam) return back({ authError: "用户在知乎取消了授权。" });
  if (!hasOAuth()) return back({ authError: OAUTH_UNCONFIGURED_MESSAGE });
  if (!code) return back({ authError: "知乎没有返回授权码。" });

  const stateCheck = await consumeState(state);
  // 对不上 = 有伪造嫌疑，直接拒绝；没收到 = 平台现状，降级放行。
  if (stateCheck.verified === "mismatch") {
    return back({ authError: "授权状态校验失败，请重新登录。" });
  }

  try {
    const token = await exchangeCode(code, stateCheck.redirectUri);
    // token 进展程内存（换一个不透明 sid），cookie 里只放 sid —— 钥匙不进浏览器。
    const sid = storeToken(token.accessToken, token.expiresAt);

    // ⚠️ 取资料失败**不算登录失败**：token 已经到手，登录事实上成功了。
    // 官方参考实现就是这么降级的（try/catch 后把 profile 置空）。
    // 之前把它当致命错误，导致用户授权后被弹「暂时不可用」= 登不进去。
    let user;
    let profileDegraded = false;
    try {
      user = await fetchUser(token);
    } catch (err) {
      if (!(err instanceof ZhihuUserDegraded)) throw err;
      // 降级：身份用占位，登录照常建立，但如实告诉前端「昵称没读到」。
      profileDegraded = true;
      user = { id: "", name: "知乎用户", profileLoaded: false };
    }

    await setSession(user, stateCheck.verified === true, sid);
    // 到这里 access_token 只活在服务端内存，URL 与前端都没出现过。
    return back({
      auth: user.name,
      ...(stateCheck.verified === true ? {} : { authNote: "state" }),
      ...(profileDegraded ? { authNoteProfile: "1" } : {}),
    });
  } catch (err) {
    const message =
      err instanceof ZhihuApiError ? err.userMessage : "知乎登录失败，请稍后重试。";
    return back({ authError: message });
  }
}
