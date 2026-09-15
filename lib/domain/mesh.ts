import type { Accent, MeshEdge, MeshGraph, MeshNode, MirrorQuestion } from "./types";

/**
 * 把一次镜像问题编译成 Human Mesh 关系图。
 *
 * 节点类型：问题 / 关键词 / Skill 分身 / 答主人格 / 回答 / 真人。
 *
 * ## 2026-09-15 结构重做：主干从「答主」换成「关键词」
 *
 * 旧结构（v1）是**答主辐射图**：`q → s` 路由，`s → p` 答主，`s → k` 关键词（权重 0.4、
 * 只取前 2 个、边标签「关注」），`s → a` 回答，`h → s` 真人。关键词是挂在 Skill 下面的
 * 叶子，所以整张图读起来是「有几个答主、各自关注什么」，而不是「这些话题之间怎么连起来」。
 * 用户要看的是后者（「网络小说 — 互联网行业 — 金融」这种主题网络），答主应该是次级信息。
 *
 * 新结构分三层，边的语义仍然是「因为什么而连在一起」，全部来自真实数据：
 *
 *   ① 主题层（主干）：关键词节点之间互连。同一位答主领域清单里的关键词两两相连
 *      （边标签「同一答主的领域」）—— 这是**真实的共现关系**，来自 persona.knows，
 *      不是编的。答主有几个领域，主题层就有几个小簇。
 *   ② 跨簇桥：不同答主的簇心之间直连一条边，标签写清依据 ——
 *      · 「同一来源同时提到」：两个领域词**同时出现在同一条真实知乎来源**里，
 *        这是证据级的桥，权重高（0.7）；
 *      · 「同一场问答共同命中」：这一场问答把它们同时选中了（依据是 `routing.picks`，
 *        不是语义猜测），权重低（0.35），只表示「同一个问题把这两簇主题连起来了」。
 *      两条边都带依据标签，读者可以自己核对，不存在「画一条看起来有道理的关系」。
 *      问题节点另有一条 `q → 簇心` 的边（「本次问题命中」），保证主题层与问题相连。
 *   ③ 次级层：Skill 挂在它自己的首个领域词上（边标签「由他作答」），人格挂在 Skill 上，
 *      回答挂在 Skill 上，真人挂在回答/问题上。答主从「图的中心」退成「主题的注脚」。
 *
 * 计数上的硬约束（见验收标准 1）：关键词之间的边数必须**多于**关键词与答主之间的边数。
 * 这里靠两点保证：主题层用**簇内两两相连**（n 个词给 C(n,2) 条边），
 * 而 Skill 只挂**首个**领域词（每位答主 1 条）。
 *
 * 节点数硬上限 NODE_BUDGET，超了按「轮转截断」处理：先保证每位答主至少 1 个领域词，
 * 再一轮一轮地补第 2、第 3 个，直到预算用完 —— 这样不会出现「某位答主的主题整簇消失」。
 */
export function buildMesh(mirror: MirrorQuestion): MeshGraph {
  const nodes: MeshNode[] = [];
  const edges: MeshEdge[] = [];
  const seen = new Set<string>();

  const add = (n: MeshNode) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    nodes.push(n);
    return true;
  };
  const link = (source: string, target: string, label: string, weight: number) => {
    edges.push({ source, target, label, weight });
  };

  const qid = `q:${mirror.id}`;

  /* ---------------------- 预算：先给次级层留位，其余全给主题层 ---------------------- */

  const personas = new Set<string>();
  for (const s of mirror.skills) if (s.persona) personas.add(s.persona.handle);
  const humans = collectHumans(mirror);
  const reserved = 1 + mirror.skills.length + personas.size + mirror.answers.length + humans.length;
  const kwBudget = Math.max(mirror.skills.length, NODE_BUDGET - reserved);
  /* ---------------------- ① 主题层：真实领域关键词 ---------------------- */

  /** 轮转截断：第 r 轮取每位答主的第 r 个领域词。 */
  const picked: Array<{ kw: string; skillId: string }> = [];
  const kwSeen = new Set<string>();
  for (let round = 0; round < KEYWORDS_PER_SKILL; round++) {
    for (const skill of mirror.skills) {
      if (picked.length >= kwBudget) break;
      const raw = skill.keywords[round];
      if (!raw) continue;
      const kw = raw.trim();
      if (!kw || kwSeen.has(kw)) continue;
      kwSeen.add(kw);
      picked.push({ kw, skillId: skill.id });
    }
    if (picked.length >= kwBudget) break;
  }

  const accentOfSkill = new Map(mirror.skills.map((s) => [s.id, s.accent]));
  /** 允许进图的真人（预算内），超出的人不再加节点，保证节点数真的守得住 25。 */
  const allowedHumans = new Set(humans.map((h) => h.name));
  /** 每位答主的首个领域词 —— 它同时是「簇心」与 Skill 的挂载点。 */
  const hubOfSkill = new Map<string, string>();
  for (const p of picked) if (!hubOfSkill.has(p.skillId)) hubOfSkill.set(p.skillId, p.kw);

  const hubCount = new Map<string, number>();
  for (const p of picked) hubCount.set(p.kw, (hubCount.get(p.kw) ?? 0) + 1);

  for (const p of picked) {
    const shared = hubCount.get(p.kw) ?? 1;
    add({
      id: `k:${p.kw}`,
      // 领域词原文很长（「互联网商业模式与资本运作」），节点上放不下；
      // label 用首短语做显示名，full 保留原文给悬停提示与详情面板。
      label: shortLabel(p.kw),
      full: p.kw,
      type: "keyword",
      // 被多位答主同时命中 → 更重，视觉上直接读出「这是共同话题」。
      weight: shared > 1 ? 0.9 : 0.55,
      accent: shared > 1 ? "orange" : accentOfSkill.get(p.skillId) ?? "violet"
    });
  }

  // 簇内两两相连 —— 主干边，标签写明依据是「同一位答主的领域清单」。
  for (const skill of mirror.skills) {
    const mine = picked.filter((p) => p.skillId === skill.id).map((p) => p.kw);
    for (let i = 0; i < mine.length; i++) {
      for (let j = i + 1; j < mine.length; j++) {
        link(`k:${mine[i]}`, `k:${mine[j]}`, "同一答主的领域", 0.5);
      }
    }
  }

  // 真实证据级的跨主题桥：两位答主的领域词同时出现在同一条真实来源里 → 用「同一来源同时提到」；
  // 否则退回「同一场问答共同命中」—— 依据是 `mirror.routing.picks` 真实选中的答主，
  // 不是语义猜测。标签写清楚依据，读者可以自己去核对。
  const sourceTexts = mirror.skills.flatMap((s) => s.sources.map((x) => `${x.title} ${x.excerpt}`));
  const hubs = [...new Set(hubOfSkill.values())];
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const a = hubs[i];
      const b = hubs[j];
      // 只在**不同答主**之间连：同一位答主的两个领域词已经在簇内连过了。
      if (skillOwning(picked, a) === skillOwning(picked, b)) continue;
      const sa = shortLabel(a);
      const sb = shortLabel(b);
      if (sa === sb) continue;
      if (sourceTexts.some((t) => t.includes(sa) && t.includes(sb))) {
        link(`k:${a}`, `k:${b}`, "同一来源同时提到", 0.7);
      } else {
        link(`k:${a}`, `k:${b}`, "同一场问答共同命中", 0.35);
      }
    }
  }

  /* ---------------------- ② 问题枢纽 ---------------------- */

  add({
    id: qid,
    label: mirror.title.length > 22 ? mirror.title.slice(0, 22) + "…" : mirror.title,
    full: mirror.title,
    type: "question",
    weight: 1,
    accent: "blue"
  });

  for (const kw of hubs) link(qid, `k:${kw}`, "本次问题命中", 0.45);

  /* ---------------------- ③ 次级层：Skill / 人格 / 回答 / 真人 ---------------------- */

  for (const skill of mirror.skills) {
    add({ id: `s:${skill.id}`, label: skill.name, type: "skill", weight: skill.confidence, accent: skill.accent });

    // Skill 不再被关键词环绕，只挂在自己的簇心上 —— 答主是主题的注脚，不是图的中心。
    const hub = hubOfSkill.get(skill.id);
    if (hub) link(`k:${hub}`, `s:${skill.id}`, "由他作答", 0.6);
    else link(qid, `s:${skill.id}`, "路由", skill.confidence);

    if (skill.persona) {
      const pid = `p:${skill.persona.handle}`;
      add({
        id: pid,
        label: skill.persona.displayName,
        type: "persona",
        weight: skill.persona.corpus.real ? 0.85 : 0.5,
        accent: skill.accent
      });
      link(
        `s:${skill.id}`,
        pid,
        skill.persona.corpus.real ? `蒸馏 ${skill.persona.corpus.sampleSize} 条` : "预置人格",
        0.8
      );
    }

    // 来源作者：真实写过相关回答的真人，挂在他提供证据的那位答主上。
    for (const h of humans) {
      if (h.skillId !== skill.id || h.voteUp === undefined) continue;
      const hid = `h:${h.name}`;
      add({
        id: hid,
        label: h.name,
        type: "human",
        weight: Math.min(1, 0.4 + h.voteUp / 500),
        accent: skill.accent
      });
      link(hid, `s:${skill.id}`, `赞同 ${h.voteUp}`, 0.6);
    }
  }

  for (const ans of mirror.answers) {
    const aid = `a:${ans.id}`;
    const isReply = (ans.round ?? 0) > 0;
    add({
      id: aid,
      label: isReply ? ans.skillName + " 回应" : ans.skillName,
      type: "answer",
      weight: isReply ? 0.55 : 0.7,
      accent: ans.accent
    });
    link(`s:${ans.skillId}`, aid, isReply ? "回应" : "作答", isReply ? 0.55 : 0.7);
    if (ans.humanAuthor && allowedHumans.has(ans.humanAuthor.trim())) {
      const hid = `h:${ans.humanAuthor}`;
      add({ id: hid, label: ans.humanAuthor, type: "human", weight: 0.9, accent: "green" });
      link(hid, aid, "真人补充", 0.95);
    }
  }

  for (const gap of mirror.gaps) {
    if (!gap.filledBy || !allowedHumans.has(gap.filledBy.trim())) continue;
    const hid = `h:${gap.filledBy}`;
    if (!add({ id: hid, label: gap.filledBy, type: "human", weight: 0.9, accent: "green" })) continue;
    link(hid, qid, "补上缺口", 0.9);
  }

  return { nodes, edges };
}

/** 关系图节点上限 —— 超过这个数就没人读得懂（验收标准 4）。 */
const NODE_BUDGET = 25;

/** 每位答主最多贡献几个领域关键词（主干节点）。 */
const KEYWORDS_PER_SKILL = 3;

/**
 * 真人节点上限。
 *
 * 真人层是产品的落点，但一张图里塞满人名会盖住主题 —— 旧的 `s → h` 每位答主取 2 条来源作者，
 * 4 位答主就是 8 个真人节点，把「主题网络」淹没了。这里收到 2 个，
 * 且优先展示**真的补过内容的真人**，其次才是来源作者（按赞同数排）。
 */
const MAX_HUMANS = 2;

/** 一位真人候选：来源作者挂在自己的 Skill 上，真人补充者挂在回答/问题上。 */
interface HumanPick {
  name: string;
  /** 有值 = 这位是某位答主检索到的来源作者，挂在那个 Skill 上 */
  skillId?: string;
  voteUp?: number;
}

/**
 * 真人候选：先「补过内容的人」，再按赞同数取来源作者。顺序即优先级。
 *
 * ⚠️ 这里返回的必须是**最终真的会被加进图里**的那些人。
 * 早期版本先把来源作者也算进预算、却不真的加节点，导致主题层被无谓地少分 2 个名额
 * （实测 4 位答主时关键词只有 10 个而不是 12 个）—— 预算与实际不一致是隐蔽的浪费。
 */
function collectHumans(mirror: MirrorQuestion): HumanPick[] {
  const out: HumanPick[] = [];
  const seen = new Set<string>();
  const push = (name: string | undefined, extra: Partial<HumanPick> = {}) => {
    const t = (name ?? "").trim();
    if (!t || seen.has(t) || out.length >= MAX_HUMANS) return;
    seen.add(t);
    out.push({ name: t, ...extra });
  };

  for (const a of mirror.answers) push(a.humanAuthor);
  for (const g of mirror.gaps) push(g.filledBy);
  const authors = mirror.skills
    .flatMap((s) => s.sources.map((src) => ({ src, skillId: s.id })))
    .sort((a, b) => b.src.voteUp - a.src.voteUp);
  for (const a of authors) push(a.src.author, { skillId: a.skillId, voteUp: a.src.voteUp });
  return out;
}

/** 领域词原文太长，节点上放不下 —— 取首个短语做显示名。原文进 `full`。 */
function shortLabel(raw: string): string {
  const head = raw.split(/[、，,（(·／/]/)[0].trim() || raw.trim();
  return head.length > 12 ? head.slice(0, 12) + "…" : head;
}

/** 这个关键词属于哪位答主（轮转截断后可能一位答主有多个，取首个）。 */
function skillOwning(picked: Array<{ kw: string; skillId: string }>, kw: string): string | undefined {
  return picked.find((p) => p.kw === kw)?.skillId;
}

/**
 * 领域关键词最多展示多少个。
 *
 * 12 场问题 × 每位答主若干关键词，去重后轻易上百。全画出来是一团毛线，
 * 看不出「我到底在关心什么」。只留出现频次最高的一批，剩下的领域
 * 由它们各自的边自然带出，读者一眼能抓住主线。
 */
const MAX_KEYWORDS = 24;

/**
 * 把「我创作过的内容」编译成一张网络 —— 「我的 Mesh」tab 的核心。
 *
 * 与 buildMesh 的分工：
 *   · buildMesh 讲的是**一场**问答内部的关系（问题 → 分身 → 回答 → 真人）；
 *   · 这张网讲的是**我这个人**的创作版图 —— 我提过哪些问题，它们落在哪些领域上。
 *
 * 所以节点只有两类，且全部来自真实数据，不做随机生成：
 *   · question —— 我提过的每一个问题（内容节点）
 *   · keyword  —— 跨全部问题聚合出的领域关键词，权重 = 被多少个问题命中
 * 边是「这个问题属于这个领域」。
 *
 * 为什么不再把「已有分身的答主 / 连进这张网的真实作者 / 我的其他镜像问题」
 * 混进来：那三类都是**清单**，不是这张网的结构；它们挂在图旁边只会让
 * 「我创作了什么」这个主题失焦。需要看人，去「分身发现」；需要重进某一场，
 * 去广场的「我曾经提问过的」。
 */
export function buildCorpusMesh(history: MirrorQuestion[]): MeshGraph {
  const nodes: MeshNode[] = [];
  const edges: MeshEdge[] = [];
  const seen = new Set<string>();
  const add = (n: MeshNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  /** 关键词 → 被多少个问题命中 */
  const kwCount = new Map<string, number>();
  /** 关键词 → 各 accent 的出现次数，取最高频的那个给节点上色 */
  const kwAccent = new Map<string, Map<Accent, number>>();
  /** 每个问题命中的关键词（去重后） */
  const perQuestion = new Map<string, string[]>();

  for (const m of history) {
    const kws = new Set<string>();
    for (const skill of m.skills) {
      for (const kw of skill.keywords.slice(0, 3)) {
        const key = kw.trim();
        if (!key) continue;
        kws.add(key);
        const tally = kwAccent.get(key) ?? new Map<Accent, number>();
        tally.set(skill.accent, (tally.get(skill.accent) ?? 0) + 1);
        kwAccent.set(key, tally);
      }
    }
    perQuestion.set(m.id, [...kws]);
    for (const kw of kws) kwCount.set(kw, (kwCount.get(kw) ?? 0) + 1);
  }

  const ranked = [...kwCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = new Set(ranked.slice(0, MAX_KEYWORDS).map(([kw]) => kw));
  const maxCount = Math.max(1, ...kwCount.values());

  for (const [kw, count] of ranked) {
    if (!kept.has(kw)) continue;
    const tally = kwAccent.get(kw);
    const accent = tally
      ? ([...tally.entries()].sort((a, b) => b[1] - a[1])[0][0] as Accent)
      : "violet";
    add({
      id: `ck:${kw}`,
      label: kw,
      type: "keyword",
      // 出现越多的问题里，这个词越重 —— 视觉上直接读出「我的主要领域」。
      weight: 0.35 + 0.65 * (count / maxCount),
      accent,
    });
  }

  for (const m of history) {
    const qid = `cq:${m.id}`;
    add({
      id: qid,
      label: m.title.length > 20 ? m.title.slice(0, 20) + "…" : m.title,
      type: "question",
      weight: 1,
      accent: "blue",
    });
    for (const kw of perQuestion.get(m.id) ?? []) {
      if (!kept.has(kw)) continue;
      edges.push({
        source: qid,
        target: `ck:${kw}`,
        label: "属于",
        weight: (kwCount.get(kw) ?? 1) / maxCount,
      });
    }
  }

  return { nodes, edges };
}
