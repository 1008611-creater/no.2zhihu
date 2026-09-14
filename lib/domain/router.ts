import { SKILL_SEEDS } from "./skills";
import type { RoutingDecision } from "./types";

/**
 * Human Router：决定「这个问题该由哪几个 Skill 分身来答」。
 *
 * 这是产品里最关键的一步，所以它的决策必须是可解释的：
 * 每个被选中的分身都会给出命中的信号词与得分，前端直接展示。
 *
 * 路由规则（纯函数，可测试、可复现）：
 *   1. 对每个分身的 triggers 做信号词匹配，命中一次加权重；
 *   2. 问题里出现数字/年限/机构名等「事实锚点」时，提高亲历者与实操派权重；
 *   3. 出现「评价/争议/该不该」等判断词时，提高反驳者与风险审计权重；
 *   4. 取分数最高的 3–6 个分身，保证至少 3 个、至多 6 个。
 */

const MIN_SKILLS = 3;
const MAX_SKILLS = 6;

const FACT_ANCHOR = /(\d{2,}|一年|两年|三年|个月|万|千|亿|％|%|大学|公司|行业|专业|城市|国家)/;
const JUDGEMENT = /(评价|值得|该不该|是不是|争议|看法|好坏|优劣|骗局|智商税)/;
const PERSONAL = /(我|自己|亲身|家里|身边|朋友|同事)/;

export function routeQuestion(title: string): RoutingDecision {
  const text = title.trim();
  const scores = new Map<string, { score: number; reasons: string[] }>();

  for (const seed of SKILL_SEEDS) {
    let score = 0.2;
    const reasons: string[] = [];

    const hits = seed.triggers.filter((t) => text.includes(t));
    if (hits.length > 0) {
      score += hits.length * 0.22;
      reasons.push(`命中信号词「${hits.slice(0, 3).join("、")}」`);
    }

    if (FACT_ANCHOR.test(text)) {
      if (seed.id === "lived-experience") { score += 0.18; reasons.push("问题含事实锚点，需要一手经验"); }
      if (seed.id === "practitioner") { score += 0.15; reasons.push("问题含事实锚点，需要可执行方法"); }
    }

    if (JUDGEMENT.test(text)) {
      if (seed.id === "contrarian") { score += 0.24; reasons.push("问题要求判断，需要反方视角"); }
      if (seed.id === "risk-auditor") { score += 0.16; reasons.push("问题要求判断，需要列出代价"); }
    }

    if (PERSONAL.test(text) && seed.id === "lived-experience") {
      score += 0.2; reasons.push("问题以第一人称提出，亲历者最相关");
    }

    if (seed.kind === "analysis" && /(为什么|本质|原理|机制)/.test(text)) {
      score += 0.2; reasons.push("问题在追问机制");
    }

    if (seed.kind === "story" && /(故事|小说|创作|叙事|人物)/.test(text)) {
      score += 0.25; reasons.push("问题属于叙事/创作类");
    }

    scores.set(seed.id, { score: Math.min(score, 1), reasons });
  }

  const ranked = [...scores.entries()]
    .map(([skillId, v]) => ({ skillId, score: Number(v.score.toFixed(2)), reasons: v.reasons }))
    .sort((a, b) => b.score - a.score);

  // 阈值筛选 + 覆盖度兜底：问题越长，越需要多视角
  let picked = ranked.filter((r) => r.score >= 0.34).slice(0, MAX_SKILLS);
  const wantAtLeast = text.length >= 12 ? 4 : MIN_SKILLS;
  if (picked.length < wantAtLeast) picked = ranked.slice(0, wantAtLeast);
  picked = picked.slice(0, MAX_SKILLS);

  const intent = JUDGEMENT.test(text)
    ? "判断型问题"
    : /(怎么做|如何|方法|教程|入门)/.test(text)
      ? "方法型问题"
      : /(为什么|本质|原理|机制)/.test(text)
        ? "解释型问题"
        : "开放讨论型问题";

  return {
    intent,
    picks: picked.map((p) => ({
      skillId: p.skillId,
      score: p.score,
      reason:
        p.reasons.length > 0
          ? p.reasons.join("；")
          : "作为补充视角入选，避免回答被单一叙事垄断",
    })),
    summary: `识别为「${intent}」，从 6 个分身中选出 ${picked.length} 个覆盖${picked
      .map((p) => SKILL_SEEDS.find((s) => s.id === p.skillId)?.name)
      .filter(Boolean)
      .join("、")}视角。`,
    queries: picked.map((p) => {
      const seed = SKILL_SEEDS.find((s) => s.id === p.skillId)!;
      return buildQuery(seed.queryTemplate, text);
    }),
  };
}

/**
 * 从问题标题里抽一个短主题词，用于填查询模板。
 *
 * 这里刻意取短：实测发现把整句问题塞进知乎搜索会让所有分身
 * 返回同一批结果，导致多视角退化成同一个视角。短主题词 + 每个分身
 * 各自的短后缀，才能拿到真正不同的证据。
 */
const STOP = /^(如何|怎么|为什么|什么|哪些|是不是|该不该|有没有|能不能|要不要|值得|值得吗|请问|大家|今年|现在|最近)$/;

export function extractTopic(title: string): string {
  const cleaned = title
    .replace(/[?？。！!，,、；;：:"'「」《》()（）\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ").filter((p) => p.length > 0 && !STOP.test(p));
  if (parts.length > 1) {
    // 取前 3 个词，但总长不超过 16 字，避免查询过窄
    const out: string[] = [];
    let len = 0;
    for (const p of parts) {
      if (len + p.length > 16 && out.length > 0) break;
      out.push(p);
      len += p.length;
    }
    return out.join(" ");
  }

  // 中文长句没有空格：剥掉疑问句式，取前 10 字
  const stripped = cleaned
    .replace(/^(如何|怎么|为什么|什么|哪些|是不是|该不该|有没有|能不能|要不要)/, "")
    .replace(/(真的是|真的|是不是|该不该|吗|呢|如何|怎么办)$/g, "")
    .trim();
  return (stripped || cleaned).slice(0, 10);
}

function buildQuery(template: string, title: string): string {
  return template.replace("{topic}", extractTopic(title));
}
