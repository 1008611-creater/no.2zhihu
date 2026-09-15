"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import { PERSONA_BY_HANDLE } from "@/lib/domain/personas";
import { skillFromPersona } from "@/lib/domain/skills";
import type { HotItem } from "@/lib/zhihu/types";
import type {
  Accent,
  AnswerDraft,
  Gap,
  MirrorQuestion,
  Skill,
  SkillKind,
} from "@/lib/domain/types";

/**
 * 虚拟广场信息流 —— 首页与 /square 共用同一条流。
 *
 * 广场的主角是「已经做完的镜像讨论组」：每个问题都已经跑完一轮
 * 分身作答 + 互相回应 + 缺口盘点，点开就能看这十几位答主怎么答的。
 * 待讨论的真实问题与知乎热榜只是补充，用来提示「还能新开什么题」。
 *
 * 数据来自 `/square-library.json`，由 `scripts/build-library.mjs` 生成；
 * 不在 render 里直接调上游接口 —— 22 个问题逐个调知乎会把额度打穿。
 */

/** 人工整理的讨论组话题：每条都故意选「有争议、没有标准答案」的日常决策题。 */
export const DISCUSSION_TOPICS = [
  "30 岁从大厂转行做独立开发，值得吗？",
  "孩子近视了，要不要立刻配离焦镜？",
  "小城市开一家咖啡店，真实成本和风险是什么？",
  "该不该借钱给亲戚？借了不还怎么办？",
  "考研三年没上岸，还要不要继续？",
  "父母执意要买保健品，怎么劝？",
  "相亲对象说「先做朋友」，是什么意思？",
  "副业做自媒体，多久能超过主业收入？",
  "上班摸鱼被领导发现，要不要主动认错？",
  "月薪两万，在一线城市该不该买房？",
  "年轻人第一份工作，该看薪资还是看成长？",
  "要不要为了孩子上学，搬到老破小的学区房？",
  "35 岁被优化，转行做家政或网约车丢人吗？",
  "相亲时对方要求婚前全款买房，合理吗？",
  "存款 50 万，是先买车还是先还房贷？",
  "同事把活推给我，我该不该撕破脸？",
  "要不要送孩子去读国际学校？",
  "长期加班到十点，身体开始报警，该辞职吗？",
  "朋友创业拉我入伙，出钱还是出力？",
  "父母老了要不要接来同住？",
  "读博六年没毕业，还要不要坚持？",
  "在县城做公务员，一辈子就到头了吗？",
];

type FeedKind = "done" | "mine" | "hot" | "todo";

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
  mine: "我这场",
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
  className,
}: {
  /** 热榜条数上限 */
  hotLimit?: number;
  /** 「待讨论」条数上限；默认 0 —— 广场主角是已完成的组，不必再堆没做的题 */
  todoLimit?: number;
  className?: string;
}) {
  const { history, setMirror } = useMirror();
  const [hot, setHot] = useState<HotItem[] | null>(null);
  const [hotError, setHotError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[] | null>(null);

  useEffect(() => {
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
  }, [hotLimit]);

  useEffect(() => {
    let alive = true;
    fetch("/square-library.json")
      .then((r) => r.json())
      .then((d) => alive && setLibrary(Array.isArray(d?.entries) ? d.entries : []))
      .catch(() => alive && setLibrary([]));
    return () => {
      alive = false;
    };
  }, []);

  const feed = useMemo<FeedEntry[]>(() => {
    const done: FeedEntry[] = (library ?? []).map((s) => ({
      key: "k-" + s.id,
      kind: "done",
      title: s.title,
      summary: s.routing?.summary,
      answerCount: s.answers?.length ?? 0,
      personaNames: (s.skills ?? []).map((x) => x.persona?.displayName ?? x.name).filter(Boolean),
      mirrorId: s.id,
    }));

    // 「我这场」= 本地新生成、库里的 22 个还没有的镜像问题。
    const libraryIds = new Set((library ?? []).map((s) => s.id));
    const mine: FeedEntry[] = history
      .filter((m) => !libraryIds.has(m.id))
      .map((m) => ({
        key: "m-" + m.id,
        kind: "mine",
        title: m.title,
        summary: m.routing.summary,
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

    // 已完成的讨论组排最前 —— 广场第一眼就该是「这里讨论过什么」。
    return [...mine, ...done, ...todo, ...hotEntries];
  }, [library, hot, history, hotLimit, todoLimit]);

  const loading = library === null || (!hot && !hotError);

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
          transition={{ duration: 0.26, delay: Math.min(i * 0.015, 0.3) }}
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
                <>
                  <button
                    className="link mono"
                    onClick={() => {
                      if (entry.kind === "mine") {
                        const m = history.find((h) => h.id === entry.mirrorId);
                        if (m) setMirror(m);
                        return;
                      }
                      const s = (library ?? []).find((x) => x.id === entry.mirrorId);
                      if (s) setMirror(hydrate(s));
                    }}
                  >
                    载入工作台
                  </button>
                  <Link className="link mono" href="/mirror#answers">
                    看{entry.answerCount ? " " + entry.answerCount + " " : ""}位分身怎么答的 →
                  </Link>
                </>
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
    </div>
  );
}

export default FeedStream;
