"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { PERSONA_BY_HANDLE } from "@/lib/domain/personas";
import { skillFromPersona } from "@/lib/domain/skills";
import { DISCUSSION_TOPICS } from "@/lib/domain/topics";
import type { HotItem } from "@/lib/zhihu/types";
import type {
  Accent,
  AnswerDraft,
  Gap,
  MirrorQuestion,
  Skill,
  SkillKind,
} from "@/lib/domain/types";
import { DUR, EASE } from "@/lib/motion/tokens";

/**
 * 虚拟广场信息流 —— 首页与 /square 共用同一条流。
 *
 * 广场的主角是「已经做完的镜像讨论组」：每个问题都已经跑完一轮
 * 分身作答 + 互相回应 + 缺口盘点，点开就能看这十几位答主怎么答的。
 * 待讨论的真实问题与知乎热榜只是补充，用来提示「还能新开什么题」。
 *
 * 数据来自 `/square-library.json`，由 `scripts/build-library.mjs` 生成；
 * 不在 render 里直接调上游接口 —— 22 个问题逐个调知乎会把额度打穿。
 *
 * 2026-09-15 收敛：
 *   · 加 `scope` —— 首页只看**公开**内容（别人问过的 + 热榜），我自己的问题
 *     统一封存在广场的「我曾经提问过的」里，不在首页再铺一遍入口。
 *   · 每条只剩**一个**进入动作。原先同一场问答给了两个入口
 *     （「载入工作台」+「看 N 位分身怎么答的」），两个都通向同一个地方。
 */

/** 人工整理的讨论组话题见 lib/domain/topics.ts —— 那里是唯一来源。 */

type FeedKind = "done" | "mine" | "hot" | "todo";

/** 信息流的取材范围。 */
export type FeedScope =
  /** 全部：公开内容 + 我曾经提问过的 */
  | "all"
  /** 公开：只保留别人问过的与热榜，我自己的问题不出现在这里 */
  | "public"
  /** 我曾经提问过的 */
  | "mine";

interface FeedEntry {
  key: string;
  kind: FeedKind;
  title: string;
  summary?: string;
  /** 已完成讨论组：参与作答的分身数 */
  answerCount?: number;
  /** 已完成讨论组：已经出过分身的答主名 */
  personaNames?: string[];
  /** 热榜条目的知乎原链接 */
  sourceUrl?: string;
  /** 本场镜像 / 库条目的 id */
  mirrorId?: string;
}

const KIND_LABEL: Record<FeedKind, string> = {
  done: "镜像讨论组",
  mine: "我曾经提问过的",
  hot: "知乎热榜",
  todo: "待讨论",
};

const KIND_CHIP: Record<FeedKind, string> = {
  done: "chip chip-blue",
  mine: "chip chip-violet",
  hot: "chip chip-orange",
  todo: "chip",
};

/* ---------------------------------------------------------------------------
 * /square-library.json 的形状 —— 与 scripts/build-library.mjs 的 slim() 一一对应。
 * 改 slim() 必须同步改这里。
 * ------------------------------------------------------------------------- */

interface LibrarySkill {
  id: string;
  name: string;
  kind?: SkillKind;
  lens?: string;
  accent?: Accent;
  persona?: { handle: string; displayName: string };
}

interface LibraryAnswer {
  id: string;
  skillId: string;
  skillName: string;
  accent?: Accent;
  handle?: string;
  body: string;
  generatedBy?: AnswerDraft["generatedBy"];
  status?: AnswerDraft["status"];
  createdAt?: number;
  round?: number;
  replyToName?: string;
  evidenceCount?: number;
  evidenceTitles?: string[];
}

interface LibraryGap {
  id: string;
  kind?: Gap["kind"];
  label?: string;
  reason?: string;
  needProfile?: string;
  severity?: number;
}

interface LibraryEntry {
  id: string;
  title: string;
  createdAt: number;
  routing: { intent: string; summary: string };
  skills: LibrarySkill[];
  answers: LibraryAnswer[];
  gaps: LibraryGap[];
}

const ACCENTS = ["blue", "violet", "green", "orange"] as const;

/**
 * 把精简条目还原成一个能塞进 store 的完整 MirrorQuestion。
 *
 * 为什么不直接存完整对象：完整镜像问题带着全部回答正文与检索来源，
 * 22 份会让这个 JSON 膨胀到几百 KB —— 用户只是点「载入工作台」，
 * 没必要为此付首屏代价。这里按需重建，字段与 build-library.mjs 对齐。
 */
function hydrate(entry: LibraryEntry): MirrorQuestion {
  const skills: Skill[] = entry.skills.map((s, i) => {
    const persona = s.persona ? PERSONA_BY_HANDLE.get(s.persona.handle) : undefined;
    if (persona) {
      // 人格定义里有完整的 lens / keywords / tone，优先用它，别用裁剪版。
      const full = skillFromPersona(persona);
      return s.accent ? { ...full, accent: s.accent } : full;
    }
    // 找不到人格定义（公共人物视角 / 降级视角）时，用条目自称的信息兜一个最小 Skill。
    return {
      id: s.id,
      name: s.name,
      kind: s.kind ?? "analysis",
      lens: s.lens ?? "",
      query: entry.title,
      keywords: [],
      tone: [],
      accent: s.accent ?? ACCENTS[i % ACCENTS.length],
      sources: [],
      confidence: 0,
      supplementary: true,
    } satisfies Skill;
  });

  const answers = entry.answers.map((a, i) => ({
    id: a.id,
    skillId: a.skillId,
    skillName: a.skillName,
    accent: a.accent ?? ACCENTS[i % ACCENTS.length],
    handle: a.handle,
    body: a.body,
    // 证据正文没有随 JSON 下发，只有标题可用。
    // ⚠️ 只还原真正已知的字段：标题。author / url / voteUp / editTime 一律不知道，
    // 就用空值 —— 绝不能拿 skillName 冒充来源作者（那是张冠李戴，违反保留来源的硬要求）。
    // 当前 UI 不渲染 evidence，此处仅为类型完整性；将来若要渲染，必须先补齐字段。
    evidence: (a.evidenceTitles ?? []).map((title) => ({
      title,
      author: "",
      url: "",
      excerpt: "",
      voteUp: 0,
      editTime: 0,
      confidence: 0,
    })),
    createdAt: a.createdAt ?? entry.createdAt,
    status: a.status ?? "ai",
    generatedBy: a.generatedBy ?? "retrieval",
    round: a.round,
    replyToName: a.replyToName,
  })) as AnswerDraft[];

  const gaps = entry.gaps.map((g) => ({
    id: g.id,
    kind: g.kind ?? "experience",
    label: g.label ?? "",
    reason: g.reason ?? "",
    needProfile: g.needProfile ?? "",
    candidates: [],
    severity: g.severity ?? 0,
  })) as Gap[];

  return {
    id: entry.id,
    title: entry.title,
    origin: "hot",
    createdAt: entry.createdAt,
    routing: {
      mode: "auto",
      intent: entry.routing?.intent ?? "experience",
      picks: entry.skills.map((s) => ({ skillId: s.id, reason: "", score: 0 })),
      summary: entry.routing?.summary ?? "",
      queries: [],
    },
    skills,
    answers,
    gaps,
    handoff: { status: "not-ready", note: "" },
    contributions: [],
  };
}

export function FeedStream({
  hotLimit = 30,
  todoLimit = 0,
  scope = "all",
  className,
}: {
  /** 热榜条数上限 */
  hotLimit?: number;
  /** 「待讨论」条数上限；默认 0 —— 广场主角是已完成的组，不必再堆没做的题 */
  todoLimit?: number;
  /** 取材范围：见 FeedScope。首页传 "public"，广场按筛选传 "all" / "mine"。 */
  scope?: FeedScope;
  className?: string;
}) {
  const router = useRouter();
  const { history, setMirror } = useMirror();
  const [hot, setHot] = useState<HotItem[] | null>(null);
  const [hotError, setHotError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);

  const wantsHot = scope !== "mine";
  const wantsLibrary = scope !== "mine";

  useEffect(() => {
    // 只看「我曾经提问过的」时不必碰知乎热榜 —— 省下当天有限的额度。
    if (!wantsHot) {
      setHot([]);
      return;
    }
    let alive = true;
    fetch("/api/zhihu/hot?limit=" + hotLimit)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) setHot(d.data.Items ?? []);
        else setHotError(d.error ?? "热榜不可用");
      })
      .catch(() => alive && setHotError("热榜不可用"));
    return () => {
      alive = false;
    };
  }, [hotLimit, wantsHot]);

  useEffect(() => {
    if (!wantsLibrary) {
      setLibrary([]);
      return;
    }
    let alive = true;
    fetch("/square-library.json")
      .then((r) => r.json())
      .then((d) => alive && setLibrary(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => alive && setLibrary([]));
    return () => {
      alive = false;
    };
  }, [wantsLibrary]);

  const feed = useMemo<FeedEntry[]>(() => {
    const lib = library ?? [];

    const done: FeedEntry[] = lib.map((s) => ({
      key: "k-" + s.id,
      kind: "done",
      title: s.title,
      summary: s.routing?.summary,
      answerCount: s.answers?.length ?? 0,
      personaNames: (s.skills ?? []).map((x) => x.persona?.displayName ?? x.name).filter(Boolean),
      mirrorId: s.id,
    }));

    // 「我曾经提问过的」= 本地生成过、库里的 22 个还没有的镜像问题。
    const libraryIds = new Set(lib.map((s) => s.id));
    const mine: FeedEntry[] = history
      .filter((m) => !libraryIds.has(m.id))
      .map((m) => ({
        key: "m-" + m.id,
        kind: "mine",
        title: m.title,
        summary: m.routing.summary,
        answerCount: m.answers.filter((a) => (a.round ?? 0) === 0).length,
        mirrorId: m.id,
      }));

    const todo: FeedEntry[] = DISCUSSION_TOPICS.slice(0, todoLimit).map((t) => ({
      key: "d-" + t,
      kind: "todo",
      title: t,
    }));

    const hotEntries: FeedEntry[] = (hot ?? []).slice(0, hotLimit).map((item, i) => ({
      key: "h-" + (item.Url || i),
      kind: "hot",
      title: item.Title,
      summary: item.Summary ? String(item.Summary).slice(0, 110) : undefined,
      sourceUrl: item.Url,
    }));

    if (scope === "mine") return mine;
    if (scope === "public") return [...done, ...todo, ...hotEntries];
    // 已完成的讨论组排最前，自己的问题紧随其后 —— 广场第一眼就该是「这里讨论过什么」。
    return [...done, ...mine, ...todo, ...hotEntries];
  }, [library, hot, history, hotLimit, todoLimit, scope]);

  const loading = wantsLibrary ? library === null || (wantsHot && !hot && !hotError) : false;

  /** 载入某一条并跳去工作台 —— 一个动作走完，不拆成「先载入、再点链接」。 */
  function openEntry(entry: FeedEntry) {
    if (!entry.mirrorId) return;
    if (entry.kind === "mine") {
      const m = history.find((h) => h.id === entry.mirrorId);
      if (m) setMirror(m);
    } else {
      const s = (library ?? []).find((x) => x.id === entry.mirrorId);
      if (s) setMirror(hydrate(s));
    }
    router.push("/mirror#answers");
  }

  return (
    <div className={className ? "feed-stream " + className : "feed-stream"}>
      {hotError && (
        <div className="notice notice-warn" style={{ marginBottom: 14 }}>
          热榜暂时不可用：{hotError}
        </div>
      )}

      {feed.map((entry, i) => (
        <motion.div
          key={entry.key}
          className="card-flat feed-row"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: DUR.base, ease: EASE.out, delay: Math.min(i * 0.015, 0.3) }}
        >
          <span className={KIND_CHIP[entry.kind]}>{KIND_LABEL[entry.kind]}</span>

          <div className="feed-body">
            <div className="feed-title">{entry.title}</div>
            {entry.summary && <div className="feed-sum dimmer">{entry.summary}</div>}

            {entry.kind === "done" && (
              <div className="feed-people dimmer">
                {entry.answerCount ? entry.answerCount + " 个分身答过" : "已完成讨论组"}
                {entry.personaNames && entry.personaNames.length > 0 && (
                  <>
                    {" · "}
                    {entry.personaNames.slice(0, 3).join("、")}
                    {entry.personaNames.length > 3 ? " 等" : ""}
                  </>
                )}
              </div>
            )}

            <div className="feed-actions">
              {entry.kind === "done" || entry.kind === "mine" ? (
                // 一条目一个入口。原先这里同时给「载入工作台」和「看 N 位分身怎么答的」，
                // 两者通向同一场问答，用户要多点一下才真正看到答案。
                <button className="link mono" onClick={() => openEntry(entry)}>
                  重新进入 · 看{entry.answerCount ? " " + entry.answerCount + " " : ""}位分身怎么答的 →
                </button>
              ) : (
                <>
                  {entry.sourceUrl && (
                    <a
                      className="link mono"
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      去知乎看
                    </a>
                  )}
                  <Link className="link mono" href={"/?q=" + encodeURIComponent(entry.title)}>
                    做成镜像问题 →
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      ))}

      {loading && <div className="skeleton" style={{ height: 76 }} />}

      {!loading && feed.length === 0 && (
        <div className="notice">
          {scope === "mine" ? (
            <>
              你还没有提过问题。
              <Link className="link" href="/" style={{ marginLeft: 6 }}>
                去提一个 →
              </Link>
            </>
          ) : (
            "这里还没有已经讨论过的事。"
          )}
        </div>
      )}
    </div>
  );
}

export default FeedStream;
