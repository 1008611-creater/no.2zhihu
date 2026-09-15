"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useMirror } from "@/lib/store/mirror-store";
import type { HotItem } from "@/lib/zhihu/types";

/**
 * 虚拟广场信息流 —— 首页与 /square 共用同一条流。
 *
 * 流里混排三样东西：
 *   · 知乎讨论组：人工整理的开放问题，都是真实存在分歧、没有标准答案的；
 *   · 知乎热榜：此刻真实在热的问题（真实接口，服务端缓存 10 分钟）；
 *   · 本场镜像：这场演示里已经生成过的镜像问题。
 *
 * 每一条只做一件事 —— 变成可以作答的镜像问题。
 * 为什么首页也要挂它：首页空闲时不应该是一块说明文字，而应该是「此刻正在讨论什么」。
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

type FeedKind = "discussion" | "hot" | "mirror";

interface FeedEntry {
  key: string;
  kind: FeedKind;
  title: string;
  summary?: string;
  /** 热榜条目的知乎原链接 */
  sourceUrl?: string;
  /** 本场镜像问题的 id */
  mirrorId?: string;
}

const KIND_LABEL: Record<FeedKind, string> = {
  discussion: "知乎讨论组",
  hot: "知乎热榜",
  mirror: "本场镜像",
};

const KIND_CHIP: Record<FeedKind, string> = {
  discussion: "chip",
  hot: "chip chip-orange",
  mirror: "chip chip-blue",
};

export function FeedStream({
  hotLimit = 30,
  discussionLimit,
  mirrorLimit,
  className,
}: {
  /** 热榜条数上限 */
  hotLimit?: number;
  /** 讨论组条数上限；默认全部 */
  discussionLimit?: number;
  /** 本场镜像条数上限；默认全部 */
  mirrorLimit?: number;
  className?: string;
}) {
  const { history, setMirror } = useMirror();
  const [hot, setHot] = useState<HotItem[] | null>(null);
  const [hotError, setHotError] = useState<string | null>(null);

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

  const feed = useMemo<FeedEntry[]>(() => {
    const discussion: FeedEntry[] = DISCUSSION_TOPICS.slice(0, discussionLimit ?? DISCUSSION_TOPICS.length).map(
      (t) => ({ key: "d-" + t, kind: "discussion", title: t }),
    );

    const hotEntries: FeedEntry[] = (hot ?? []).slice(0, hotLimit).map((item, i) => ({
      key: "h-" + (item.Url || i),
      kind: "hot",
      title: item.Title,
      summary: item.Summary ? String(item.Summary).slice(0, 110) : undefined,
      sourceUrl: item.Url,
    }));

    const mirrorEntries: FeedEntry[] = history
      .slice(0, mirrorLimit ?? history.length)
      .map((m) => ({
        key: "m-" + m.id,
        kind: "mirror",
        title: m.title,
        summary: m.routing.summary,
        mirrorId: m.id,
      }));

    // 本场镜像排最前 —— 演示时先看到「这场已经生成过什么」。
    return [...mirrorEntries, ...discussion, ...hotEntries];
  }, [hot, history, hotLimit, discussionLimit, mirrorLimit]);

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

            <div className="feed-actions">
              {entry.kind === "mirror" ? (
                <>
                  <button
                    className="link mono"
                    onClick={() => {
                      const m = history.find((h) => h.id === entry.mirrorId);
                      if (m) setMirror(m);
                    }}
                  >
                    载入工作台
                  </button>
                  <Link className="link mono" href="/mirror#answers">
                    看分身怎么答的 →
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

      {!hot && !hotError && <div className="skeleton" style={{ height: 76 }} />}
    </div>
  );
}

export default FeedStream;
