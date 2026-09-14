"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ContributionEvent, MirrorQuestion } from "@/lib/domain/types";

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
  markHandoffOpened: (editorUrl: string) => void;
  confirmHandoff: () => void;
  applyHumanEdit: (answerId: string, body: string, author: string) => void;
  addContribution: (e: ContributionEvent) => void;
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

  const value = useMemo<Store>(
    () => ({ ...state, setMirror, markHandoffOpened, confirmHandoff, applyHumanEdit, addContribution, ready }),
    [state, setMirror, markHandoffOpened, confirmHandoff, applyHumanEdit, addContribution, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMirror(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMirror 必须在 MirrorProvider 内使用");
  return v;
}
