"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "motion/react";
import { personaCandidates } from "@/lib/domain/router";
import { DISCUSSION_TOPICS } from "@/lib/domain/topics";
import { DUR, EASE } from "@/lib/motion/tokens";
import type { Accent, MirrorQuestion } from "@/lib/domain/types";

/**
 * 「我的分身」—— 我请过的分身，各自答过哪些问题。
 *
 * 它是一份**记录**，不是操作台：这里只回答「谁、替我答过什么」，不挂任何
 * 「带他去答新问题」式的导流按钮 —— 要再问一次，回首页重新提问。
 *
 * 空态必须给出下一步而不是一句「暂无数据」：新用户刚进「我的」时什么都没答过，
 * 干看着一句空话就走了。所以空态直接推荐「一条问题 + 一位最合适的答主」，
 * 点一下带 ?auto=1 回首页自动跑完 —— 用户在这里只做一个选择，不用再去点选人、
 * 点确认。选完回来，记录就有了。
 */

/** 空态推荐几条「适合先跑一轮」的问题。 */
const STARTER_COUNT = 3;

interface PersonaRecord {
  handle: string;
  name: string;
  accent: Accent;
  questions: string[];
}

export default function MyPersonasPanel({ history }: { history: MirrorQuestion[] }) {
  /** 我的分身答过哪些问题（按 handle 聚合本机全部镜像问题）。 */
  const myPersonas = useMemo<PersonaRecord[]>(() => {
    const map = new Map<string, PersonaRecord>();
    history.forEach((m) => {
      m.skills.forEach((s) => {
        const handle = s.persona?.handle ?? s.id;
        const entry =
          map.get(handle) ??
          {
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

  /** 空态推荐：一条问题配一位最合适的答主。 */
  const starters = useMemo(
    () =>
      DISCUSSION_TOPICS.slice(0, STARTER_COUNT)
        .map((question) => {
          const ranked = personaCandidates(question);
          // 命中率过低时说明这条问题没有对口答主，换一位也不合适 —— 直接跳过。
          const pick = ranked.find((c) => !c.weakMatch) ?? ranked[0];
          return pick ? { question, pick } : null;
        })
        .filter((x): x is { question: string; pick: ReturnType<typeof personaCandidates>[number] } => x !== null),
    [],
  );

  if (myPersonas.length === 0) {
    return (
      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">My personas</p>
            <h2 className="no-tail">我的分身</h2>
          </div>
        </div>

        <div className="card" style={{ borderColor: "rgba(77,124,255,0.35)" }}>
          <h3 style={{ marginBottom: 10 }}>暂时还没有，要不要让你的分身回答一个？</h3>
          <p className="dim" style={{ fontSize: 13.5, maxWidth: "62ch" }}>
            下面这几条问题都有对口的答主。点一下，他会自动答完，记录就会出现在这里。
          </p>

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {starters.map(({ question, pick }) => (
              <Link
                key={question}
                href={
                  "/?q=" +
                  encodeURIComponent(question) +
                  "&persona=" +
                  encodeURIComponent(pick.handle) +
                  "&auto=1"
                }
                className="card-flat"
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span className={"chip chip-" + pick.accent}>{pick.displayName}</span>
                <strong style={{ fontSize: 14, marginRight: "auto" }}>{question}</strong>
                <span className="link mono" style={{ fontSize: 12 }}>
                  一键让他自动回答 →
                </span>
              </Link>
            ))}
          </div>

          <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 14 }}>
            答主是按问题的领域自动挑的，不是随机分配。也可以去「分身发现」自己指定。
          </p>
        </div>
      </section>
    );
  }

  const totalQuestions = new Set(history.map((m) => m.title)).size;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <p className="eyebrow">My personas</p>
          <h2 className="no-tail">我的分身，答过哪些问题</h2>
        </div>
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {myPersonas.length} 位分身 · {totalQuestions} 个问题
        </span>
      </div>

      <div className="grid grid-3">
        {myPersonas.map((p, i) => (
          <motion.div
            key={p.handle}
            className="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.05, 0.4) }}
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
          </motion.div>
        ))}
      </div>
    </section>
  );
}
