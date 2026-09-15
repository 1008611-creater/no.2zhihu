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
 */

export type LibraryState =
  | { status: "loading" }
  | { status: "ready"; entries: LibraryEntry[] }
  | { status: "error"; message: string };

export function useSquareLibrary(): LibraryState & { reload: () => void } {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setNonce((n) => n + 1);
  }, []);

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
