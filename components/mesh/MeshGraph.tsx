"use client";

import { useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import { scaleSqrt } from 'd3-scale';
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
  }, [graph.nodes, graph.edges, cx, cy]);
  const radius = scaleSqrt().domain([0, Math.max(1, ...graph.nodes.map(n => n.weight))]).range([6, 16]);
  const point = (id: string) => offsets[id] ?? pos.get(id);
  const activeId = hover ?? selected;
  const detail = graph.nodes.find(n => n.id === selected);

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
        {[0.42, 0.62, 0.72, 0.86, 1].map((r) => (
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
              transition={{ duration: 0.7, delay: Math.min(i * 0.012, 0.5) }}
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
        </g>
      </svg>
      </div>
      {detail && <aside className="notice" aria-live="polite"><strong>{detail.label}</strong><p>类型：{detail.type} · 关联权重：{detail.weight.toFixed(2)} · {graph.edges.filter(e => e.source === detail.id || e.target === detail.id).length} 条关系</p><button className="btn" onClick={() => setSelected(null)}>关闭详情</button></aside>}

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
