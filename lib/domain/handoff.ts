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

/**
 * 面向用户的搬运状态说明，如实告知能力边界。
 *
 * ⚠️ 界面上**不再使用这段长解释**（owner 收敛清单 3.4 要求缩成一句，
 * 见下方 `HANDOFF_BOUNDARY_SHORT`）。这段保留给文档与测试引用 ——
 * 它是「为什么不能代发」的完整版，一句话版会丢掉 54 个条目全只读这个可核对的事实。
 */
export const HANDOFF_NOTE =
  "知乎开放平台未提供发布接口，本产品无法代你发布。请复制后自行到知乎对应问题下发布。";

/** 判断是否已经有真人补充过内容。 */
export function hasHumanInput(answers: AnswerDraft[]): boolean {
  return answers.some((a) => a.status === "human");
}

/**
 * 界面上展示的**短口径**（owner 收敛清单 3.4 的原文）。
 *
 * 为什么换掉那段长解释：它是给评审看的「我们审计过 54 个条目」，
 * 而对**使用者**来说只需要知道「我不能替你发、你复制完自己发」。
 * 长解释留在 `HANDOFF_NOTE` 与 `docs/api-audit.md`，不占界面。
 */
export const HANDOFF_BOUNDARY_SHORT =
  "本站不能替你在知乎发布。复制并编辑内容后，请由本人自行发布。";

/** 复制邀请文案成功后的反馈（owner 收敛清单 3.3 的原文）。 */
export const INVITE_COPIED_FEEDBACK = "邀请内容已复制，请自行发送给答主";

/** 邀请文案里那句必须出现的声明（owner 收敛清单 3.2 的原文）。 */
export const INVITE_AI_DISCLAIMER = "这是 AI 草稿，请由本人修改或补充";

/**
 * 生成「邀请一位答主补充内容」的文案。
 *
 * owner 清单 3.2 要求含四样：**问题、被邀请答主名称、该答主的 AI 草稿、那句 AI 声明**。
 *
 * ⚠️ 三个刻意的设计：
 *   1. **不以 `status === "human"` 为前置条件** —— 清单原文明确要求
 *      「注意它不该以 status===human 为前置条件」。邀请的是**还没被本人补过**的那一位，
 *      等他补完才有 human 状态，逻辑上前置条件是反的。
 *   2. **不承诺「已发送」** —— 复制到剪贴板只说明用户拿到了文本，
 *      产品无从得知他有没有发出去（与仓库既有铁律一致：不显示假的成功状态）。
 *   3. 问题链接**只在真实解析得出时**才出现（走 `zhihuQuestionUrl`），
 *      不猜一个地址给用户 —— 与 `HandoffPanel` 既有的「手输问题不给假链接」一致。
 */
export function toInviteText(mirror: MirrorQuestion, answer: AnswerDraft): string {
  const who = answer.skillName || "这位答主";
  const questionUrl = zhihuQuestionUrl(mirror.sourceUrl);

  const parts = [
    `想请你补充一段：${mirror.title}`,
    "",
    `我在「二号知乎」里用你的公开回答生成了一份草稿（${who}），想请你本人过目、修改或补上你真正想说的那一段：`,
    "",
    "———",
    answer.body.trim(),
    "———",
    "",
    INVITE_AI_DISCLAIMER + "。",
  ];

  if (questionUrl) {
    parts.push("", `问题地址：${questionUrl}`);
  }

  parts.push(
    "",
    "（这条消息由「二号知乎」生成，需要你**自己**发送 —— 本站没有知乎的私信或发布接口。）",
  );

  return parts.join("\n");
}
