"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { KanshanStage } from "@/components/kanshan/KanshanStage";
import { FLOW_STATES } from "@/components/kanshan/states";

/**
 * 分身动态与搬运。
 *
 * 每条动态都是这场演示真实发生过的事件的回放：路由器选人、检索到几条证据、
 * 直答是否成功、看山标出的缺口、真人是否补充、搬运是否确认。
 * 没有事件就没有动态 —— 不用假数据填充时间线。
 */

type Kind = "route" | "evidence" | "answer" | "debate" | "invite" | "gap" | "human" | "handoff";

const KIND_META: Record<Kind, { label: string; accent: string }> = {
  route: { label: "Human Router", accent: "blue" },
  evidence: { label: "检索证据", accent: "blue" },
  answer: { label: "分身作答", accent: "violet" },
  debate: { label: "互相回应", accent: "violet" },
  invite: { label: "受邀加入", accent: "blue" },
  gap: { label: "缺口识别", accent: "orange" },
  human: { label: "真人补充", accent: "green" },
  handoff: { label: "搬运", accent: "green" }
};

interface Event {
  at: number;
  kind: Kind;
  who: string;
  text: string;
}

export default function FeedPage() {
  const { mirror, history, ready } = useMirror();
  const [step, setStep] = useState(FLOW_STATES.length);

  const events = useMemo<Event[]>(() => {
    const list: Event[] = [];
    for (const m of history) {
      list.push({ at: m.createdAt, kind: "route", who: "看山", text: m.routing.summary });
      for (const s of m.skills) {
        list.push({
          at: m.createdAt + 1,
          kind: "evidence",
          who: s.name,
          text: s.sources.length > 0
            ? "按「" + s.query + "」取回 " + s.sources.length + " 条真实知乎来源，证据覆盖 " + Math.round(s.confidence * 100) + "%"
            : "按「" + s.query + "」没有检索到公开来源，这个视角被标记为缺口"
        });
      }
      for (const a of m.answers) {
        list.push({
          at: a.createdAt,
          kind: "answer",
          who: a.skillName,
          text: a.generatedBy === "zhida"
            ? "由知乎直答模型基于 " + a.evidence.length + " 条证据生成回答（" + a.body.length + " 字）"
            : "直答未参与，仅保留 " + a.evidence.length + " 条检索来源"
        });
      }
      for (const a of m.answers.filter((x) => (x.round ?? 0) > 0)) {
        list.push({
          at: a.createdAt,
          kind: "debate",
          who: a.skillName,
          text: "回应了" + (a.replyToName ?? "另一位答主") + "：" + a.body.slice(0, 42) + (a.body.length > 42 ? "…" : "")
        });
      }
      for (const c of m.contributions) {
        if (c.reason.indexOf("受邀加入") === -1) continue;
        list.push({ at: c.at, kind: "invite", who: c.who, text: "被邀请进来，按自己的领域与说话方式回答了这个问题" });
      }
      for (const g of m.gaps) {
        list.push({
          at: m.createdAt + 2,
          kind: "gap",
          who: "看山",
          text: "发现" + g.kind + "缺口：「" + g.label + "」，严重度 " + Math.round(g.severity * 100) + "%"
        });
      }
      for (const a of m.answers.filter((x) => x.humanAuthor)) {
        list.push({ at: a.createdAt + 3, kind: "human", who: a.humanAuthor!, text: "补充了「" + a.skillName + "」这一篇的正文" });
      }
      if (m.handoff.status !== "not-ready") {
        list.push({
          at: m.handoff.confirmedAt ?? m.createdAt + 4,
          kind: "handoff",
          who: "你",
          text: m.handoff.status === "confirmed"
            ? "已在知乎编辑器完成搬运确认"
            : "已打开知乎编辑器深链，正文已复制到剪贴板"
        });
      }
    }
    return list.sort((a, b) => b.at - a.at);
  }, [history]);

  if (!ready) return <div className="skeleton" style={{ height: 320, marginTop: 44 }} />;

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">Agent feed</p>
        <h1 style={{ maxWidth: "20ch" }}>分身动态</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          这里只记录真实发生过的事件。评委可以看到每一次检索、每一次生成、
          每一个缺口和每一次真人补充，而不是一段被剪好的宣传片。
        </p>

        <div className="grid grid-2" style={{ marginTop: 24, alignItems: "start" }}>
          <div className="card">
            <p className="eyebrow">贡献值</p>
            <h3 style={{ marginBottom: 12 }}>谁让这张网变密了</h3>
            {mirror && mirror.contributions.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                {mirror.contributions.map((c, i) => (
                  <div key={i} className="card-flat" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="chip chip-green">+{c.delta}</span>
                    <div style={{ marginRight: "auto" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.who}</div>
                      <div className="dimmer" style={{ fontSize: 12 }}>{c.reason}</div>
                    </div>
                    <span className="mono dimmer">{new Date(c.at).toLocaleTimeString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="notice">
                还没有贡献记录。真人补充完内容后，这里会出现贡献值变化。
              </div>
            )}
            <hr className="divider" />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link className="btn btn-sm" href="/mirror">回到工作台</Link>
              <Link className="btn btn-sm btn-ghost" href="/fill">真人补充</Link>
            </div>
          </div>

          <KanshanStage step={step} running={false} size={158} />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>事件时间线</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>{events.length} 条</span>
        </div>

        {events.length === 0 && (
          <div className="notice">还没有事件。先在首页生成一个镜像问题。</div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {events.map((e, i) => {
            const meta = KIND_META[e.kind];
            return (
              <motion.div
                key={i}
                className="card-flat"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.6) }}
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <span className={"chip chip-" + meta.accent}>{meta.label}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{e.who}</div>
                  <div className="dim" style={{ fontSize: 13 }}>{e.text}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </>
  );
}
