"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { normalizeMirror, normalizeMirrorList, normalizeAnswer, type StoredAnswer } from "@/lib/domain/mirror-normalize";
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

/**
 * 落盘。
 *
 * ⚠️ 出盘前统一过一遍 `normalizeMirror` —— 这是**所有写入的唯一收口**，
 * 放在这里等于一条不变量：**磁盘上永远不存在结构残缺的镜像**。
 * 起因见 lib/domain/mirror-normalize.ts 的文件头（互相回应缺 evidence
 * 导致 /mirror 白屏，而且已经写进了用户 localStorage）。
 * 只补结构、不编内容，所以对正常数据是恒等变换，代价是一次浅拷贝。
 */
function persist(state: Persisted): void {
  try {
    const clean: Persisted = {
      mirror: state.mirror ? normalizeMirror(state.mirror) : null,
      history: normalizeMirrorList(state.history.slice(0, MAX_HISTORY)),
    };
    localStorage.setItem(KEY, JSON.stringify(clean));
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
        // 读盘也过一遍：修复**已经**落盘的残缺数据（用户不必手动清缓存）。
        // 与 persist 里的那次是同一函数，幂等，正常数据无变化。
        const clean: Persisted = {
          mirror: parsed.mirror ? normalizeMirror(parsed.mirror) : null,
          history: normalizeMirrorList(parsed.history ?? []),
        };
        setState(clean);
        // 只有真的改动了才写回 —— 让「磁盘上不留残缺数据」这条不变量成立，
        // 又不在每次打开页面时白写一遍（15KB 级别，虽然不贵但没必要）。
        // 比较用的是序列化结果：normalize 保留键顺序，没改动时两者逐字节相同。
        const next = JSON.stringify(clean);
        if (next !== raw) localStorage.setItem(KEY, next);
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
      // 标记「分身自己写的那几篇」为已搬运。
      // 这里必须是 ai 而不是 human：human 是真人补充段，本来就不在搬运清单里
      // （见 MineHandoffPanel.toItem 的过滤条件），标它属于张冠李戴 ——
      // 而清单里陈列的正是 ai 那几篇，只有标了它们，卡片才会真正从待搬运列表消失。
      answers: m.answers.map((a) => (a.status === "ai" ? { ...a, status: "handed-off" as const } : a)),
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
    // 服务端响应在进内存之前先补齐结构（缺 evidence 会让下游 for..of 抛错）。
    // 这一层是「服务端漏字段」与「用户界面」之间的最后一道闸。
    const incoming = replies
      .map((r) => normalizeAnswer(r as unknown as StoredAnswer))
      .filter((r): r is AnswerDraft => r !== null);
    if (incoming.length === 0) return;
    commit((m) => {
      const seen = new Set(m.answers.map((a) => a.id));
      const fresh = incoming.filter((r) => !seen.has(r.id));
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
