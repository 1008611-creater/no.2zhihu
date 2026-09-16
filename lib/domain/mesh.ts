import type { Accent, MeshEdge, MeshGraph, MeshNode, MirrorQuestion } from "./types";

/**
 * Human Mesh —— 现在只剩「我的 Mesh」这一张网。
 *
 * 2026-09-17：**本场关系图（`buildMesh`）已删除**。
 * owner 的原话是「这场生成出来的关系，功能一直没太做好，可以先删」。
 *
 * 它讲的是**一场**问答内部的关系，把问题 / 关键词 / Skill 分身 / 答主人格 /
 * 回答 / 真人塞进同一张图，节点上限 25 —— 实测读不出结构，且它是 `/mirror`
 * 上唯一一个「生成出来的关系」入口。删掉它连带三件事必须一起改（否则文案会撒谎）：
 *   1. `/mirror` 的「这场生成出来的关系」区块（含 `id="mesh"` 锚点）；
 *   2. `/fill` 提交成功页那句「Human Mesh 长出新的边」以及指向它的深链 ——
 *      删图之后，没有任何一张图会因为补一段真人而变化（`/me` 那张只看关键词共现）；
 *   3. 看山流程第 8 步的「更新 Mesh · 关系图长出新的边」。
 *
 * 保留 `buildCorpusMesh`：它是 `/me`「我的 Mesh」的数据源，讲的是**我创作过什么**
 * （我提过的问题 × 它们所属的领域），与本场无关，也不受本次删除影响。
 */


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
