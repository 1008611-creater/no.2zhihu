import { PERSONAS } from "./personas";
import type { Persona, Skill, SkillKind } from "./types";

/**
 * Skill 分身目录。
 *
 * v1 起分两类：
 *
 *   1. **答主型（kind: "persona"）** —— 主体。每位对应一个真实知乎答主，
 *      由 Persona 四要素（知道什么 / 怎么看 / 怎么说 / 不知道什么）驱动。
 *      这是「指定某个人回答这个问题」这个核心体验的载体。
 *   2. **视角型（supplementary: true）** —— 补充。代表社区里一种稳定的
 *      回答角度，由真实公开回答的标题 / 作者 / 摘要蒸馏而来。只在用户
 *      没有指定答主时补位，或者作为「换个角度看」的附加层。
 *
 * 两类都只描述「怎么答」，不携带答案本身；正文必须由直答基于真实证据生成。
 */

/* ------------------------------ 答主型 ------------------------------ */

/** 从人格派生出分身。答主型分身的 lens/tone/keywords 全部来自 Persona，保证一致。 */
export function skillFromPersona(p: Persona): Skill {
  return {
    id: `persona:${p.handle}`,
    name: p.displayName,
    kind: "persona",
    lens: p.headline,
    query: "",
    keywords: p.knows.slice(0, 4),
    tone: p.voice.tone,
    accent: p.accent,
    sources: p.corpus.sources,
    confidence: p.corpus.real
      ? Math.min(0.4 + p.corpus.sampleSize * 0.015, 0.95)
      : 0.3,
    persona: p,
  };
}

export const PERSONA_SKILLS: Skill[] = PERSONAS.map(skillFromPersona);

export const PERSONA_SKILL_BY_HANDLE = new Map(
  PERSONA_SKILLS.map((s) => [s.persona!.handle, s]),
);

/** 分身 id 约定：persona:<handle>。这里做一层容错解析。 */
export function personaHandleOfSkillId(skillId: string): string | null {
  return skillId.startsWith("persona:") ? skillId.slice("persona:".length) : null;
}

/* ------------------------------ 视角型（降级为补充） ------------------------------ */

interface SkillSeed {
  id: string;
  name: string;
  kind: SkillKind;
  lens: string;
  queryTemplate: string;
  keywords: string[];
  tone: string[];
  accent: Skill["accent"];
  /** 触发这个分身的信号词，用于 Human Router 打分 */
  triggers: string[];
}

export const SKILL_SEEDS: SkillSeed[] = [
  {
    id: "lived-experience",
    name: "亲历者",
    kind: "experience",
    lens: "只讲自己身上发生过的事，拒绝二手转述。",
    queryTemplate: "{topic} 亲身经历 踩坑",
    keywords: ["亲身经历", "第一人称", "真实案例"],
    tone: ["具体", "克制", "细节多"],
    accent: "blue",
    triggers: ["经历", "体验", "真实", "感受", "故事", "我是", "怎么", "会不会"],
  },
  {
    id: "structural-analysis",
    name: "拆解者",
    kind: "analysis",
    lens: "把问题拆成结构、变量和因果链，先讲框架再讲结论。",
    queryTemplate: "{topic} 岗位 真相 分析",
    keywords: ["机制", "框架", "因果", "变量"],
    tone: ["结构化", "抽象", "定义先行"],
    accent: "violet",
    triggers: ["为什么", "原理", "机制", "本质", "逻辑", "如何理解"],
  },
  {
    id: "contrarian",
    name: "反驳者",
    kind: "counter",
    lens: "先找主流共识里最脆的一环，再给出反例。",
    queryTemplate: "{topic} 被高估 劝退",
    keywords: ["误区", "反例", "被高估", "代价"],
    tone: ["锋利", "短句", "不客气"],
    accent: "orange",
    triggers: ["评价", "值得吗", "是不是", "该不该", "争议", "质疑"],
  },
  {
    id: "practitioner",
    name: "实操派",
    kind: "method",
    lens: "给可直接执行的步骤、参数和清单。",
    queryTemplate: "{topic} 怎么做 路径",
    keywords: ["步骤", "清单", "工具", "可执行"],
    tone: ["清单化", "命令式", "干货"],
    accent: "green",
    triggers: ["怎么做", "如何", "方法", "教程", "上手", "入门", "推荐"],
  },
  {
    id: "narrative",
    name: "讲故事的人",
    kind: "story",
    lens: "用一个完整叙事让抽象问题落地，保留情绪但不煽情。",
    queryTemplate: "{topic} 故事 经历",
    keywords: ["叙事", "转折", "场景"],
    tone: ["有画面", "节奏感", "留白"],
    accent: "violet",
    triggers: ["故事", "经历", "小说", "创作", "写", "叙事"],
  },
  {
    id: "risk-auditor",
    name: "风险审计",
    kind: "risk",
    lens: "专门列代价、边界条件和可能翻车的地方。",
    queryTemplate: "{topic} 风险 坑 代价",
    keywords: ["风险", "代价", "边界", "失败案例"],
    tone: ["冷静", "条件句多", "不好听"],
    accent: "orange",
    triggers: ["风险", "安全", "代价", "坑", "失败", "合规", "隐私"],
  },
];

export const SKILL_BY_ID = new Map(SKILL_SEEDS.map((s) => [s.id, s]));

export function skillAccentOf(id: string): Skill["accent"] {
  const persona = PERSONA_SKILL_BY_HANDLE.get(id);
  if (persona) return persona.accent;
  return SKILL_BY_ID.get(id)?.accent ?? "blue";
}

export type { SkillSeed };
