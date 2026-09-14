"use client";

import { useEffect, useState } from "react";

interface QuotaItem {
  APIID: string;
  APIName: string;
  RemainingQuota: number;
  TotalQuota: number;
}

const SHOW = ["zhihu_search", "hot_list", "zhida_openai", "question_answers"];

/** 顶部额度提示：让评委看到这是真实接口在跑，而不是假数据。 */
export function QuotaBadge() {
  const [items, setItems] = useState<QuotaItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/zhihu/quota")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) setItems(((d.data ?? []) as QuotaItem[]).filter((i) => SHOW.includes(i.APIID)));
        else setErr(d.error);
      })
      .catch(() => alive && setErr("额度不可用"));
    return () => { alive = false; };
  }, []);

  if (err) return <span className="chip chip-orange">知乎接口降级</span>;
  if (!items) return <span className="chip mono">额度读取中…</span>;
  if (items.length === 0) return <span className="chip chip-orange">额度未知</span>;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((i) => (
        <span key={i.APIID} className="chip mono" title={`${i.APIName} 剩余 ${i.RemainingQuota}/${i.TotalQuota}`}>
          {i.APIName} {i.RemainingQuota}
        </span>
      ))}
    </div>
  );
}

export default QuotaBadge;
