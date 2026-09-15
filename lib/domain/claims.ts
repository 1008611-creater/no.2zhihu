/**
 * 「无据断言」硬校验（纯函数，零模型、零额度、可复现）。
 *
 * 为什么必须有这一层（2026-09-15 浏览器实测取证）：
 *
 *   `lib/server/mirror.ts` 的提示词里已经写明
 *   「不允许引入证据之外的数字、机构名、年份、案例」，
 *   但实测「大猛」的回答仍然写出「据中国××协会调研，68% 的工厂……」——
 *   页面上没有任何一条证据能对应这个数字。
 *
 *   提示词是**请求**，不是**保证**。而 AGENTS.md §1.2 要求「不编造知乎数据」，
 *   所以必须在生成之后做一次**确定性核对**，而不是相信模型会照做。
 *   这条也直接决定产品可信度：评委看到一段带百分比与协会归因、
 *   却查不到出处的回答，整个「缺口识别 + 真人接管」的叙事会当场塌掉。
 *
 * 判据刻意保守（与 relevance.ts 同一取舍逻辑）：
 *
 *   - 只拦两类**强信号**：① 带强单位的数量（%、个百分点、倍、万、亿）
 *     ② 带归因措辞的出处（「据……调研 / 根据……统计」）。
 *   - **刻意不拦年份**：问题本身可能含年份（「2024 年行情如何」），
 *     回答照抄会被误判；年份在文本层面与「编造」不可分，按风险不对称取舍，宁可漏判。
 *   - 比对时**逐步退让**（整体短语找不到就只比对尾部实体），
 *     宁可把可疑的判成有据，也不要把真实引用错标成可疑 ——
 *     错标的代价是用户不再相信这套标注。
 */

import type { SkillSource } from "./types";

/** 一条从正文里检出的「可核对断言」。 */
export interface Claim {
  /** 命中的原文片段（用于展示与核对） */
  text: string;
  /** number = 数量；entity = 出处/机构 */
  kind: "number" | "entity";
}

/** 一次正文核对的结果。 */
export interface ClaimCheck {
  /** 检出的可核对断言总数 */
  scanned: number;
  /** 在证据里找不到出处的断言（按出现顺序去重） */
  unsupported: string[];
}

/**
 * 归因措辞：`据/根据/按照/引自 + 中间短语 + 数据/调研/报告/统计/调查/研究…`。
 *
 * 用「归因结构」而不是「机构名词表」来识别 —— 名词表永远列不全，
 * 而「据……调研」这种句式是**编造数据的固定形状**，精确度高得多。
 */
const ATTRIBUTION =
  /(?:据|根据|按照|引自|来自)\s*([^，。；！？、\n]{2,24}?)\s*(?:的)?(?:数据|调研|报告|统计|调查报告|调查|研究|分析|显示|表明|指出)/g;

/** 强单位数量：这些单位一旦出现，就是「可核对的事实主张」而不是修辞。 */
const QUANTITY = /(\d+(?:\.\d+)?)\s*(%|％|个百分点|倍|万|亿)/g;

/** 全角转半角 + 去掉所有空白，让「68 %」与「68%」可比。 */
function normalize(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * 判断一条断言能否在证据里找到出处。
 *
 * 逐步退让：整体短语 → 尾部 8/7/…/3 字。退让是为了**避免错杀** ——
 * 「据中国××协会 2023 年调研」里的实体，证据中可能只出现「××协会」。
 */
function hasSupport(probe: string, evidence: string): boolean {
  const p = normalize(probe);
  if (p.length === 0) return true;
  const e = normalize(evidence);
  if (e.includes(p)) return true;
  for (let len = Math.min(p.length - 1, 8); len >= 3; len--) {
    if (e.includes(p.slice(-len))) return true;
  }
  return false;
}

/** 从正文里抽出所有可核对的断言（不判真假，只负责识别）。 */
export function extractClaims(body: string): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();

  const push = (text: string, kind: Claim["kind"]): void => {
    const key = kind + ":" + normalize(text);
    if (text.length === 0 || seen.has(key)) return;
    seen.add(key);
    out.push({ text, kind });
  };

  for (const m of body.matchAll(QUANTITY)) {
    // 带上单位一起展示，读者一眼能看出是「68%」而不是孤零零的 68。
    push(m[1] + m[2], "number");
  }

  for (const m of body.matchAll(ATTRIBUTION)) {
    push(m[1].trim(), "entity");
  }

  return out;
}

/**
 * 核对正文：返回哪些断言在证据里找不到出处。
 *
 * `sources` 传该回答实际用到的证据（`AnswerDraft.evidence`）。
 * 证据为空时**不做判定** —— 那种情况上层本来就走「不生成正文」的诚实分支。
 */
export function checkClaims(body: string, sources: SkillSource[]): ClaimCheck {
  const claims = extractClaims(body);
  if (claims.length === 0) return { scanned: 0, unsupported: [] };

  // 只把「标题 + 摘要 + 作者」拼成证据池。不比对 URL ——
  // URL 里的数字（回答 id）会制造大量假阳性。
  const pool = normalize(sources.map((s) => s.title + " " + s.excerpt + " " + s.author).join(" "));
  if (pool.length === 0) return { scanned: claims.length, unsupported: [] };

  const unsupported: string[] = [];
  for (const c of claims) {
    if (c.kind === "number") {
      // 数量额外放行「纯数值命中」：证据写 68.3%、正文写 68% 属合理转述。
      const core = normalize(c.text).replace(/[^0-9.]/g, "");
      if (core.length > 0 && pool.includes(core)) continue;
    }
    if (!hasSupport(c.text, pool)) unsupported.push(c.text);
  }

  return { scanned: claims.length, unsupported };
}
