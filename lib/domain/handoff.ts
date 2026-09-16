import type { AnswerDraft, MirrorQuestion } from "./types";
import { isDisplayableSource } from "./evidence";

/**
 * 「搬运回知乎」的真实可行路径。
 *
 * 审计结论（见 docs/api-audit.md）：知乎开放平台**没有写入/发布接口**，
 * 全部 54 个文档条目均为只读。因此本模块只做两件事：
 *   1. 把最终稿整理成可直接粘贴的知乎回答格式（含来源归属）；
 *   2. 在用户输入的是知乎链接时，解析出问题地址用于深链跳转。
 *
 * 绝不做的事：假装能代用户发布。
 */

const ZHIHU_HOSTS = ["www.zhihu.com", "zhihu.com", "zhuanlan.zhihu.com"];

/** 从知乎链接里解析出问题地址；无法确定时返回 null（**不猜测**）。 */
export function zhihuQuestionUrl(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  let u: URL;
  try {
    u = new URL(sourceUrl.trim());
  } catch {
    return null;
  }
  if (!ZHIHU_HOSTS.includes(u.hostname)) return null;

  // /question/123 或 /question/123/answer/456
  const m = u.pathname.match(/^\/question\/(\d+)/);
  if (m) return `https://www.zhihu.com/question/${m[1]}`;

  // 回答链接 /answer/456 无法反推问题，返回 null
  return null;
}

/**
 * 把一次 Mirror 的结果整理成知乎回答格式的纯文本。
 *
 * 来源列表是**强制**的：官方明确要求保留作者与来源归属。
 */
export function toZhihuDraft(mirror: MirrorQuestion): string {
  const blocks: string[] = [];

  for (const answer of mirror.answers) {
    const marker = answer.status === "human" ? `【${answer.humanAuthor ?? "真人"}补充】` : "";
    blocks.push(`${marker}${answer.body.trim()}`);
  }

  const sources = collectSources(mirror);
  const sourceLines = sources.map((s) => `· 《${s.title}》 — ${s.author}\n  ${s.url}`);

  const parts = [blocks.join("\n\n")];

  if (sourceLines.length > 0) {
    parts.push(`---\n本回答由「二号知乎」整理，证据来自以下知乎回答：\n${sourceLines.join("\n")}`);
  } else {
    parts.push("---\n本回答由「二号知乎」整理。本次未检索到可引用的知乎来源。");
  }

  parts.push(
    "（本文由 AI 基于上述知乎公开回答整理，未经本人发布到知乎。发布前请自行核对内容。）",
  );

  return parts.join("\n\n");
}

/**
 * 去重后的来源清单，供 UI 与导出共用。
 *
 * ⚠️ 必须用 isDisplayableSource()（标题 + 作者名 + 链接齐全），不能只判 `!e.url`：
 * 这个清单会被 `toZhihuDraft()` 拼成「· 《标题》 — 作者 / 链接」，
 * 而那段文字是用户**直接粘贴到知乎发布**的。少一个作者名，贴出去的就是
 * 一条无出处的引用 —— AGENTS.md 铁律 3 要求的正是「展示知乎内容必须带来源与作者」。
 * 全库 195 条来源中有 5 条未取回署名（97.4%），只要命中的那场含这类条目就会露出来。
 */
export function collectSources(mirror: MirrorQuestion) {
  const seen = new Set<string>();
  const out: Array<{ title: string; author: string; url: string; voteUp: number }> = [];
  for (const a of mirror.answers) {
    for (const e of a.evidence) {
      if (!isDisplayableSource(e) || seen.has(e.url)) continue;
      seen.add(e.url);
      out.push({ title: e.title, author: e.author, url: e.url, voteUp: e.voteUp });
    }
  }
  return out.sort((a, b) => b.voteUp - a.voteUp);
}

/** 面向用户的搬运状态说明，如实告知能力边界。 */
export const HANDOFF_NOTE =
  "知乎开放平台未提供发布接口，本产品无法代你发布。请复制后自行到知乎对应问题下发布。";

/** 判断是否已经有真人补充过内容。 */
export function hasHumanInput(answers: AnswerDraft[]): boolean {
  return answers.some((a) => a.status === "human");
}
