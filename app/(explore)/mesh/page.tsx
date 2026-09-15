"use client";

import { useEffect, useMemo, useState } from "react";
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

const ME_KEY = "no2zhihu:me";

export default function MeshPage() {
  const { mirror, history, ready } = useMirror();
  // 身份暂存在本机浏览器：知乎 OAuth 还没接，先让每位评审看到「自己那张网」。
  const [me, setMe] = useState("");

  useEffect(() => {
    setMe(window.localStorage.getItem(ME_KEY) ?? "");
  }, []);

  const saveMe = (v: string) => {
    setMe(v);
    window.localStorage.setItem(ME_KEY, v);
  };

  const graphs = useMemo(
    () => history.map((m) => ({ mirror: m, graph: buildMesh(m) })),
    [history]
  );

  /**
   * 我的分身答过哪些问题。
   *
   * 把本场所有镜像问题里出现过的分身按 handle 聚合 —— 同一位答主可能在多个问题里
   * 都被邀请过，这里就能看出「谁是我最常用的分身」。
   */
  const myPersonas = useMemo(() => {
    const map = new Map<string, { handle: string; name: string; accent: string; questions: string[] }>();
    history.forEach((m) => {
      m.skills.forEach((s) => {
        const handle = s.persona?.handle ?? s.id;
        const entry =
          map.get(handle) ?? {
            handle,
            name: s.persona?.displayName ?? s.name,
            accent: s.accent ?? "blue",
            questions: [],
          };
        if (!entry.questions.includes(m.title)) entry.questions.push(m.title);
        map.set(handle, entry);
      });
    });
    return [...map.values()].sort((a, b) => b.questions.length - a.questions.length);
  }, [history]);

  if (!ready) return <div className="skeleton" style={{ height: 380, marginTop: 44 }} />;

  // 身份区必须在「有没有关系数据」之前渲染 —— 没有数据时，更要让人先看到这是「自己的」网。
  const identityBlock = (
    <>
      <div
        className="card"
        style={{ marginTop: 22, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}
      >
        <div style={{ marginRight: "auto", minWidth: 220 }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>我的身份</p>
          <div className="dim" style={{ fontSize: 12.5 }}>
            填一个昵称，这张网就归你了 —— 下面会列出你的分身答过哪些问题。
          </div>
        </div>
        <input
          className="field"
          style={{ maxWidth: 240, padding: "10px 12px", minHeight: 0 }}
          value={me}
          onChange={(e) => saveMe(e.target.value)}
          placeholder="你的知乎昵称"
          aria-label="你的知乎昵称"
        />
      </div>
      <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
        当前身份只保存在本机浏览器；知乎 OAuth 登录尚未接入，这里如实说明，不假装已登录。
      </p>
    </>
  );

  if (!mirror || graphs.length === 0) {
    return (
      <section style={{ paddingTop: 56 }}>
        <p className="eyebrow">My human mesh</p>
        <h1 style={{ maxWidth: "22ch" }}>{me ? `@${me} 的分身网络` : "你的 Human Mesh"}</h1>
        <p className="lede" style={{ marginTop: 14, maxWidth: "62ch" }}>
          这张网从「你是谁」开始。填一个昵称，之后你邀请过的每一位分身、每一次真人接管，
          都会挂到这张网上。
        </p>

        {identityBlock}

        <div className="notice" style={{ marginTop: 18 }}>
          还没有关系数据。先去首页提一个问题，看山会把问题、分身、关键词、回答和真实作者连成一张图。
        </div>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 18 }}>
          去首页提一个问题
        </Link>
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
        <p className="eyebrow">My human mesh</p>
        <h1 style={{ maxWidth: "22ch" }}>
          {me ? `@${me} 的分身网络` : "人与分身的关系图"}
        </h1>
        <p className="lede" style={{ marginTop: 16 }}>
          中心是问题，中环是 Skill 分身与关键词，外环是在知乎真实写过相关内容的作者。
          每条边都来自一次真实检索或一次真人补充。
        </p>

        {identityBlock}

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

      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">My personas</p>
            <h2>我的分身，答过哪些问题</h2>
          </div>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>
            {myPersonas.length} 位分身 · {history.length} 个问题
          </span>
        </div>

        {myPersonas.length === 0 ? (
          <div className="notice">还没有分身参与过。先去首页提一个问题。</div>
        ) : (
          <div className="grid grid-3">
            {myPersonas.map((p, i) => (
              <motion.div
                key={p.handle}
                className="card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.4) }}
              >
                <div className={"accent-bar a-" + p.accent} />
                <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{p.name}</h3>
                  <span className="persona-mono">@{p.handle}</span>
                </div>
                <div className="lbl" style={{ marginTop: 12 }}>
                  答过 {p.questions.length} 个问题
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {p.questions.map((q) => (
                    <div key={q} className="dim" style={{ fontSize: 12.5 }}>
                      · {q}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <Link className="link mono" style={{ fontSize: 11.5 }} href={"/?persona=" + p.handle}>
                    带他答新问题 →
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
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
