"use client";

import { useEffect, useState } from "react";
import FeedStream, { type FeedScope } from "@/components/square/FeedStream";

/**
 * 虚拟广场。
 *
 * 广场是**所有提问的归宿**：别人问过的、以及我问过的，都在这里封存。
 * 提出一个问题之后，它不会在首页反复出现，而是落到这里；想重新进去看，
 * 就点「我曾经提问过的」。
 *
 * 为什么把两个视图做成同一页的筛选而不是两个页面：
 * 它们读的是同一份数据（history + 库），只是过滤条件不同。分成两页会让
 * 「我刚提的问题去哪了」变成一次跳转猜测；放在一起，切一下就能对照。
 *
 * 所以这里不做任何介绍、不留说明小字 —— 进来就是流。
 */

type Filter = "all" | "mine";

export default function SquarePage() {
  const [filter, setFilter] = useState<Filter>("all");

  // 支持 /square?filter=mine 直接落在「我曾经提问过的」上（其它页面可深链过来）。
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("filter") === "mine") setFilter("mine");
  }, []);

  const scope: FeedScope = filter === "mine" ? "mine" : "all";

  return (
    <section style={{ paddingTop: 40 }}>
      <h1 className="no-tail" style={{ marginBottom: 20 }}>
        {filter === "mine" ? (
          <>
            我曾经
            <br />
            提问过的
          </>
        ) : (
          <>
            这座虚拟知乎里
            <br />
            已经讨论过的事
          </>
        )}
      </h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }} role="tablist" aria-label="广场筛选">
        {(
          [
            { k: "all", label: "全部" },
            { k: "mine", label: "我曾经提问过的" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={filter === t.k}
            className="chip"
            style={{
              cursor: "pointer",
              ...(filter === t.k ? { borderColor: "var(--blue)", color: "var(--blue-soft)" } : {}),
            }}
            onClick={() => setFilter(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FeedStream hotLimit={20} scope={scope} />
    </section>
  );
}
