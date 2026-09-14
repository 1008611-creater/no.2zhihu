// 「二号知乎」领域模型
// 核心概念：每个真实问题 → 镜像问题（Mirror）→ 多个 Skill 分身作答 → 缺口识别 → 真人补充 → 搬运回知乎 → Human Mesh 更新

export type SkillKind = "experience" | "analysis" | "counter" | "method" | "story" | "risk";

/** 一个 Skill 分身：由知乎真实公开回答蒸馏出的可解释视角。 */
export interface Skill {
  id: string;
  /** 分身名，例如「亲历者」 */
  name: string;
  kind: SkillKind;
  /** 一句话视角说明，显示在卡片上 */
  lens: string;
  /** 检索这个问题时用的查询词模板 */
  query: string;
  /** 从知乎公开数据里蒸馏出的关键词 */
  keywords: string[];
  /** 文风标签 */
  tone: string[];
  /** 状态色 key，对应设计系统 */
  accent: "blue" | "violet" | "green" | "orange";
  /** 该分身依据的知乎来源（真实回答） */
  sources: SkillSource[];
  /** 可信度：来自多少条真实来源 */
  confidence: number;
}

export interface SkillSource {
  title: string;
  author: string;
  url: string;
  excerpt: string;
  voteUp: number;
  editTime: number;
}

export interface AnswerDraft {
  id: string;
  skillId: string;
  skillName: string;
  accent: Skill["accent"];
  /** 回答正文 */
  body: string;
  /** 该回答用到的知乎证据 */
  evidence: SkillSource[];
  /** 生成时间 */
  createdAt: number;
  /** 状态：AI 生成 / 真人补充 / 已搬运 */
  status: "ai" | "human" | "handed-off";
  /** 真人补充者（如有） */
  humanAuthor?: string;
  /** 是否由直答模型生成 */
  generatedBy: "zhida" | "retrieval";
}

export interface Gap {
  id: string;
  /** 缺口类型 */
  kind: "experience" | "data" | "counter" | "locale" | "recent" | "method" | "condition" | "entity";
  label: string;
  /** 为什么这是缺口 */
  reason: string;
  /** 需要什么样的真人 */
  needProfile: string;
  /** 匹配到的真人候选 */
  candidates: HumanCandidate[];
  /** 严重度，用于排序 */
  severity: number;
  /** 已由哪位真人补充 */
  filledBy?: string;
}

export interface HumanCandidate {
  id: string;
  name: string;
  headline: string;
  /** 匹配理由 */
  matchReason: string;
  /** 匹配分 0-1 */
  score: number;
  /** 该真人在知乎的相关公开回答数 */
  relatedAnswers: number;
  accent: Skill["accent"];
}

export interface MirrorQuestion {
  id: string;
  title: string;
  /** 来源：用户手输 / 知乎链接 / 热榜 */
  origin: "typed" | "zhihu-link" | "hot";
  sourceUrl?: string;
  createdAt: number;
  /** Human Router 的决策说明 */
  routing: RoutingDecision;
  skills: Skill[];
  answers: AnswerDraft[];
  gaps: Gap[];
  /** 搬运状态 */
  handoff: HandoffState;
  /** 贡献值变化记录 */
  contributions: ContributionEvent[];
}

export interface RoutingDecision {
  /** 命中的问题类型 */
  intent: string;
  /** 选择的 Skill id 及理由 */
  picks: Array<{ skillId: string; reason: string; score: number }>;
  /** 一句话解释路由逻辑 */
  summary: string;
  /** 检索用到的真实查询词 */
  queries: string[];
}

export interface HandoffState {
  status: "not-ready" | "ready" | "opened" | "confirmed";
  /** 真实知乎问题链接 */
  targetUrl?: string;
  /** 深链打开的真实编辑器地址 */
  editorUrl?: string;
  /** 用户确认搬运的时间 */
  confirmedAt?: number;
  /** 真实发布状态说明 */
  note: string;
}

export interface ContributionEvent {
  at: number;
  who: string;
  delta: number;
  reason: string;
}

/** Human Mesh 图 */
export interface MeshNode {
  id: string;
  label: string;
  type: "human" | "skill" | "keyword" | "question" | "answer";
  weight: number;
  accent: Skill["accent"];
}

export interface MeshEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}

export interface MeshGraph {
  nodes: MeshNode[];
  edges: MeshEdge[];
}
