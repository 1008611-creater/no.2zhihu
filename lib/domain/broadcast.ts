/**
 * 现场广播 · 条目构造（纯函数）。
 *
 * 右栏「现场广播」与左侧广场共用同一批讨论数据，但**浏览位置互不控制**。
 * 两边显示的必须逐字一致 —— 同一个标题、同一组数字。所以这里只做一件事：
 * 把一条讨论压成右栏需要的那几个字段，广场那边用同一组计数。
 *
 * ## 摘要从哪来（这一条踩过坑）
 *
 * 最初打算用 `entry.routing.summary` 当摘要，读了真实数据才发现**它根本不是内容摘要**，
 * 而是路由过程的自述：
 *
 *   「识别为「判断型问题」，从 16 位答主里推荐了 半佛仙人、贱贱、大猛。你可以换人，也可以继续邀请。」
 *
 * 把它当摘要放上去，等于在右栏贴一句系统日志。所以改成取**第一条回答正文的
 * 首句真实摘录**，并标注出自哪位分身 —— 是引用，不是概括，可回原文核对。
 *
 * ## 元信息只放真实的
 *
 * 概念图里写的是「3 位分身参与 · 12 个观点」。那是示意，而真实数据里
 * 每场是 3 位分身 / 3 条回答 / 9 条来源 / 1–3 个缺口。所以这里给的是
 * **真实派生**的四项，取不到就不出现 —— 宁可少一行，不写一个编出来的数。
 */

import type { LibraryEntry } from "./library";
import { statsOf } from "./library";
import { statusLabelOf, type TopicCounts } from "./square-layout";
import type { MirrorQuestion } from "./types";

/** 构造一条广播所需的全部输入。 */
export interface BroadcastSource extends TopicCounts {
  id: string;
  title: string;
  /** 真实来源条数 */
  sourceCount: number;
  /** 用来取摘录的真实回答（按顺序；空正文会被跳过） */
  bodies: Array<{ author: string; body: string }>;
}

export interface BroadcastItem {
  id: string;
  title: string;
  /** 真实摘录（可能没有 —— 没有就不渲染这一行，不用占位文字凑） */
  excerpt?: string;
  /** 摘录出自哪位分身 */
  excerptBy?: string;
  /** 真实元信息片段；空数组表示这条没有任何可说的真实信息 */
  meta: string[];
  /** 同一句状态文案（与广场浮标同源） */
  statusLabel: string;
  mine: boolean;
}

/**
 * 正文 → 一句摘录。
 *
 * 先取第一句：分身们的第一句通常就是最锋利的判断
 * （「说白了，这问题问『值不值得』，本身就是问错了。」），
 * 比机械截开头 40 字有信息量得多。
 *
 * 第一句过短（比如只有「先说结论。」）时**顺延到下一个句读** ——
 * 否则右栏会出现一堆没有内容的短句。`{8,}` 就是「至少 8 个字才算一句」，
 * 也顺带避免了把「嗯。」「对。」这种口语起手当成整条摘录。
 */
export function excerptOf(body: string, max = 56): string {
  const clean = body
    .replace(/\s+/g, " ")
    .replace(/^[#>*\-\u3000\s]+/, "")
    .trim();
  if (!clean) return "";

  const m = clean.match(/^[\s\S]{8,}?[。！？!?]/);
  const candidate = m ? m[0] : clean;
  if (candidate.length <= max) return candidate;

  // 截断时不要把标点留在末尾（「…，」读起来像出错）。
  return candidate.slice(0, max).replace(/[，、；：,;:\s]+$/, "") + "…";
}

/**
 * 元信息片段。
 *
 * 顺序按「先人、后料、最后缺口」：读者最关心有谁在说，其次依据是什么，
 * 最后才是还缺什么。每一项都来自真实计数，为 0 的直接不出现在数组里。
 */
export function metaOf(s: BroadcastSource, excerptBy?: string): string[] {
  const out: string[] = [];
  // 摘录出自谁，放元信息的第一位。
  //
  // 为什么不跟摘录写在同一行（第一版是「……原文 —— 半佛仙人」）：
  // 摘录用 line-clamp 卡两行，出处被挤到第二行，等于白白吃掉一整行摘要。
  // 移到元信息之后，摘录那两行全部留给真内容，出处也仍然紧挨着它。
  if (excerptBy) out.push("摘录自 " + excerptBy);
  if (s.mine) out.push("我的提问");
  if (s.personaCount > 0) out.push(s.personaCount + " 位分身参与");
  // 多轮讨论里回答条数会大于人数，这时补一条 —— 否则读者以为只有 3 条回答。
  if (s.answerCount > s.personaCount) out.push("共 " + s.answerCount + " 条回答");
  if (s.sourceCount > 0) out.push(s.sourceCount + " 条来源");
  if (s.openGapCount > 0) out.push(s.openGapCount + " 个缺口待补");
  return out;
}

export function toBroadcastItem(s: BroadcastSource): BroadcastItem {
  const pick = s.bodies.find((b) => b.body && b.body.trim().length > 0);
  const excerpt = pick ? excerptOf(pick.body) : "";
  return {
    id: s.id,
    title: s.title,
    excerpt: excerpt || undefined,
    excerptBy: excerpt ? pick?.author : undefined,
    meta: metaOf(s, excerpt ? pick?.author : undefined),
    statusLabel: statusLabelOf(s),
    mine: s.mine,
  };
}

export function toBroadcastItems(sources: BroadcastSource[]): BroadcastItem[] {
  return sources.map(toBroadcastItem);
}

/* --------------------------- 两种数据源的适配 --------------------------- */

/**
 * 库条目 → 广播输入。
 *
 * `mine` 恒为 false：库是构建时快照，里面全是公开讨论。
 * 用户自己刚生成的那几场由 `sourceFromMirror` 处理。
 */
export function sourceFromLibrary(entry: LibraryEntry): BroadcastSource {
  const st = statsOf(entry);
  return {
    id: entry.id,
    title: entry.title,
    sourceCount: st.sourceCount,
    personaCount: st.personaCount,
    answerCount: st.answerCount,
    openGapCount: st.openGapCount,
    hasReplies: st.hasReplies,
    mine: false,
    // 摘录只取首轮作答（round 0）：第二轮是「回应别人」，单独看会不知所云。
    bodies: (entry.answers ?? [])
      .filter((a) => (a.round ?? 0) === 0)
      .map((a) => ({ author: a.skillName, body: a.body })),
  };
}

/**
 * 本地会话 → 广播输入。
 *
 * 计数一律现算，不复用库快照 —— 用户刚邀请了几位分身，右栏必须立刻反映，
 * 而不是等他刷新。
 */
export function sourceFromMirror(q: MirrorQuestion): BroadcastSource {
  const handles = new Set<string>();
  for (const s of q.skills) handles.add(s.persona?.handle ?? "name:" + s.name);
  const firstRound = q.answers.filter((a) => (a.round ?? 0) === 0);

  return {
    id: q.id,
    title: q.title,
    sourceCount: q.answers.reduce((n, a) => n + (a.evidence?.length ?? 0), 0),
    personaCount: handles.size,
    answerCount: q.answers.length,
    openGapCount: q.gaps.filter((g) => !g.filledBy).length,
    hasReplies: q.answers.some((a) => (a.round ?? 0) > 0),
    mine: true,
    bodies: firstRound.map((a) => ({ author: a.skillName, body: a.body })),
  };
}
