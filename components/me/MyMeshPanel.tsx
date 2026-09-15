"use client";

import Link from "next/link";
import { useMemo } from "react";
import MeshGraph from "@/components/mesh/MeshGraph";
import MineHandoffPanel from "@/components/mesh/MineHandoffPanel";
import UserZhihuPanel from "@/components/mesh/UserZhihuPanel";
import CountUp from "@/components/ui/CountUp";
import { buildCorpusMesh } from "@/lib/domain/mesh";
import type { SessionUser } from "@/lib/hooks/useSession";
import type { MeshNode, MirrorQuestion } from "@/lib/domain/types";

/**
 * 我的 Mesh —— 一张只讲「我创作过什么」的网。
 *
 * 节点两类：我提过的每一个问题（内容），以及它们所属的领域关键词。
 * 边是「这个问题属于这个领域」。出现得越多的领域，节点越大。
 *
 * 2026-09-15 瘦身：原先这一页混着三块**清单**，全部移走 ——
 *   · 「已经有分身的答主」 —— 那是「分身发现」的职责（看人）；
 *   · 「连进这张网的真实作者」 —— 同上，而且它只是名字罗列，不是这张网的结构；
 *   · 「我的其他镜像问题」 —— 那是广场「我曾经提问过的」的职责（重进某一场）。
 * 三块都是列表，摆在图旁边只会让「我创作了什么」这个主题失焦：
 * 进来的人想知道的是「我关心的事情长成什么形状」，不是又一份名单。
 *
 * 图仍然是这一块的核心，并且只保留两类节点 —— 读者一眼能读出的东西，
 * 比塞满六种节点更有信息量。
 */

/** 同心圈：我提过的问题在内环，领域关键词在外环。 */
const CORPUS_RINGS: Partial<Record<MeshNode["type"], number>> = {
  question: 0.32,
  keyword: 0.78,
};

/** 这两类节点的名字必须看得见 —— 图要读的就是它们。 */
const CORPUS_LABELS: MeshNode["type"][] = ["question", "keyword"];

const CORPUS_LEGEND: Partial<Record<MeshNode["type"], string>> = {
  question: "我提过的问题",
  keyword: "所属领域关键词",
};

export default function MyMeshPanel({
  history,
  user,
}: {
  history: MirrorQuestion[];
  user: SessionUser | null;
}) {
  const graph = useMemo(() => buildCorpusMesh(history), [history]);

  const totals = useMemo(
    () => ({
      questions: graph.nodes.filter((n) => n.type === "question").length,
      keywords: graph.nodes.filter((n) => n.type === "keyword").length,
      edges: graph.edges.length,
      answers: history.reduce((n, m) => n + m.answers.length, 0),
    }),
    [graph, history],
  );

  /** 还没搬回知乎的分身回答篇数 —— 用作搬运入口的可见提示。 */
  const pendingHandoff = useMemo(
    () =>
      history.reduce(
        (n, m) =>
          n +
          (m.handoff?.status === "confirmed"
            ? 0
            : m.answers.filter((a) => a.status !== "human" && a.status !== "handed-off").length),
        0,
      ),
    [history],
  );

  if (history.length === 0) {
    return (
      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">My mesh</p>
            <h2 className="no-tail">我的 Mesh</h2>
          </div>
        </div>
        <div className="notice">
          还没有创作记录。先去提一个问题，你问过的问题与它们所属的领域会在这里长成一张网。
        </div>
        <Link className="btn btn-primary" href="/" style={{ marginTop: 18 }}>
          去提一个问题
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">My mesh</p>
            <h2 className="no-tail">我创作过什么，落在哪些领域</h2>
          </div>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>
            {totals.questions} 个问题 · {totals.keywords} 个领域
          </span>
        </div>

        <div className="grid grid-4" style={{ marginBottom: 22 }}>
          {[
            { n: totals.questions, l: "我提过的问题" },
            { n: totals.keywords, l: "所属领域关键词" },
            { n: totals.answers, l: "分身回答" },
            { n: totals.edges, l: "关系边" },
          ].map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n">
                <CountUp value={s.n} />
              </div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {pendingHandoff > 0 && (
          <a
            className="card-flat"
            href="#handoff-mine"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 22,
              textDecoration: "none",
              color: "inherit",
              borderColor: "rgba(77,124,255,0.34)",
            }}
          >
            <span className="chip chip-blue">待搬运</span>
            <strong style={{ fontSize: 14, marginRight: "auto" }}>
              {pendingHandoff} 篇分身回答还没搬回知乎
            </strong>
            <span className="link mono" style={{ fontSize: 12 }}>去一键发布 →</span>
          </a>
        )}

        <MeshGraph
          graph={graph}
          height={520}
          rings={CORPUS_RINGS}
          showLabels={CORPUS_LABELS}
          legendLabels={CORPUS_LEGEND}
        />

        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 12 }}>
          内环是我提过的问题，外环是它们所属的领域关键词；某个领域被越多问题命中，节点越大。
        </p>
      </section>

      {user && <UserZhihuPanel userId={user.id || user.name} />}

      <MineHandoffPanel history={history} />
    </>
  );
}
