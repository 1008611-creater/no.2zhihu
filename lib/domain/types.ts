// 「二号知乎」领域模型
// 核心概念：每个真实问题 → 镜像问题（Mirror）→ 多个答主分身作答 → 缺口识别 → 真人补充 → 搬运回知乎 → Human Mesh 更新
//
// v1 重构（2026-09-14）：主线从「抽象视角分身」改为「具体知乎答主的分身」。
// 评价标准是「像这个人」>「答案完美」，所以 Persona 与视角型 Skill 并存：
//   - Persona Skill 是主体，代表一个真实答主；
//   - 视角型 Skill 降级为 supplementary，只在用户没指定答主时补位。

export type Accent = "blue" | "violet" | "green" | "orange";

export type SkillKind =
  | "persona"
  | "experience"
  | "analysis"
  | "counter"
  | "method"
  | "story"
  | "risk";

/* ------------------------------ 答主人格 ------------------------------ */

/** 一个知乎答主的语言与认知特征。由真实公开回答蒸馏，或按公开印象手工撰写。 */
export interface Persona {
  /** 知乎 url_token，例如 "ban-fo-xian-ren" */
  handle: string;
  displayName: string;
  /** 一句话身份，显示在卡片上 */
  headline: string;
  accent: Accent;
  /** 1. 他知道什么：领域、经历、专业边界 */
  knows: string[];
  /** 2. 他怎么看问题：价值判断、常见立场、思考路径 */
  stance: string[];
  /** 3. 他怎么说话 */
  voice: PersonaVoice;
  /** 4. 他不知道什么：不装懂的范围 */
  doesNotKnow: string[];
  /** 语癖 / 口头禅（尽量取自真实原文） */
  catchphrases: string[];
  /** 蒸馏依据的元数据 */
  corpus: PersonaCorpus;
}

export interface PersonaVoice {
  sentenceLength: "short" | "medium" | "long" | "mixed";
  /** 目标字数区间（含），由人格自己决定，不再全站统一 */
  wordRange: [number, number];
  /** 语气标签，直接显示 */
  tone: string[];
  /** 是否习惯分点/分段 */
  usesLists: boolean;
  /** 情绪强度 0-1，越高越外放 */
  emotion: number;
  /** 举例方式的一句话描述 */
  exampleStyle: string;
  /** 一句话文风摘要，直接注入生成 prompt */
  summary: string;
  /**
   * 开口方式：这个人的第一句长什么样。
   *
   * 为什么单独抽出来：「像不像 GPT」最容易暴露的位置就是开头第一句 ——
   * 模型默认会写「这个问题其实可以从几个层面来看」。把开头用**具体句式**
   * 而不是形容词描述出来（「我干这行十几年，这种事见过不少」），
   * 模型才有一个可对齐的目标，而不是自己去填一个泛化的开头。
   */
  opening?: string;
  /**
   * 标点与排版习惯。
   *
   * 这是「遮住名字能不能认出人」最有效的一组特征：破折号、括号吐槽、
   * 省略号、问号密度、段落长度，比「语气温和」这类词有信息量得多 ——
   * 因为它是**可数**的。模型无法把「温和」落地，但可以执行「每段 2–4 句」。
   *
   * 本项目进一步把它**解析成数字**（见 lib/domain/voice.ts），
   * 用于生成后的确定性校验，而不只是当提示词文字。
   */
  punctuation?: string;
  /**
   * 反面例句：这个人**绝不会**写出来的句子。
   *
   * 只给正面示例不够 —— 模型会退回自己的默认文风。给出具体的「不要这样写」，
   * 且这些例句都写得像真实 AI 输出，才能把它从默认腔调上推开。
   */
  avoid?: string[];
  /**
   * 该人格的语感范例（2–3 句，本人风格的高仿写，非真实引文）。
   *
   * 说明：这些是为「语感对齐」构造的范例，不是抓取到的本人原话，
   * 所以 corpus.real 仍为 false、语料状态仍如实标注。范例只用于让模型
   * 抓到节奏与句式，不冒充引文，也不出现在任何面向用户的「来源」列表里。
   */
  exemplars?: string[];
}

export interface PersonaCorpus {
  /** 可选以兼容旧版浏览器记录；false 不再一律解释为预置。 */
  status?: "extracted" | "unavailable";
  note?: string;
  /** 实际用于蒸馏的回答条数；0 表示未抓取 */
  sampleSize: number;
  /** 抓取时间（ISO）；未抓取为空字符串 */
  capturedAt: string;
  /** true = 来自真实抓取蒸馏；false = 预置人格（未抓取） */
  real: boolean;
  /** 代表性来源，卡片上可逐条点开 */
  sources: SkillSource[];
}

/* ------------------------------ 分身 ------------------------------ */

/** 一个 Skill 分身：答主型由 Persona 驱动，视角型由公开回答蒸馏出的稳定视角驱动。 */
export interface Skill {
  publicFigure?: import("./publicFigures").PublicAttribution;
  id: string;
  /** 分身名。答主型 = 答主昵称；视角型 = 视角名 */
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
  accent: Accent;
  /** 该分身依据的知乎来源（真实回答） */
  sources: SkillSource[];
  /** 可信度：来自多少条真实来源 */
  confidence: number;
  /** 答主型分身携带的人格；视角型为 undefined */
  persona?: Persona;
  /** true = 降级的补充视角，不占主叙事 */
  supplementary?: boolean;
  /**
   * 本轮检索的质量统计。
   *
   * 为什么要暴露到 UI：实测检索经常返回与问题无关的内容（力学答主回答
   * 「大厂转行」时拿回 7 条力学劝退帖）。把「原始 N 条 / 跑题丢弃 M 条」
   * 如实显示出来，比假装检索成功更可信 —— 也让评委看到这层过滤真的在跑。
   */
  evidenceStats?: { dropped: number; scanned: number };
}

export interface SkillSource {
  title: string;
  author: string;
  url: string;
  excerpt: string;
  voteUp: number;
  editTime: number;
  /** 该来源的可信度 0-1：由是否取到正文、互动量等决定，不由模型自评 */
  confidence: number;
}

/* ------------------------------ 回答 ------------------------------ */

export interface AnswerDraft {
  publicFigure?: import("./publicFigures").PublicAttribution;
  generationIntegrity?: "complete" | "possibly_truncated" | "unknown";
  id: string;
  skillId: string;
  skillName: string;
  accent: Accent;
  /** 答主型分身的 handle，用于追加邀请与去重 */
  handle?: string;
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
  /** 轮次：0 = 首轮作答，1 = 对他人观点的回应 */
  round?: number;
  /** 回应的对象（回答 id），仅 round=1 时有值 */
  replyTo?: string;
  /** 回应对象的答主名，用于 UI 文案 */
  replyToName?: string;
}

/* ------------------------------ 缺口 ------------------------------ */

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
  accent: Accent;
}

/* ------------------------------ 镜像问题 ------------------------------ */

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
  /** manual = 用户指定答主；auto = 系统推荐 */
  mode: "manual" | "auto";
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

/* ------------------------------ Human Mesh ------------------------------ */

export interface MeshNode {
  id: string;
  label: string;
  type: "human" | "skill" | "keyword" | "question" | "answer" | "persona";
  weight: number;
  accent: Accent;
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
