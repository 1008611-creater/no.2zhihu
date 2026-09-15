"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import MeshGraph from "@/components/mesh/MeshGraph";
import { useMirror } from "@/lib/store/mirror-store";
import { buildMesh } from "@/lib/domain/mesh";
import CountUp from '@/components/ui/CountUp';

/**
 * Human Mesh 总览。
 *
 * 图完全由真实数据编译：问题来自用户输入或知乎链接，Skill 来自 Human Router，
 * 真人节点只来自知乎公开回答的作者（不是编造的画像），边代表「因为什么连在一起」。
 */

export default function MeshPage() {
  const { mirror, history, ready } = useMirror();

  const graphs = useMemo(
    () => history.map((m) => ({ mirror: m, graph: buildMesh(m) })),
    [history]
  );

  if (!ready) return <div className="skeleton" style={{ height: 380, marginTop: 44 }} />;

  if (!mirror || graphs.length === 0) {
    return (
      <section style={{ paddingTop: 56 }}>
        <p className="eyebrow">Human mesh</p>
        <h1>还没有关系数据</h1>
        <p className="lede" style={{ marginTop: 14 }}>
          Mesh 需要至少一个镜像问题。先去首页输入一个问题，看山会把问题、分身、关键词、
          回答和真实作者连成一张图。
        </p>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 20 }}>去首页提一个问题</Link>
      </section>
    );
  }

  const current = graphs[0];
  const totals = graphs.reduce(
    (acc, g) => ({
      nodes: acc.nodes + g.graph.nodes.length,
      edges: acc.edges + g.graph.edges.length,
      humans: acc.humans + g.graph.nodes.filter((n) => n.type === "human").length,
      keywords: acc.keywords + g.graph.nodes.filter((n) => n.type === "keyword").length
    }),
    { nodes: 0, edges: 0, humans: 0, keywords: 0 }
  );

  const humans = current.graph.nodes.filter((n) => n.type === "human");

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">Human mesh</p>
        <h1 style={{ maxWidth: "20ch" }}>人与分身的关系图</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          中心是问题，中环是 Skill 分身与关键词，外环是在知乎真实写过相关内容的作者。
          每条边都来自一次真实检索或一次真人补充。
        </p>

        <div className="grid grid-4" style={{ marginTop: 24 }}>
          {[
            { n: totals.nodes, l: "节点" },
            { n: totals.edges, l: "关系边" },
            { n: totals.humans, l: "真实作者节点" },
            { n: totals.keywords, l: "关键词节点" }
          ].map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n"><CountUp value={s.n} /></div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{current.mirror.title}</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>
            {current.graph.nodes.length} 节点 · {current.graph.edges.length} 关系
          </span>
        </div>
        <MeshGraph graph={current.graph} height={520} />
      </section>

      {humans.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>被连进来的真实作者</h2>
            <p className="dim" style={{ fontSize: 13.5 }}>
              这些节点全部来自知乎公开回答的作者字段，可以点开核对原文。
            </p>
          </div>
          <div className="grid grid-3">
            {humans.map((h, i) => (
              <motion.div
                key={h.id}
                className="card-flat"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 8 }}>
                  <span className="chip chip-green">真人</span>
                  <strong style={{ fontSize: 14 }}>{h.label}</strong>
                </div>
                <div className="dimmer mono" style={{ fontSize: 11 }}>
                  关联权重 {h.weight.toFixed(2)} · 出现在 {current.graph.edges.filter((e) => e.source === h.id || e.target === h.id).length} 条关系里
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {graphs.length > 1 && (
        <section className="section">
          <div className="section-head"><h2>本场其他镜像问题</h2></div>
          <div style={{ display: "grid", gap: 12 }}>
            {graphs.slice(1).map((g) => (
              <div key={g.mirror.id} className="card-flat" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span className="chip chip-blue">{g.mirror.routing.intent}</span>
                <strong style={{ fontSize: 14, marginRight: "auto" }}>{g.mirror.title}</strong>
                <span className="mono dimmer">{g.graph.nodes.length} 节点 · {g.graph.edges.length} 关系</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
