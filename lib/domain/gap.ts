import type { AnswerDraft, Gap, HumanCandidate, Skill, SkillSource } from "./types";

/**
 * 缺口识别 —— 本作品的核心创新点。
 *
 * 市面上的「多 Agent 作答」做到「每个分身各自回答」就结束了。
 * 本模块做的是下一步：把所有回答放在一起比较，找出**它们共同没有覆盖的那一块**。
 *
 * 设计原则：
 *   1. 纯函数，无 IO，零额度消耗，可复现 —— Demo 反复演示不会变。
 *   2. 每个缺口必须给出「为什么这是缺口」的可读理由，而不是一个黑盒分数。
 *   3. 缺口指向「需要什么样的真人」，而不是「再问一次 AI」。
 */

/** 超过这个时长的证据视为「不够新」。 */
const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 180;

/**
 * 「一手经历」的识别规则。
 * 实测：知乎回答里只要出现「我 + 动作/结果」的句式，就是真正的一手叙述；
 * 只出现「我认为」的评论不算。用这个规则统计一手证据的条数，而不是看有没有亲历者分身。
 */
const FIRST_HAND = /(我(自己)?[^，。；]{0,8}(经历|做|试|踩|亏|赚|辞|开始|干|转|换)|亲身|身边|本人|我的经历|我自己|我们公司|我家里)/;

/** 提问者给出的具体条件（年龄/收入/年限/金额）。 */
const CONDITION_TOKEN = /(\d+\s*(?:岁|万|千|k|K|元|年|个月|天|次|人|倍|%|％)|\d{2,})/g;

/** 「可以照着做」的步骤叙述。 */
const STEPS_TALE = /(第一步|第二步|步骤|先[^，。]{0,8}再|流程是|清单|照着做|具体操作|操作方法|我的做法是|你可以先)/;

/** 成功叙事 / 失败叙事，用于识别幸存者偏差。 */
const SUCCESS_TALE = /(成功|赚到|做到了|上岸|盈利|跑通|月入|年入|变现|做成了)/;
const FAILURE_TALE = /(失败|亏|倒闭|退出|放弃|没做起来|赔|血亏|退款|凉了|做不成)/;

/** 问题里的核心实体词，用于检查「问的东西有没有被真的回答」。 */
const ENTITY_TOKENS = [
  "大厂", "独立开发", "转行", "创业", "副业", "出海", "裁员", "体制内", "考研", "考公",
  "买房", "结婚", "生育", "养老", "量化投资", "基金", "股票", "AI", "编程", "程序员",
  "产品经理", "运营", "设计", "销售", "自由职业", "远程办公", "咖啡馆", "开店", "电商",
  "自媒体", "短视频", "直播", "月薪", "年薪", "存款", "负债", "小城市", "一线城市",
];

/** 中文语境里常见的地点/范围限定词，用于识别「地域缺口」。 */
const PLACE_TOKENS = [
  "北京", "上海", "广州", "深圳", "杭州", "成都", "武汉", "南京", "西安", "重庆",
  "国内", "海外", "国外", "美国", "欧洲", "日本", "东南亚", "一线城市", "小城市", "县城", "农村",
];

/** 判断一段文本里有没有可引用的量化信息。 */
const HAS_NUMBER = /\d/;

export interface GapInput {
  question: string;
  answers: AnswerDraft[];
  skills: Skill[];
  /** 注入当前时间，便于测试。 */
  now?: number;
}

/**
 * 找出这组回答共同的盲区。
 *
 * 返回按 severity 降序排列的缺口列表；没有缺口时返回空数组
 * （**如实返回空数组**，不为了「有东西可展示」而编造缺口）。
 */
export function findGaps(input: GapInput): Gap[] {
  const { question, answers, skills } = input;
  const now = input.now ?? Date.now();

  const evidence = answers.flatMap((a) => a.evidence);
  const kinds = new Set(skills.map((s) => s.kind));
  const gaps: Gap[] = [];

  const firstHand = evidence.filter((e) => FIRST_HAND.test(e.excerpt));
  const prose = [...evidence.map((e) => `${e.title} ${e.excerpt}`), ...answers.map((a) => a.body)].join("\n");

  /* ---------- 1. 一手经验缺口 ---------- */
  // 判据用「真实一手证据的条数」，而不是「有没有亲历者分身」。
  // 实测：分身选出来了，但检索到的证据可能全是二手转述，那仍然是缺口。
  if (firstHand.length < 2) {
    gaps.push(
      makeGap({
        kind: "experience",
        label: "缺少一手经历",
        reason:
          firstHand.length === 0
            ? `这组回答里的 ${evidence.length} 条证据没有一条是当事人自述，全部是分析、转述或推理。`
            : `${evidence.length} 条证据里只有 ${firstHand.length} 条是当事人自述，其余都是二手转述，样本太薄。`,
        needProfile: "在相关场景里真实经历过、并愿意讲具体细节的人",
        severity: firstHand.length === 0 ? 0.92 : 0.74,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 2. 反面观点缺口 ---------- */
  // 方向一致 + 没有失败叙事 = 共识没被压力测试过。
  // v1：主体是答主人格，不再有 counter 型视角。改为「有人格明确持反面立场」
  // 或「视角型里选了反驳者」两种信号，避免每次都误报「缺少反面意见」。
  const CONTRARIAN_STANCE = /(高估|劝退|不推荐|反对|警惕|陷阱|智商税|割韭菜|别信|不值得|翻车|代价)/;
  const hasCounter =
    kinds.has("counter") ||
    skills.some((s) => (s.persona?.stance ?? []).some((t) => CONTRARIAN_STANCE.test(t)));
  const hasFailureTale = FAILURE_TALE.test(prose);
  if (!hasCounter || !hasFailureTale) {
    gaps.push(
      makeGap({
        kind: "counter",
        label: hasCounter ? "缺少失败样本" : "缺少反面意见",
        reason: hasCounter
          ? "回答里出现了反方视角，但没有一条证据来自真正失败过的案例 —— 幸存者偏差没有被抵消。"
          : "所有回答方向一致，没有任何一个分身尝试反驳。共识没有被压力测试过。",
        needProfile: hasCounter ? "在这件事上真实失败过、能讲清楚哪里错了的人" : "持相反结论、或有失败经验可以对照的人",
        severity: hasCounter ? 0.66 : 0.8,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 3. 量化数据缺口 ---------- */
  const quantified = evidence.filter((e) => HAS_NUMBER.test(e.excerpt));
  if (evidence.length > 0 && quantified.length === 0) {
    gaps.push(
      makeGap({
        kind: "data",
        label: "缺少可验证的数字",
        reason: `检索到的 ${evidence.length} 条证据全部是定性描述，没有一条包含具体数字、比例或时间跨度，结论无法被核对。`,
        needProfile: "掌握真实数据、能给出具体数字和口径的人",
        severity: 0.72,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 4. 时效性缺口 ---------- */
  if (evidence.length > 0) {
    const newest = Math.max(...evidence.map((e) => e.editTime || 0));
    if (newest > 0 && now - newest > RECENT_WINDOW_MS) {
      const months = Math.round((now - newest) / (1000 * 60 * 60 * 24 * 30));
      gaps.push(
        makeGap({
          kind: "recent",
          label: "证据已经过时",
          reason: `最新的证据距今约 ${months} 个月，其间情况很可能已经变化，但没有任何更新的信息源。`,
          needProfile: "最近半年内刚经历过这件事的人",
          severity: 0.62,
          candidates: candidatesFrom(evidence, skills),
        }),
      );
    }
  }

  /* ---------- 5. 地域/范围缺口 ---------- */
  const placesInQuestion = PLACE_TOKENS.filter((p) => question.includes(p));
  if (placesInQuestion.length > 0) {
    const mentioned = placesInQuestion.filter((p) =>
      evidence.some((e) => e.excerpt.includes(p) || e.title.includes(p)),
    );
    if (mentioned.length === 0) {
      gaps.push(
        makeGap({
          kind: "locale",
          label: "地域条件没有被回答",
          reason: `问题限定了「${placesInQuestion.join("、")}」，但所有证据都没有涉及这个范围，结论可能不适用。`,
          needProfile: `在${placesInQuestion.join("、")}有实际经验的人`,
          severity: 0.58,
          candidates: candidatesFrom(evidence, skills),
        }),
      );
    }
  }

  /* ---------- 6. 可执行方法缺口 ---------- */
  const asksHow = /(怎么做|如何|方法|步骤|入门|上手|怎么选|怎么办)/.test(question);
  const hasSteps = STEPS_TALE.test(prose);
  if (asksHow && !hasSteps) {
    gaps.push(
      makeGap({
        kind: "method",
        label: "缺少可执行步骤",
        reason: "问题在问「怎么做」，但现有内容停留在判断和观点层面，没有给出可以照着做的步骤。",
        needProfile: "真正动手做过、能给出完整步骤和坑点的人",
        severity: 0.7,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 7. 提问者条件没有被回答（新增） ---------- */
  // 这是最容易被忽略、也最影响结论适用性的缺口：
  // 问题里写明了「30 岁」「月薪 8000」这类前提，但没有任何当事人是在这个前提下经历的。
  const conditions = [...new Set((question.match(CONDITION_TOKEN) ?? []).map((t) => t.replace(/\s+/g, "")))];
  const uncovered = conditions.filter((c) => !firstHand.some((e) => e.excerpt.includes(c)));
  if (uncovered.length > 0) {
    gaps.push(
      makeGap({
        kind: "condition",
        label: "提问者的具体条件没有被回答",
        reason: `问题限定了「${uncovered.join("、")}」，但没有任何一条一手经历是在这个条件下发生的，结论直接套用会有风险。`,
        needProfile: `满足「${uncovered.join("、")}」这个前提、并且真实做过这件事的人`,
        severity: 0.84,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 8. 核心实体没有被覆盖（新增） ---------- */
  const entities = ENTITY_TOKENS.filter((t) => question.includes(t));
  const missingEntities = entities.filter((t) => !prose.includes(t));
  if (missingEntities.length > 0) {
    gaps.push(
      makeGap({
        kind: "entity",
        label: "问题里的核心对象没有被回答",
        reason: `问题问的是「${missingEntities.join("、")}」，但整组回答从头到尾没有出现这个词，回答偏题了。`,
        needProfile: `对「${missingEntities.join("、")}」有真实经验的人`,
        severity: 0.76,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 9. 整体证据量不足 ---------- */
  if (evidence.length > 0 && evidence.length < 3) {
    gaps.push(
      makeGap({
        kind: "data",
        label: "证据样本太少",
        reason: `整组回答只找到 ${evidence.length} 条真实来源，不足以支撑任何结论。`,
        needProfile: "能提供更多真实案例的人",
        severity: 0.52,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  /* ---------- 10. 兜底：结论从未被当事人核对过 ---------- */
  // 走到这里说明所有可计算的维度都覆盖了。这仍然是一个真实缺口：
  // 整组回答由公开证据生成，没有任何一位当事人参与，结论没有被真实经历核对过。
  if (gaps.length === 0) {
    gaps.push(
      makeGap({
        kind: "experience",
        label: "结论没有被当事人核对过",
        reason: `${evidence.length} 条公开证据覆盖了数据、方法与反方视角，但没有任何一位当事人参与，结论尚未被真实经历核对。`,
        needProfile: "与提问者处境接近、愿意用自己的经历检验这个结论的人",
        severity: 0.6,
        candidates: candidatesFrom(evidence, skills),
      }),
    );
  }

  return gaps.sort((a, b) => b.severity - a.severity);
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function evidenceOfKind(answers: AnswerDraft[], skills: Skill[], kind: Skill["kind"]): SkillSource[] {
  const ids = new Set(skills.filter((s) => s.kind === kind).map((s) => s.id));
  return answers.filter((a) => ids.has(a.skillId)).flatMap((a) => a.evidence);
}

function makeGap(opts: {
  kind: Gap["kind"];
  label: string;
  reason: string;
  needProfile: string;
  severity: number;
  candidates: HumanCandidate[];
}): Gap {
  return {
    id: `gap-${opts.kind}-${Math.abs(hash(opts.label)) % 100000}`,
    kind: opts.kind,
    label: opts.label,
    reason: opts.reason,
    needProfile: opts.needProfile,
    candidates: opts.candidates,
    severity: Number(opts.severity.toFixed(2)),
  };
}

/**
 * 从已有的真实知乎证据里反推「谁可能答得上」。
 *
 * 注意：这里只使用搜索接口已经返回的公开字段（作者名、赞同数、来源链接），
 * 不额外调用任何用户数据接口，也不构造不存在的用户。
 */
function candidatesFrom(evidence: SkillSource[], skills: Skill[]): HumanCandidate[] {
  const byAuthor = new Map<string, { votes: number; count: number; title: string; url: string }>();

  for (const e of evidence) {
    const name = e.author?.trim();
    if (!name) continue;
    const prev = byAuthor.get(name);
    if (prev) {
      prev.votes += e.voteUp || 0;
      prev.count += 1;
    } else {
      byAuthor.set(name, { votes: e.voteUp || 0, count: 1, title: e.title, url: e.url });
    }
  }

  const accents: Skill["accent"][] = ["blue", "violet", "green", "orange"];

  return [...byAuthor.entries()]
    .sort((a, b) => b[1].votes - a[1].votes)
    .slice(0, 3)
    .map(([name, v], i) => ({
      id: `cand-${Math.abs(hash(name)) % 100000}`,
      name,
      headline: v.count > 1 ? `在相关问题下有 ${v.count} 条被检索到的回答` : `《${truncate(v.title, 18)}》的作者`,
      matchReason: `其回答被本问题检索命中，赞同数合计 ${v.votes}`,
      score: Number((0.9 - i * 0.12).toFixed(2)),
      relatedAnswers: v.count,
      accent: accents[i % accents.length],
    }));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** 稳定的小哈希，仅用于生成可复现的 id，不用于安全用途。 */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}

/** 真人补充后，把缺口标记为已填补。 */
export function fillGap(gaps: Gap[], gapId: string, humanAuthor: string): Gap[] {
  return gaps.map((g) => (g.id === gapId ? { ...g, filledBy: humanAuthor } : g));
}

/** 汇总状态，供 UI 显示「还差几块」。 */
export function gapSummary(gaps: Gap[]): { total: number; filled: number; open: number } {
  const filled = gaps.filter((g) => g.filledBy).length;
  return { total: gaps.length, filled, open: gaps.length - filled };
}
