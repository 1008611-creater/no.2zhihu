"use client";

import PersonaCard from "@/components/mirror/PersonaCard";
import type { PersonaCandidate } from "@/lib/domain/router";

/**
 * 答主选择器。
 *
 * 同一个组件被两处复用：
 *   - 首页「选择答主」步骤（提问之后、生成之前）
 *   - 镜像工作台的「邀请一个分身」抽屉（生成之后继续加人）
 *
 * 两处用同一套卡片，评委在两个阶段看到的是同一份人格资产，认知成本为零。
 */
export function PersonaPicker({
  candidates,
  selected,
  onToggle,
  excludeHandles = [],
  emptyHint,
}: {
  candidates: PersonaCandidate[];
  selected: string[];
  onToggle: (handle: string) => void;
  /** 已经在场上的答主不再展示（用于「继续邀请」）。 */
  excludeHandles?: string[];
  emptyHint?: string;
}) {
  const list = candidates.filter((c) => !excludeHandles.includes(c.handle));

  if (list.length === 0) {
    return <div className="notice">{emptyHint ?? "名册里的答主都已经在场上了。"}</div>;
  }

  return (
    <div className="grid grid-3">
      {list.map((c, i) => (
        <PersonaCard
          key={c.handle}
          candidate={c}
          index={i}
          selected={selected.includes(c.handle)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export default PersonaPicker;
