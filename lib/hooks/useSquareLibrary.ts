"use client";

import { useCallback, useEffect, useState } from "react";
import { entriesOf, type LibraryEntry } from "@/lib/domain/library";

/**
 * 读取广场的数据源 `/square-library.json`。
 *
 * ## 为什么必须是三态，而不是「一个数组 + 空数组兜底」
 *
 * 改造前 `SquareField` 是这么写的：
 *
 *     fetch(...).then(...).catch(() => setLibrary([]))
 *
 * 于是**网络失败与「广场上真的没有讨论」在界面上长得一模一样** ——
 * 文件 404、部署漏传、断网，用户看到的都是「广场上还没有讨论。
 * 回首页问一个问题」。这句话是假的：广场上有 22 场讨论，只是没读出来。
 *
 * 所以这里把失败单独暴露成 `error`，由调用方如实说「没能加载」并给重试。
 * 空态只留给「确实一条都没有」这一种情况。
 *
 * 顺带一提：这个 JSON 是构建产物（`scripts/build-library.mjs` 生成），
 * 不是上游接口，所以**不消耗知乎额度**，重复请求也没有额度代价。
 *
 * ## 为什么还要一个超时兜底（2026-09-16 新增）
 *
 * 三态只覆盖「请求回来了、但它失败了」。还有一种情况是**请求根本没发出去** ——
 * 部署后旧 HTML 引用的 chunk 已被新构建删除时，`SquareField` 这段代码本身就
 * 没能加载，`useEffect` 不会执行，状态会**永远停在 `loading`**。
 *
 * 实测：线上把 HTML 里一个 chunk 换成已被删除的地址，页面显示
 * 「正在铺开广场…」**永不结束**，且 `app/error.tsx` 也不触发。
 *
 * 那一层由 `app/global-error.tsx` 负责（检测 `ChunkLoadError` → 自动重载一次）。
 * 这里加的定时器是**第二道防线**：万一错误类型没被识别、或边界没兜住，
 * 至少让用户看到一句真话 + 一个重试按钮，而不是无限转圈。
 */

export type LibraryState =
  | { status: "loading" }
  | { status: "ready"; entries: LibraryEntry[] }
  | { status: "error"; message: string };

/** 加载超时（毫秒）。本地 142KB 的 JSON 正常在百毫秒内读完，12 秒足够宽裕。 */
const LOAD_TIMEOUT_MS = 12_000;

export function useSquareLibrary(): LibraryState & { reload: () => void } {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setNonce((n) => n + 1);
  }, []);

  /**
   * 超时兜底 —— 防「永远转圈」。
   *
   * 只在**仍然是 loading** 时才改写状态，所以正常情况下它什么也不做
   * （成功/失败都会先把状态切走）。见文件头「为什么还要一个超时兜底」。
   */
  useEffect(() => {
    if (state.status !== "loading") return;
    const timer = window.setTimeout(() => {
      setState((cur) =>
        cur.status === "loading"
          ? {
              status: "error",
              message: "等待超过 " + LOAD_TIMEOUT_MS / 1000 + " 秒仍无响应",
            }
          : cur,
      );
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state.status, nonce]);

  useEffect(() => {
    let alive = true;
    fetch("/square-library.json")
      .then((r) => {
        // ⚠️ 必须显式判 `r.ok`：Next 的 404 会返回一个 HTML 错误页，
        // `r.json()` 会抛，但抛出来的信息是「Unexpected token '<'」——
        // 拿它当错误提示给用户看毫无意义。
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setState({ status: "ready", entries: entriesOf(d) });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "未知错误",
        });
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  return { ...state, reload };
}
