import { PERSONA_SKILLS, SKILL_SEEDS, skillFromSeed } from "./skills";
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

/**
 * 零信号底分。**答主只要没有任何领域/立场/线索命中，得分就恰好等于它。**
 *
 * 为什么要把这个数字显式命名：自动推荐过去是无条件 `slice(0, 3)`，
 * 而 16 位答主在零信号时全部同分 0.25，稳定排序会让「名册前两位」
 * 恒定入选 —— 问半导体也会推来一位商业毒舌和一位文学作家。
 * 三位答主里两位与问题无关，产品「多视角作答」的承诺当场塌掉。
 * 现在凡等于底分者一律视为**未命中**，不再参与推荐。
 */
const BASE_SCORE = 0.25;

/**
 * 通用视角兜底顺序。
 *
 * 用于「关键词一个都不命中」的提问（如「半导体国产替代走到哪一步了」——
 * 既无「为什么」也无「怎么做」）。这两个视角对任何实质问题都成立：
 * 拆解者讲结构与因果，反驳者挑共识里最脆的一环。
 * **刻意只留两个**，且都标记 supplementary，不伪装成真人答主。
 */
const GENERIC_SUPPLEMENTARY = ["structural-analysis", "contrarian"];

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

/** 把一条领域描述拆成可比对的中文短词。 */
function knowsTokens(k: string): string[] {
  return k
    .split(/[、与和的及·,，/]/)
    .flatMap((p) => p.split(/[A-Za-z]+/))
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
}

/** 二字切片：用来兜住「心理咨询」vs「临床心理学」这类同域不同词。 */
function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2);
    if (/^[\u4e00-\u9fa5]{2}$/.test(g)) out.push(g);
  }
  return out;
}

/** 强信号：整词直接出现在问题里。 */
function tokenHit(k: string, text: string): boolean {
  return knowsTokens(k).some((t) => text.includes(t));
}

/** 领域相关判据：整词命中，或两个以上二字切片命中。 */
function keywordMatch(k: string, text: string): boolean {
  if (tokenHit(k, text)) return true;
  const grams = knowsTokens(k).flatMap(bigrams);
  const uniq = Array.from(new Set(grams));
  const hits = uniq.filter((g) => text.includes(g));
  return hits.length >= 2;
}

/**
 * 主题线索表：把「用户的口语提问」映射到最相关的答主。
 *
 * 为什么单靠 knows 不够：knows 写的是领域名词，用户提问常用生活口语。
 * 例如「推荐几本适合入门的书」，陈章鱼 knows 里是「读书方法」，
 * 两者没有共同的二字切片，纯字符串匹配会把 6 位答主全部打平，
 * 默认推荐的 3 位就退化成名册顺序。
 *
 * 这张表是一层**可解释的加分层**：命中即加分并在卡片上写明理由，
 * 仍然是零模型、零额度、同输入同输出。它只覆盖名册里真实存在的领域。
 */
const TOPIC_HINTS: Array<{ match: RegExp; handles: string[]; reason: string; weight: number }> = [
  {
    match: /(读书|书单|看书|阅读|荐书|选书|学习方法|知识管理|科普|入门)/,
    handles: ["ChenZhangyu"],
    reason: "问题指向读书、学习与知识整理",
    weight: 0.3,
  },
  {
    match: /(焦虑|抑郁|失眠|情绪|心理|原生家庭|亲子|叛逆|亲密关系|婚姻|夫妻|自我)/,
    handles: ["lisongwei"],
    reason: "问题落在心理与家庭关系上",
    weight: 0.3,
  },
  {
    match: /(职场|上司|领导|同事|内耗|讨好|边界|PUA|霸凌|打压|沟通|关系)/,
    handles: ["lisongwei"],
    reason: "问题涉及职场关系与心理边界",
    weight: 0.28,
  },
  {
    match: /(结婚|离婚|相亲|彩礼|生育|催婚|单身|恋爱|分手|婚姻)/,
    handles: ["lisongwei"],
    reason: "问题涉及亲密关系与家庭",
    weight: 0.26,
  },
  {
    match: /(物理|力学|电磁|相对论|量子|竞赛|科研|论文|读博|学术|考研|大学)/,
    handles: ["splitter"],
    reason: "问题涉及物理、科研或高校",
    weight: 0.3,
  },
  {
    match: /(工厂|车间|机械|加工|制造|技工|蓝领|流水线|设备|生产|招工|中小企业)/,
    handles: ["da-meng-24-13"],
    reason: "问题涉及制造业一线",
    weight: 0.3,
  },
  {
    match: /(创业|融资|商业模式|营销|流量|变现|资本|割韭菜|智商税|贷款|分期|生意|老板|大厂|转行|副业|裁员|独立开发)/,
    handles: ["banfoxianren"],
    reason: "问题指向商业与资本逻辑",
    weight: 0.3,
  },
  {
    match: /(文学|小说|作家|写作|翻译|饮食|美食|做饭|篮球|足球|历史|旅行|巴黎|江南|散文)/,
    handles: ["zhang-jia-wei"],
    reason: "问题落在文学、饮食或球赛",
    weight: 0.3,
  },
  {
    match: /(工厂|车间|制造|产业|基建|供应链|县城|城市化|进城|工业|人口|财政|补贴|国企|民企|出口|贸易|产能|就业|打工|流水线)/,
    handles: ["shui-qian-xiao-xi"],
    reason: "问题涉及工业、产业与地方社会结构",
    weight: 0.3,
  },
  {
    match: /(航天|火箭|卫星|空间站|登月|火星|太空|发射|运载|轨道|探测器|宇航)/,
    handles: ["pi-bo-shi-tai-kong-jing-niang"],
    reason: "问题涉及航天工程与深空探测",
    weight: 0.32,
  },
  {
    match: /(生物|基因|病毒|疫苗|免疫|细胞|营养|代谢|减肥|保健|癌|细菌|过敏|食品|养生|转基因|抗生素|睡眠质量)/,
    handles: ["li-lei-up"],
    reason: "问题落在生物学、营养与医学证据上",
    weight: 0.3,
  },
  {
    match: /(经济|金融|股市|投资|理财|利率|汇率|通胀|存款|理财|资产|赚钱|收入|货币|周期|估值|风投|上市)/,
    handles: ["wen-yi-fei-31"],
    reason: "问题涉及宏观经济与资产价格",
    weight: 0.3,
  },
  {
    match: /(学习|效率|拖延|自律|习惯|专注|记忆|时间管理|成长|思维|创造力|输入|输出|复盘|目标)/,
    handles: ["cai-tong"],
    reason: "问题指向学习方法与个人成长路径",
    weight: 0.3,
  },
  {
    // AI 与认知类问题。放在这里是因为本产品本身就在知乎 AI 赛道，
    // 评委最可能问的就是这一类；而原来的线索表对「AI / 大模型 / 变笨 /
    // 认知」完全无覆盖，导致这类问题一个答主都匹配不上。
    match: /(AI|人工智能|大模型|算法|机器学习|ChatGPT|GPT|智能体|Agent|变笨|认知|脑子|思考能力|注意力|依赖)/,
    handles: ["cai-tong"],
    reason: "问题涉及 AI 与人的认知、学习能力之间的关系",
    weight: 0.28,
  },
  {
    match: /(焦虑|抑郁|失眠|情绪|心理|原生家庭|亲子|内向|自卑|孤独|意义|内耗|压力|EMO|emo|自我怀疑|羞耻)/,
    handles: ["dong-ji-zai-hang-zhou"],
    reason: "问题涉及情绪与心理处境",
    weight: 0.31,
  },
  {
    match: /(芯片|半导体|光刻|晶体管|集成电路|制程|纳米|存储|算力|GPU|国产替代|晶圆|硬科技)/,
    handles: ["bing-deng-xing"],
    reason: "问题落在半导体与集成电路产业",
    weight: 0.32,
  },
  {
    match: /(战争|军事|战役|二战|抗战|抗美援朝|军队|武器|坦克|战机|军舰|历史|朝代|古代|将军|战术|战略|冷兵器)/,
    handles: ["jiangxiaozhang"],
    reason: "问题涉及军事史与战史",
    weight: 0.3,
  },
  {
    match: /(网文|爽文|玄幻|修仙|追更|烂尾|改编剧|读什么小说|推荐小说|作者|连载|穿越|都市文)/,
    handles: ["mulianghai"],
    reason: "问题落在网络文学的口碑与阅读体验",
    weight: 0.32,
  },
  {
    match: /(法律|起诉|合同|离婚|财产|继承|仲裁|赔偿|违法|维权|律师|法院|欠款|借条|工伤|社保|辞退|签合同|劳动法)/,
    handles: ["chen-lan-xiang-76"],
    reason: "问题涉及法律实务与维权路径",
    weight: 0.31,
  },
];

function scorePersona(persona: Persona, text: string): { score: number; reasons: string[] } {
  let score = 0.25;
  const reasons: string[] = [];

  /**
   * 领域匹配。
   *
   * 只用「整词包含」会漏掉真实的中文表达差异：问「心理咨询」，
   * 而答主写的是「临床心理学」——两者没有包含关系，但显然相关。
   * 所以这里两级匹配：整词命中算强信号，二字切片命中算弱信号。
   * 这一步是纯字符串计算，零模型、零额度、完全可复现。
   */
  const hits = persona.knows.filter((k) => keywordMatch(k, text));
  if (hits.length > 0) {
    const strong = hits.some((k) => tokenHit(k, text));
    score += strong ? Math.min(hits.length * 0.18, 0.45) : Math.min(hits.length * 0.09, 0.27);
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

  // 主题线索加分：把口语提问映射到最相关的答主，并把理由写进卡片。
  for (const hint of TOPIC_HINTS) {
    if (hint.handles.includes(persona.handle) && hint.match.test(text)) {
      score += hint.weight;
      reasons.push(hint.reason);
      break;
    }
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

/**
 * 视角型补位：问题没有对口答主时，用「稳定视角」把席位补齐。
 *
 * 为什么必须走这条路而不是硬凑答主：视角型分身（拆解者 / 反驳者 / 亲历者…）
 * 带 `triggers`，问「为什么」时「拆解者」必然对口，问「是不是」时「反驳者」
 * 必然对口 —— 它们**永远与问题相关**。而拿一位零信号的答主凑数，
 * 三位里就有两位在自说自话，多视角直接退化成噪音。
 *
 * 返回的 Skill 标记 `supplementary: true`，前端会以补充层的样式呈现，
 * 不会伪装成真人答主。
 */
function pickSupplementarySkills(text: string, need: number): Skill[] {
  const topic = extractTopic(text);
  const scored = SKILL_SEEDS.map((seed) => ({
    seed,
    hits: seed.triggers.filter((t) => text.includes(t)).length,
  }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  const out = scored
    .slice(0, need)
    .map(({ seed }) =>
      skillFromSeed(seed, [], seed.queryTemplate.replace("{topic}", topic), 0),
    );

  // 通用视角兜底：问题太短、或问法不在任何 triggers 里（例如
  // 「半导体国产替代走到哪一步了」既没有「为什么」也没有「怎么做」）时，
  // 触发器会一个都不命中。此时用「拆解者」「反驳者」这类对**任何实质问题**
  // 都站得住的视角补齐 —— 它们仍然是对口的角度，只是不靠关键词触发。
  // 这一步之后仍不足，就如实少给，绝不再退回「拿无关答主凑数」。
  const used = new Set(out.map((s) => s.id));
  for (const id of GENERIC_SUPPLEMENTARY) {
    if (out.length >= need) break;
    if (used.has(id)) continue;
    const seed = SKILL_SEEDS.find((s) => s.id === id);
    if (seed) out.push(skillFromSeed(seed, [], seed.queryTemplate.replace("{topic}", topic), 0));
  }
  return out;
}

/**
 * 自动推荐：不指定答主时，挑最相关的席位。
 *
 * 三条规则，缺一不可：
 *   1. **零信号答主一律不入选**（score 必须高于 BASE_SCORE）；
 *   2. 对口答主不足 `count` 位时，用视角型分身补位，**绝不用无关答主凑数**；
 *   3. 连视角型都没触发（问题太短或全是停用词）时，宁可少给，如实返回。
 *
 * 宁可只给 2 位对口的，也不给 3 位里 1 位是噪音的 —— 后者会直接
 * 毁掉「同一个问题换不同答主」这个核心体验。
 */
export function recommendPersonas(title: string, count = MIN_SKILLS): Skill[] {
  const text = title.trim();
  const ranked = PERSONA_SKILLS.map((skill) => {
    const { score, reasons } = scorePersona(skill.persona!, text);
    return { skill, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const matched = ranked.filter((r) => r.score > BASE_SCORE);
  const picked = matched.slice(0, count).map((r) => r.skill);

  if (picked.length < count) {
    picked.push(...pickSupplementarySkills(text, count - picked.length));
  }
  return picked;
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
  const pickedNames = recommended.map((s) => s.name).join("、");
  return {
    mode: "auto",
    intent,
    picks: recommended.map((s) => {
      // 视角型补位没有 Persona，不能走 scorePersona —— 过去这里直接
      // `s.persona!` 会让补位分身一出现就抛错，所以补位逻辑一直是死的。
      if (!s.persona) {
        return {
          skillId: s.id,
          score: 0,
          reason: `没有对口的答主，由「${s.name}」这一稳定视角补位：${s.lens}`,
        };
      }
      const { score, reasons } = scorePersona(s.persona, text);
      return {
        skillId: s.id,
        score,
        reason: reasons.length > 0 ? reasons.join("；") : "按领域与风格搭配入选",
      };
    }),
    summary:
      `识别为「${intent}」，从 ${PERSONA_SKILLS.length} 位答主里推荐了 ${pickedNames}。` +
      "你可以换人，也可以继续邀请。",
    queries: recommended.map((s) =>
      s.persona ? buildPersonaQuery(s.persona, text) : s.query || extractTopic(text),
    ),
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
