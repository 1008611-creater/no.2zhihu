"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AnswerDraft, ContributionEvent, MirrorQuestion, Skill } from "@/lib/domain/types";

/**
 * 会话内的镜像问题存储。
 *
 * P0 为了让评委零配置体验，数据保存在浏览器本地（localStorage），不依赖数据库。
 * 换成 Postgres/SQLite 时只需替换这一层，领域模型形状不变。
 */

const KEY = "no.2zhihu:mirror:v1";
const MAX_HISTORY = 12;

interface Persisted {
  mirror: MirrorQuestion | null;
  history: MirrorQuestion[];
}

interface Store extends Persisted {
  setMirror: (m: MirrorQuestion | null) => void;
  /**
   * 按 mirror id 标记搬运状态。
   *
   * 为什么需要带 id 的版本：搬运面板已经从「作答工作台」搬到了「我的 Mesh」，
   * 而 Mesh 上是一份**跨全部历史问题**的清单 —— 用户可以搬第 3 个问题而不是
   * 当前 mirror 指向的那一场。原来只作用于 `state.mirror` 的写法在这种场景下
   * 会把状态记到错的那一场上。
   */
  markHandoffOpenedFor: (mirrorId: string, editorUrl: string) => void;
  confirmHandoffFor: (mirrorId: string) => void;
  applyHumanEdit: (answerId: string, body: string, author: string) => void;
  addContribution: (e: ContributionEvent) => void;
  /** 继续邀请：把新答主与他的回答追加进当前镜像问题，不重跑已有分身。 */
  appendInvite: (skill: Skill, answer: AnswerDraft) => void;
  /** 一轮互相回应：把回应追加到回答列表（round=1）。 */
  appendReplies: (replies: AnswerDraft[]) => void;
  ready: boolean;
}

const Ctx = createContext<Store | null>(null);

function persist(state: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mirror: state.mirror, history: state.history.slice(0, MAX_HISTORY) }));
  } catch {
    /* 存储不可用时只保留内存状态 */
  }
}

export function MirrorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>({ mirror: null, history: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        setState({ mirror: parsed.mirror ?? null, history: parsed.history ?? [] });
      }
    } catch {
      /* 忽略损坏的本地数据 */
    }
    setReady(true);
  }, []);

  /** 统一的写入口：同步更新 mirror、history 并落盘。 */
  const commit = useCallback((fn: (cur: MirrorQuestion) => MirrorQuestion) => {
    setState((cur) => {
      if (!cur.mirror) return cur;
      const next = fn(cur.mirror);
      const nextState: Persisted = {
        mirror: next,
        history: [next, ...cur.history.filter((x) => x.id !== next.id)].slice(0, MAX_HISTORY)
      };
      persist(nextState);
      return nextState;
    });
  }, []);

  const setMirror = useCallback((m: MirrorQuestion | null) => {
    setState((cur) => {
      const nextState: Persisted = m
        ? { mirror: m, history: [m, ...cur.history.filter((x) => x.id !== m.id)].slice(0, MAX_HISTORY) }
        : { mirror: null, history: cur.history };
      persist(nextState);
      return nextState;
    });
  }, []);

  const markHandoffOpened = useCallback((editorUrl: string) => {
    commit((m) => ({ ...m, handoff: { ...m.handoff, status: "opened", editorUrl } }));
  }, [commit]);

  /**
   * 按 id 定位到 history 里的任意一场，而不是只改 `state.mirror`。
   * 「我的 Mesh」上的搬运清单是跨问题，必须能精确落到用户点的那一场。
   */
  const commitById = useCallback((mirrorId: string, fn: (m: MirrorQuestion) => MirrorQuestion) => {
    setState((cur) => {
      const target = cur.history.find((m) => m.id === mirrorId) ?? (cur.mirror?.id === mirrorId ? cur.mirror : null);
      if (!target) return cur;
      const next = fn(target);
      const nextState: Persisted = {
        mirror: cur.mirror?.id === mirrorId ? next : cur.mirror,
        history: [next, ...cur.history.filter((x) => x.id !== mirrorId)].slice(0, MAX_HISTORY),
      };
      persist(nextState);
      return nextState;
    });
  }, []);

  const markHandoffOpenedFor = useCallback((mirrorId: string, editorUrl: string) => {
    commitById(mirrorId, (m) => ({ ...m, handoff: { ...m.handoff, status: "opened", editorUrl } }));
  }, [commitById]);

  const confirmHandoffFor = useCallback((mirrorId: string) => {
    commitById(mirrorId, (m) => ({
      ...m,
      handoff: {
        ...m.handoff,
        status: "confirmed",
        confirmedAt: Date.now(),
        note: "你已在知乎确认搬运。开放平台没有写入接口，发布动作由你本人完成。",
      },
      answers: m.answers.map((a) => (a.status === "human" ? { ...a, status: "handed-off" as const } : a)),
      contributions: [
        ...m.contributions,
        { at: Date.now(), who: "你", delta: 12, reason: "把自己的分身回答搬运回真实知乎" },
      ],
    }));
  }, [commitById]);

  const confirmHandoff = useCallback(() => {
    commit((m) => ({
      ...m,
      handoff: {
        ...m.handoff,
        status: "confirmed",
        confirmedAt: Date.now(),
        note: "你已在知乎编辑器内确认搬运。开放平台没有写入接口，发布动作由你本人完成。"
      },
      answers: m.answers.map((a) => (a.status === "human" ? { ...a, status: "handed-off" as const } : a)),
      contributions: [
        ...m.contributions,
        { at: Date.now(), who: "你", delta: 12, reason: "把真人补充搬运回真实知乎" }
      ]
    }));
  }, [commit]);

  const applyHumanEdit = useCallback((answerId: string, body: string, author: string) => {
    commit((m) => {
      let filled = false;
      const gaps = m.gaps.map((g) => {
        if (g.filledBy || filled) return g;
        filled = true;
        return { ...g, filledBy: author };
      });
      return {
        ...m,
        answers: m.answers.map((a) =>
          a.id === answerId ? { ...a, body, status: "human" as const, humanAuthor: author } : a
        ),
        gaps,
        handoff: { ...m.handoff, status: "ready", note: "真人已补充，可以搬运回知乎了。" },
        contributions: [
          ...m.contributions,
          { at: Date.now(), who: author, delta: 8, reason: "补充了 AI 答不出的那一段" }
        ]
      };
    });
  }, [commit]);

  const addContribution = useCallback((e: ContributionEvent) => {
    commit((m) => ({ ...m, contributions: [...m.contributions, e] }));
  }, [commit]);

  /**
   * 继续邀请一位答主。
   *
   * 三条纪律：同名不重复加人；同 id 的回答不重复追加；追加后按加入顺序重排，
   * 让新来的那位永远在最后 —— 用户「再加一个人进来看看」的直觉顺序。
   */
  const appendInvite = useCallback((skill: Skill, answer: AnswerDraft) => {
    commit((m) => {
      const skills = m.skills.some((s) => s.id === skill.id) ? m.skills : [...m.skills, skill];
      const answers = m.answers.some((a) => a.id === answer.id) ? m.answers : [...m.answers, answer];
      return {
        ...m,
        skills,
        answers,
        contributions: [
          ...m.contributions,
          { at: Date.now(), who: skill.name, delta: 5, reason: "受邀加入，回答了这个问题" },
        ],
      };
    });
  }, [commit]);

  const appendReplies = useCallback((replies: AnswerDraft[]) => {
    if (replies.length === 0) return;
    commit((m) => {
      const seen = new Set(m.answers.map((a) => a.id));
      const fresh = replies.filter((r) => !seen.has(r.id));
      if (fresh.length === 0) return m;
      return { ...m, answers: [...m.answers, ...fresh] };
    });
  }, [commit]);

  const value = useMemo<Store>(
    () => ({ ...state, setMirror, markHandoffOpenedFor, confirmHandoffFor, applyHumanEdit, addContribution, appendInvite, appendReplies, ready }),
    [state, setMirror, markHandoffOpenedFor, confirmHandoffFor, applyHumanEdit, addContribution, appendInvite, appendReplies, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMirror(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMirror 必须在 MirrorProvider 内使用");
  return v;
}
