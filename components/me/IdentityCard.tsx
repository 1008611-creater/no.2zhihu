"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/hooks/useSession";

/**
 * 「我的」页的身份区。
 *
 * 三态必须分清楚，这是这一块存在的全部意义：
 *   · 已登录 —— 显示真实授权的 @昵称 与头像；
 *   · 已开通未登录 —— 显示登录按钮；
 *   · 未开通 —— 如实说明凭证未申请，同时保留本机昵称这条退路，不让页面残废。
 *
 * 会话状态由调用方（/me 页）统一 hook 一次再传进来 —— 这一块和「我的 Mesh」
 * 里的知乎数据面板都要用它，各自 hook 一次就会打两遍 /api/auth/session。
 */

export const ME_KEY = "no2zhihu:me";

interface Props {
  /** OAuth 回调带回的一次性提示（由 /me 页解析 URL 后传入）。 */
  notice: { kind: "ok" | "err"; text: string } | null;
  session: {
    user: SessionUser | null;
    available: boolean;
    stateVerified: boolean;
    /** cookie 没过期 ≠ 还能取数据：服务端 token 会随进程重启消失。 */
    tokenValid: boolean;
    loading: boolean;
    login: () => void;
    logout: () => void | Promise<void>;
  };
}

export default function IdentityCard({ notice, session }: Props) {
  const { user, available, stateVerified, tokenValid, loading, login, logout } = session;
  /** 未登录时的本机昵称 —— 数据本来就全在本机，不必强制登录。 */
  const [fallbackName, setFallbackName] = useState("");

  useEffect(() => {
    setFallbackName(window.localStorage.getItem(ME_KEY) ?? "");
  }, []);

  const saveFallbackName = (v: string) => {
    setFallbackName(v);
    window.localStorage.setItem(ME_KEY, v);
  };

  return (
    <>
      {notice && (
        <div
          className={"notice " + (notice.kind === "ok" ? "notice-info" : "notice-warn")}
          style={{ marginTop: 22 }}
        >
          {notice.text}
        </div>
      )}

      <div
        className="card"
        style={{ marginTop: notice ? 12 : 24, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
      >
        {loading ? (
          <div className="skeleton" style={{ height: 48, flex: 1, minWidth: 240 }} />
        ) : user ? (
          <>
            <span className="avatar" aria-hidden>
              {user.avatarUrl ? (
                // 知乎头像域名不固定，用原生 img 避免 next/image 的域名白名单问题。
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" width={44} height={44} />
              ) : (
                <span className="avatar-fallback">{user.name.slice(0, 1)}</span>
              )}
            </span>
            <div style={{ marginRight: "auto", minWidth: 200 }}>
              <p className="eyebrow" style={{ marginBottom: 5 }}>已用知乎账号登录</p>
              <div style={{ fontWeight: 700, fontSize: 17 }}>@{user.name}</div>
              {user.headline && (
                <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{user.headline}</div>
              )}
            </div>
            {user.url && (
              <a className="link mono" href={user.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12 }}>
                知乎主页
              </a>
            )}
            <button className="btn btn-ghost" onClick={logout}>退出登录</button>
          </>
        ) : (
          <>
            <div style={{ marginRight: "auto", minWidth: 220 }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>我的身份</p>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {available ? "用知乎账号登录，这些分身和这张网就挂在你的名字下" : "填一个昵称，这些分身和这张网就归你了"}
              </div>
            </div>
            {available ? (
              <button className="btn btn-primary" onClick={login}>用知乎账号登录 →</button>
            ) : (
              <input
                className="field"
                style={{ maxWidth: 240, padding: "10px 12px", minHeight: 0, width: "auto" }}
                value={fallbackName}
                onChange={(e) => saveFallbackName(e.target.value)}
                placeholder="你的昵称"
                aria-label="你的昵称"
              />
            )}
          </>
        )}
      </div>

      {!loading && !available && (
        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
          知乎 OAuth 登录尚未开通：需先向 openplatform@zhihu.com 申请 app_id / app_key。
          当前身份只保存在本机浏览器，不假装已登录。
        </p>
      )}

      {/* 登录成功但平台没回传 state —— 这是知乎的现状，如实标注，不谎称安全。 */}
      {!loading && user && !stateVerified && (
        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
          知乎授权回调当前不回传 state 参数，因此本次登录未完成标准的 CSRF 校验。
          如实标注，不把它当作「生产级安全登录」。
        </p>
      )}

      {/* cookie 还在、服务端 token 已经没了（服务重启，或满 1 小时）。
          这时「已登录」是个空壳 —— 任何取数请求都会 401，而用户看不出原因。
          如实说清，并给一次点击就能重新授权的入口。 */}
      {!loading && user && !tokenValid && (
        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
          登录已过期：知乎 access_token 只保存在服务端内存（有效期 1 小时，且平台不提供
          refresh_token），服务重启后即失效。请重新登录以继续读取你的知乎数据。
        </p>
      )}
    </>
  );
}
