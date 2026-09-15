"use client";

import { useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { scaleSqrt } from 'd3-scale';
import { motion } from "motion/react";
import type { MeshGraph as Graph, MeshNode } from "@/lib/domain/types";
import { DUR, EASE, STAGGER } from "@/lib/motion/tokens";

/**
 * Human Mesh 可视化。
 *
 * 用确定性的同心布局（不是物理引擎），保证同一份数据每次渲染位置一致，
 * 评委截屏、录视频时结果可复现。真人在外环，Skill 在中环，问题在中心。
 *
 * 2026-09-15：布局参数改为可覆盖（rings / showLabels / legendLabels）。
 * 「我的 Mesh」要用同一套引擎画另一张网 —— 那张网的节点是
 * 「我提过的问题 × 领域关键词」，同心圈的语义完全不同（没有真人在外环），
 * 标签也该显示关键词而不是答主名。与其复制一份 SVG，不如把这三处差异
 * 变成显式入参；默认值仍是原来那张「一场问答」的图，调用点行为不变。
 */

const ACCENT: Record<string, string> = {
  blue: "#4d7cff",
  violet: "#8b5cf6",
  green: "#2fbf8f",
  orange: "#ff8a4c"
};

/** 默认同心圈：一场问答内部的关系图。 */
const DEFAULT_RING: Record<MeshNode["type"], number> = {
  question: 0,
  skill: 0.42,
  keyword: 0.62,
  answer: 0.72,
  // 人格节点：AI 这一侧的完整人格，比真人靠内一环，仍由真人来兜底。
  persona: 0.86,
  human: 1
};

/** 默认显示标签的节点类型 —— 全显示会糊成一片。 */
const DEFAULT_LABEL_TYPES: MeshNode["type"][] = ["question", "skill", "persona"];

/** 默认图例：只列真正出现过的类型，没出现的类型不再占一行。 */
const LEGEND_ORDER: Array<{ type: MeshNode["type"]; c: string; l: string }> = [
  { type: "question", c: "#4d7cff", l: "问题" },
  { type: "skill", c: "#8b5cf6", l: "Skill 分身" },
  { type: "persona", c: "#a78bfa", l: "答主人格" },
  { type: "human", c: "#2fbf8f", l: "真人" },
  { type: "keyword", c: "#ff8a4c", l: "关键词" },
  { type: "answer", c: "#ff8a4c", l: "回答" },
];

/** 环上标签按字数截断 —— 长标题横跨小半个圆，同环相邻两个必然叠在一起。 */
function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

export function MeshGraph({
  graph,
  height = 460,
  rings,
  showLabels,
  legendLabels,
  labelMaxChars = 16,
  layout = "organic",
}: {
  graph: Graph;
  height?: number;
  /** 覆盖同心圈半径（0 = 圆心）。未传的节点类型走默认。 */
  rings?: Partial<Record<MeshNode["type"], number>>;
  /** 覆盖显示文字的节点类型。 */
  showLabels?: MeshNode["type"][];
  /** 覆盖图例里的类型名（例如把 question 叫「我提过的问题」）。 */
  legendLabels?: Partial<Record<MeshNode["type"], string>>;
  /**
   * 标签最长字数，超出截断补省略号。
   *
   * 同心圈上的标签是水平居中排的，一条 20 字的问题标题能横跨小半个圆 ——
   * 同一环上相邻两个节点必然叠在一起。截断保证「一眼读得出是哪件事」，
   * 完整原文仍在悬停提示与点击详情里，信息没有丢。
   */
  labelMaxChars?: number;
  /**
   * 布局模式：
   *   organic —— 同心圆起手，再跑力导向微调（默认；节点少、想要一点自然感时用）。
   *   radial  —— 严格落在同心圆上，不跑力导向（节点多、要读「结构」时更规整）。
   *
   * 力导向会把连边两端的节点互相拉近，节点一多，同心圆就会被拉成偏心椭圆 ——
   * 「我的 Mesh」要读的恰恰是「哪一圈、多密」，所以那边显式选 radial。
   */
  layout?: "organic" | "radial";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string | null; x: number; y: number } | null>(null);

  const W = 720;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;

  const RING = useMemo<Record<MeshNode["type"], number>>(
    () => ({ ...DEFAULT_RING, ...(rings ?? {}) }),
    // rings 通常是模块级常量；用序列化结果做依赖，避免调用方内联对象导致每次重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(rings ?? null)],
  );

  const labelTypes = showLabels ?? DEFAULT_LABEL_TYPES;

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
    type Point = SimulationNodeDatum & { id: string; type: MeshNode['type'] };
    // radial：同心圆即最终位置，不再让力导向把环拉变形。
    if (layout === "radial") return map;
    const nodes: Point[] = graph.nodes.map(n => ({ id: n.id, type: n.type, ...map.get(n.id) }));
    const links = graph.edges.map(e => ({ source: e.source, target: e.target }));
    const simulation = forceSimulation(nodes).stop()
      .force('link', forceLink<Point, { source: string; target: string }>(links).id(n => n.id).distance(80).strength(.12))
      .force('charge', forceManyBody().strength(-35))
      .force('collide', forceCollide(23))
      .force('radial', forceRadial<Point>(n => RING[n.type] * 196, cx, cy).strength(.8));
    simulation.tick(100);
    simulation.stop();
    nodes.forEach(n => map.set(n.id, { x: n.x ?? cx, y: n.y ?? cy }));
    return map;
  }, [graph.nodes, graph.edges, cx, cy, RING, layout]);
  const radius = scaleSqrt().domain([0, Math.max(1, ...graph.nodes.map(n => n.weight))]).range([6, 16]);
  const point = (id: string) => offsets[id] ?? pos.get(id);
  const activeId = hover ?? selected;
  const detail = graph.nodes.find(n => n.id === selected);

  /** 只画真正用到的同心圈，不再固定画五条。 */
  const usedRings = useMemo(
    () => [...new Set(graph.nodes.map(n => RING[n.type] ?? 0.6))].filter(r => r > 0).sort((a, b) => a - b),
    [graph.nodes, RING],
  );

  const presentTypes = useMemo(() => new Set(graph.nodes.map(n => n.type)), [graph.nodes]);
  const legend = LEGEND_ORDER.filter(k => presentTypes.has(k.type));

  if (graph.nodes.length === 0) {
    return <div className="notice">还没有关系数据。</div>;
  }

  return (
    <div className="card" style={{ padding: 12, overflow: "hidden" }}>
      <div className="feedback-actions"><button className="btn" onClick={() => setZoom(z => Math.min(3, z + .2))} aria-label="放大关系图">放大</button><button className="btn" onClick={() => setZoom(z => Math.max(.5, z - .2))} aria-label="缩小关系图">缩小</button><button className="btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setOffsets({}); }}>重置布局</button></div>
      <div className="mesh-scroll">
      <svg ref={svgRef} className="mesh-interactive" viewBox={`0 0 ${W} ${H}`} width="100%" height={height} aria-label="Human Mesh 关系图，可拖动节点或背景"
        onPointerDown={e => { if (e.target === e.currentTarget) { drag.current = { id: null, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={e => {
          const current = drag.current; const svg = svgRef.current;
          if (!current || !svg) return;
          const matrix = svg.getScreenCTM()?.inverse();
          if (!matrix) return;
          const start = new DOMPoint(current.x, current.y).matrixTransform(matrix);
          const end = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
          const dx = (end.x - start.x) / zoom; const dy = (end.y - start.y) / zoom;
          if (current.id) { const p = point(current.id); if (p) setOffsets(old => ({ ...old, [current.id!]: { x: p.x + dx, y: p.y + dy } })); }
          else setPan(p => ({ x: p.x + dx, y: p.y + dy }));
          drag.current = { ...current, x: e.clientX, y: e.clientY };
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <g transform={`translate(${cx} ${cy}) scale(${zoom}) translate(${-cx + pan.x} ${-cy + pan.y})`}>
        <defs>
          <radialGradient id="mesh-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(77,124,255,0.34)" />
            <stop offset="100%" stopColor="rgba(77,124,255,0)" />
          </radialGradient>
        </defs>

        <circle cx={cx} cy={cy} r="200" fill="url(#mesh-core)" />
        {usedRings.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r * 196} fill="none" stroke="#1c2032" strokeDasharray="3 7" />
        ))}

        {graph.edges.map((e, i) => {
          const a = point(e.source);
          const b = point(e.target);
          if (!a || !b) return null;
          const active = activeId === e.source || activeId === e.target;
          return (
            <motion.line
              key={`${e.source}-${e.target}-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? "#93b0ff" : "#2b3044"}
              strokeWidth={active ? 1.8 : 1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: active ? 1 : 0.7 }}
              transition={{ duration: DUR.slower, delay: Math.min(i * STAGGER, 0.5) }}
            />
          );
        })}

        {graph.nodes.map((n, i) => {
          const p = point(n.id)!;
          const r = radius(n.weight);
          const active = activeId === n.id;
          return (
            <motion.g
              key={n.id}
              role="button" tabIndex={0} aria-label={`${n.label}，查看节点详情`}
              onClick={() => setSelected(n.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(n.id); } }}
              onPointerDown={e => { e.stopPropagation(); drag.current = { id: n.id, x: e.clientX, y: e.clientY }; svgRef.current?.setPointerCapture(e.pointerId); }}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.02, 0.6) }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer", originX: `${p.x}px`, originY: `${p.y}px` }}
            >
              {/* 悬停显示完整标签 —— 截断只影响画面，原文随时可查。 */}
              <title>{n.label}</title>
              <circle cx={p.x} cy={p.y} r={r + (active ? 5 : 0)} fill={ACCENT[n.accent] ?? "#4d7cff"} opacity={active ? 1 : 0.88} />
              <circle cx={p.x} cy={p.y} r={r + 6} fill="none" stroke={ACCENT[n.accent] ?? "#4d7cff"} strokeOpacity={active ? 0.6 : 0.22} />
              {(labelTypes.includes(n.type) || active) && (
                <text
                  x={p.x} y={p.y - r - 8}
                  textAnchor="middle"
                  fontSize={n.type === "question" ? 13 : 11}
                  fill={active ? "#f2f4fb" : "#8b93ad"}
                  fontWeight={n.type === "question" ? 700 : 600}
                >
                  {truncateLabel(n.label, labelMaxChars)}
                </text>
              )}
            </motion.g>
          );
        })}
        </g>
      </svg>
      </div>
      {detail && <aside className="notice" aria-live="polite"><strong>{detail.label}</strong><p>类型：{legendLabels?.[detail.type] ?? detail.type} · 关联权重：{detail.weight.toFixed(2)} · {graph.edges.filter(e => e.source === detail.id || e.target === detail.id).length} 条关系</p><button className="btn" onClick={() => setSelected(null)}>关闭详情</button></aside>}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "4px 10px 8px" }}>
        {legend.map((k) => (
          <span key={k.type} className="mono dimmer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: 999, background: k.c, display: "inline-block" }} />
            {legendLabels?.[k.type] ?? k.l}
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
