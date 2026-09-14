"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { MeshGraph as Graph, MeshNode } from "@/lib/domain/types";

/**
 * Human Mesh 可视化。
 *
 * 用确定性的同心布局（不是物理引擎），保证同一份数据每次渲染位置一致，
 * 评委截屏、录视频时结果可复现。真人在外环，Skill 在中环，问题在中心。
 */

const ACCENT: Record<string, string> = {
  blue: "#4d7cff",
  violet: "#8b5cf6",
  green: "#2fbf8f",
  orange: "#ff8a4c"
};

const RING: Record<MeshNode["type"], number> = {
  question: 0,
  skill: 0.42,
  keyword: 0.62,
  answer: 0.72,
  // 人格节点：AI 这一侧的完整人格，比真人靠内一环，仍由真人来兜底。
  persona: 0.86,
  human: 1
};

export function MeshGraph({ graph, height = 460 }: { graph: Graph; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);

  const W = 720;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;

  const pos = useMemo(() => {
    const byRing = new Map<number, MeshNode[]>();
    for (const n of graph.nodes) {
      const r = RING[n.type] ?? 0.6;
      if (!byRing.has(r)) byRing.set(r, []);
      byRing.get(r)!.push(n);
    }
    const map = new Map<string, { x: number; y: number }>();
    for (const [r, list] of byRing) {
      if (r === 0) {
        for (const n of list) map.set(n.id, { x: cx, y: cy });
        continue;
      }
      const radius = r * 196;
      list.forEach((n, i) => {
        const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2 + r * 1.7;
        map.set(n.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
      });
    }
    return map;
  }, [graph.nodes, cx, cy]);

  if (graph.nodes.length === 0) {
    return <div className="notice">还没有关系数据。</div>;
  }

  return (
    <div className="card" style={{ padding: 12, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label="Human Mesh 关系图">
        <defs>
          <radialGradient id="mesh-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(77,124,255,0.34)" />
            <stop offset="100%" stopColor="rgba(77,124,255,0)" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r="200" fill="url(#mesh-core)" />
        {[0.42, 0.62, 0.72, 0.86, 1].map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r * 196} fill="none" stroke="#1c2032" strokeDasharray="3 7" />
        ))}

        {graph.edges.map((e, i) => {
          const a = pos.get(e.source);
          const b = pos.get(e.target);
          if (!a || !b) return null;
          const active = hover === e.source || hover === e.target;
          return (
            <motion.line
              key={`${e.source}-${e.target}-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? "#93b0ff" : "#2b3044"}
              strokeWidth={active ? 1.8 : 1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: active ? 1 : 0.7 }}
              transition={{ duration: 0.7, delay: Math.min(i * 0.012, 0.5) }}
            />
          );
        })}

        {graph.nodes.map((n, i) => {
          const p = pos.get(n.id)!;
          const r = n.type === "question" ? 16 : n.type === "skill" ? 12 : n.type === "persona" ? 10 : n.type === "human" ? 9 : 6;
          const active = hover === n.id;
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.34, delay: Math.min(i * 0.02, 0.6) }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer", originX: `${p.x}px`, originY: `${p.y}px` }}
            >
              <circle cx={p.x} cy={p.y} r={r + (active ? 5 : 0)} fill={ACCENT[n.accent] ?? "#4d7cff"} opacity={active ? 1 : 0.88} />
              <circle cx={p.x} cy={p.y} r={r + 6} fill="none" stroke={ACCENT[n.accent] ?? "#4d7cff"} strokeOpacity={active ? 0.6 : 0.22} />
              {(n.type === "question" || n.type === "skill" || n.type === "persona" || active) && (
                <text
                  x={p.x} y={p.y - r - 8}
                  textAnchor="middle"
                  fontSize={n.type === "question" ? 13 : 11}
                  fill={active ? "#f2f4fb" : "#8b93ad"}
                  fontWeight={n.type === "question" ? 700 : 600}
                >
                  {n.label}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "4px 10px 8px" }}>
        {[
          { c: "#4d7cff", l: "问题" },
          { c: "#8b5cf6", l: "Skill 分身" },
          { c: "#a78bfa", l: "答主人格" },
          { c: "#2fbf8f", l: "真人" },
          { c: "#ff8a4c", l: "关键词 / 回答" }
        ].map((k) => (
          <span key={k.l} className="mono dimmer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: 999, background: k.c, display: "inline-block" }} />
            {k.l}
          </span>
        ))}
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {graph.nodes.length} 节点 · {graph.edges.length} 条关系
        </span>
      </div>
    </div>
  );
}

export default MeshGraph;
