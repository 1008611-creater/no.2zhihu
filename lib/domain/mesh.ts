import type { Accent, MeshEdge, MeshGraph, MeshNode, MirrorQuestion } from "./types";

/**
 * 把一次镜像问题编译成 Human Mesh 关系图。
 *
 * 节点类型：问题 / 答主人格 / Skill 分身 / 关键词 / 回答 / 真人。
 * 边的语义是「因为什么而连在一起」，全部来自真实数据，不做随机生成。
 *
 * v1 起人格节点独立成环：它代表「AI 这一侧的完整人格」，与「真人」分开，
 * 让评委一眼看出这张网里哪些是蒸馏出来的分身、哪些是真正的人。
 */
export function buildMesh(mirror: MirrorQuestion): MeshGraph {
  const nodes: MeshNode[] = [];
  const edges: MeshEdge[] = [];
  const seen = new Set<string>();

  const add = (n: MeshNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  add({
    id: `q:${mirror.id}`,
    label: mirror.title.length > 22 ? mirror.title.slice(0, 22) + "…" : mirror.title,
    type: "question",
    weight: 1,
    accent: "blue"
  });

  for (const skill of mirror.skills) {
    add({ id: `s:${skill.id}`, label: skill.name, type: "skill", weight: skill.confidence, accent: skill.accent });
    edges.push({ source: `q:${mirror.id}`, target: `s:${skill.id}`, label: "路由", weight: skill.confidence });

    // 答主人格节点：与 Skill 分身一一对应，靠外一环。
    if (skill.persona) {
      const pid = `p:${skill.persona.handle}`;
      add({
        id: pid,
        label: skill.persona.displayName,
        type: "persona",
        weight: skill.persona.corpus.real ? 0.85 : 0.5,
        accent: skill.accent
      });
      edges.push({
        source: `s:${skill.id}`,
        target: pid,
        label: skill.persona.corpus.real ? `蒸馏 ${skill.persona.corpus.sampleSize} 条` : "预置人格",
        weight: 0.8
      });
    }

    for (const kw of skill.keywords.slice(0, 2)) {
      const kid = `k:${kw}`;
      add({ id: kid, label: kw, type: "keyword", weight: 0.4, accent: skill.accent });
      edges.push({ source: `s:${skill.id}`, target: kid, label: "关注", weight: 0.4 });
    }

    // 真人候选来自真实来源作者
    for (const src of skill.sources.slice(0, 2)) {
      const hid = `h:${src.author}`;
      add({ id: hid, label: src.author, type: "human", weight: Math.min(1, 0.4 + src.voteUp / 500), accent: skill.accent });
      edges.push({ source: hid, target: `s:${skill.id}`, label: `赞同 ${src.voteUp}`, weight: 0.6 });
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
    edges.push({
      source: `s:${ans.skillId}`,
      target: aid,
      label: isReply ? "回应" : "作答",
      weight: isReply ? 0.55 : 0.7
    });
    if (ans.humanAuthor) {
      const hid = `h:${ans.humanAuthor}`;
      add({ id: hid, label: ans.humanAuthor, type: "human", weight: 0.9, accent: "green" });
      edges.push({ source: hid, target: aid, label: "真人补充", weight: 0.95 });
    }
  }

  for (const gap of mirror.gaps) {
    if (gap.filledBy) {
      const hid = `h:${gap.filledBy}`;
      add({ id: hid, label: gap.filledBy, type: "human", weight: 0.9, accent: "green" });
      edges.push({ source: hid, target: `q:${mirror.id}`, label: "补上缺口", weight: 0.9 });
    }
  }

  return { nodes, edges };
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
