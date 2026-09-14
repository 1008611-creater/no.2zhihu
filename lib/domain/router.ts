import { PERSONA_SKILLS, SKILL_SEEDS } from "./skills";
import { corpusLabel } from "./personas";
import type { Persona, RoutingDecision, Skill } from "./types";

/**
 * Human Router：决定「这个问题该由哪几个分身来答」。
 *
 * v1 起有两条路径，必须先分清：
 *
 *   - **manual（手动指定）** —— 用户勾选了答主。这是产品主线：
 *     「我想看谁回答」。路由只负责校验、去重、以及用户没选满时补位。
 *   - **auto（自动推荐）** —— 用户没选人。按问题信号词从答主名册里挑 3 位。
 *
 * 两条路径都必须可解释：每个被选中的分身都带命中的理由与得分，前端直接展示。
 */

const MIN_SKILLS = 3;
const MAX_SKILLS = 6;

const FACT_ANCHOR = /(\d{2,}|一年|两年|三年|个月|万|千|亿|％|%|大学|公司|行业|专业|城市|国家)/;
const JUDGEMENT = /(评价|值得|该不该|是不是|争议|看法|好坏|优劣|骗局|智商税)/;
const PERSONAL = /(我|自己|亲身|家里|身边|朋友|同事)/;

/** 问题意图分类，用于 UI 文案与推荐解释。 */
export function classifyIntent(text: string): string {
  return JUDGEMENT.test(text)
    ? "判断型问题"
    : /(怎么做|如何|方法|教程|入门)/.test(text)
      ? "方法型问题"
      : /(为什么|本质|原理|机制)/.test(text)
        ? "解释型问题"
        : "开放讨论型问题";
}

/**
 * 答主推荐打分：把「这个人跟这个问题有多相关」算成一个可解释的分数。
 *
 * 只用答主自己声明的 knows / stance 做匹配，不引入任何模型自评。
 * 这保证同一个问题 + 同一份名册，任何时候都推荐同样的人。
 */
function scorePersona(persona: Persona, text: string): { score: number; reasons: string[] } {
  let score = 0.25;
  const reasons: string[] = [];

  const hits = persona.knows.filter((k) => {
    // 把「互联网商业模式与资本运作」这类长描述拆成短词再匹配
    const parts = k.split(/[、与和的及·]/).flatMap((p) => p.split(/[A-Za-z]+/)).filter((p) => p.length >= 2);
    return parts.some((p) => text.includes(p));
  });
  if (hits.length > 0) {
    score += Math.min(hits.length * 0.18, 0.45);
    reasons.push(`领域命中「${hits[0].slice(0, 10)}」`);
  }

  const stanceHits = persona.stance.filter((s) => {
    const parts = s.split(/[，。；、（）()]/).filter((p) => p.length >= 3);
    return parts.some((p) => text.includes(p.slice(0, 4)));
  });
  if (stanceHits.length > 0) {
    score += 0.12;
    reasons.push("立场可能形成有价值的判断");
  }

  if (PERSONAL.test(text) && persona.voice.sentenceLength === "short") {
    score += 0.08;
    reasons.push("问题偏个人处境，这位答主习惯第一人称直给");
  }

  if (FACT_ANCHOR.test(text) && persona.voice.emotion >= 0.5) {
    score += 0.06;
  }

  return { score: Math.min(Number(score.toFixed(2)), 1), reasons };
}

/** 自动推荐：不指定答主时，从名册里挑 3 位最相关的。 */
export function recommendPersonas(title: string, count = MIN_SKILLS): Skill[] {
  const text = title.trim();
  const ranked = PERSONA_SKILLS.map((skill) => {
    const { score, reasons } = scorePersona(skill.persona!, text);
    return { skill, score, reasons };
  }).sort((a, b) => b.score - a.score);

  return ranked.slice(0, count).map((r) => r.skill);
}

/**
 * 主入口：问题 + 用户选中的答主 → 路由决策。
 *
 * @param title    问题标题
 * @param handles  用户勾选的答主 handle；为空则走自动推荐
 */
export function routeQuestion(title: string, handles: string[] = []): RoutingDecision {
  const text = title.trim();
  const intent = classifyIntent(text);

  const picked = resolveSkills(handles);

  if (picked.length > 0) {
    const manual = picked.filter((s) => handles.includes(s.persona!.handle));
    const added = picked.filter((s) => !handles.includes(s.persona!.handle));

    const parts: string[] = [`识别为「${intent}」，你指定了 ${manual.length} 位答主`];
    if (added.length > 0) {
      parts.push(`看山补上 ${added.map((s) => s.name).join("、")} 补足讨论`);
    }

    return {
      mode: "manual",
      intent,
      picks: picked.map((s) => {
        const isManual = handles.includes(s.persona!.handle);
        const { score, reasons } = scorePersona(s.persona!, text);
        return {
          skillId: s.id,
          score: isManual ? 1 : score,
          reason: isManual
            ? "你指定的答主"
            : reasons.length > 0
              ? `补充视角：${reasons.join("；")}`
              : "补充视角，避免讨论被单一立场垄断",
        };
      }),
      summary: parts.join("；") + "。",
      queries: picked.map((s) => buildPersonaQuery(s.persona!, text)),
    };
  }

  // 自动推荐路径
  const recommended = recommendPersonas(text, MIN_SKILLS);
  return {
    mode: "auto",
    intent,
    picks: recommended.map((s) => {
      const { score, reasons } = scorePersona(s.persona!, text);
      return {
        skillId: s.id,
        score,
        reason: reasons.length > 0 ? reasons.join("；") : "按领域与风格搭配入选",
      };
    }),
    summary: `识别为「${intent}」，从 ${PERSONA_SKILLS.length} 位答主里推荐了 ${recommended
      .map((s) => s.name)
      .join("、")}。你可以换人，也可以继续邀请。`,
    queries: recommended.map((s) => buildPersonaQuery(s.persona!, text)),
  };
}

/** 把 handle 列表解析成 Skill：非法 handle 直接忽略，不猜。 */
export function resolveSkills(handles: string[]): Skill[] {
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const h of handles) {
    const skill = PERSONA_SKILLS.find((s) => s.persona!.handle === h);
    if (!skill || seen.has(h)) continue;
    seen.add(h);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

/**
 * 答主型分身的检索词。
 *
 * 实测（2026-09-14）：直接拿答主名字去搜，返回的是别人讨论他的内容，
 * 命中率极低。所以答主型分身**不靠检索名字**找证据，而是用「领域关键词」
 * 找这位答主可能会谈的相关公开内容，并在卡片上如实标注证据来源。
 */
function buildPersonaQuery(persona: Persona, title: string): string {
  const topic = extractTopic(title);
  const domain = persona.knows[0]?.split(/[、与和的]/)[0] ?? "";
  return domain ? `${topic} ${domain}` : topic;
}

/* ------------------------------ 主题词抽取 ------------------------------ */

/**
 * 从问题标题里抽一个短主题词，用于填查询模板。
 *
 * 这里刻意取短：实测发现把整句问题塞进知乎搜索会让所有分身
 * 返回同一批结果，导致多视角退化成同一个视角。
 */
const STOP = /^(如何|怎么|为什么|什么|哪些|是不是|该不该|有没有|能不能|要不要|值得|值得吗|请问|大家|今年|现在|最近)$/;

export function extractTopic(title: string): string {
  const cleaned = title
    .replace(/[?？。！!，,、；;：:"'「」《》()（）\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(" ").filter((p) => p.length > 0 && !STOP.test(p));
  if (parts.length > 1) {
    const out: string[] = [];
    let len = 0;
    for (const p of parts) {
      if (len + p.length > 16 && out.length > 0) break;
      out.push(p);
      len += p.length;
    }
    return out.join(" ");
  }

  const stripped = cleaned
    .replace(/^(如何|怎么|为什么|什么|哪些|是不是|该不该|有没有|能不能|要不要)/, "")
    .replace(/(真的是|真的|是不是|该不该|吗|呢|如何|怎么办)$/g, "")
    .trim();
  return (stripped || cleaned).slice(0, 10);
}


/**
 * 供「选择答主」步骤使用的候选列表。
 *
 * 返回全部预置答主的排序结果与可解释分数，前端一次性渲染成人格卡片，
 * 用户勾选后把 handle 列表回传给 /api/mirror。分数只用于排序与展示，
 * 不参与任何模型自评。
 */
export interface PersonaCandidate {
  handle: string;
  displayName: string;
  headline: string;
  accent: Persona["accent"];
  tone: string[];
  knows: string[];
  doesNotKnow: string[];
  catchphrases: string[];
  wordRange: [number, number];
  corpusLabel: string;
  sampleSize: number;
  real: boolean;
  score: number;
  reasons: string[];
  /** 该问题下这位答主命中率低时为 true，前端可弱化展示 */
  weakMatch: boolean;
}

export function personaCandidates(title: string): PersonaCandidate[] {
  const text = title.trim();
  return PERSONA_SKILLS.map((skill) => {
    const p = skill.persona!;
    const { score, reasons } = scorePersona(p, text);
    return {
      handle: p.handle,
      displayName: p.displayName,
      headline: p.headline,
      accent: p.accent,
      tone: p.voice.tone,
      knows: p.knows,
      doesNotKnow: p.doesNotKnow,
      catchphrases: p.catchphrases,
      wordRange: p.voice.wordRange,
      corpusLabel: corpusLabel(p),
      sampleSize: p.corpus.sampleSize,
      real: p.corpus.real,
      score,
      reasons,
      weakMatch: score <= 0.25,
    };
  }).sort((a, b) => b.score - a.score);
}

export { SKILL_SEEDS };
