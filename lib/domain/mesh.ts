import type { MeshEdge, MeshGraph, MeshNode, MirrorQuestion } from "./types";

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
