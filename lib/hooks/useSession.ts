"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 知乎登录状态。
 *
 * 为什么不做成 Context：只有顶栏和 Mesh 页要用，两处各自 hook 一次即可，
 * 少一层 Provider 就少一处可能忘记包裹的地方。
 *
 * 服务端未配置 OAuth 时 `available` 为 false —— 界面必须如实显示「未开通」，
 * 不给一个点下去必然报错的按钮。
 */

export interface SessionUser {
  id: string;
  name: string;
  avatarUrl?: string;
  headline?: string;
  url?: string;
}

interface SessionState {
  user: SessionUser | null;
  available: boolean;
  /**
   * 是否通过了标准的 CSRF state 校验。
   *
   * 知乎当前的回调不回传 state，所以登录成功后这里通常仍是 false。
   * UI 必须如实标注，不把「降级放行」说成「安全登录」。
   */
  stateVerified: boolean;
  loading: boolean;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    user: null,
    available: false,
    stateVerified: false,
    loading: true,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = await res.json();
      setState({
        user: data?.user ?? null,
        available: Boolean(data?.available),
        stateVerified: Boolean(data?.stateVerified),
        loading: false,
      });
    } catch {
      setState({ user: null, available: false, stateVerified: false, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      /* 本地状态照样清掉，服务端失败不该让按钮卡住 */
    }
    setState((s) => ({ ...s, user: null, stateVerified: false }));
  }, []);

  /** 跳去知乎授权页。用整页跳转而不是 fetch —— 授权页不受 CORS 约束。 */
  const login = useCallback(() => {
    window.location.href = "/api/auth/login";
  }, []);

  return { ...state, login, logout, refresh };
}
