/**
 * 回答完整性守卫。
 *
 * 问题：直答模型偶尔会「掉出人格」—— 不再扮演那位答主，而是变回一个 AI 助手。
 * 这类输出会被当成「该答主的回答」原样渲染到页面上。线上实测两例
 * （`public/square-library.json`，2026-09-15）：
 *
 *   1. 张佳玮 ×「读博六年没毕业，还要不要坚持？」
 *      整段回答是知乎直答的产品自我介绍：
 *      「我是知乎直答 —— 知乎官方推出的AI搜索产品……通过结合知乎站内优质内容、
 *      全网搜索信息，我能在各种领域提供专业可信赖的答案……」
 *
 *   2. 马前卒 ×「在县城做公务员，一辈子就到头了吗？」
 *      正文写到一半从句子中间裂开（「……要么资源型，要么农业型」），
 *      后面接了两遍「非常抱歉，我目前无法针对您的问题提供更多信息，
 *      如果您有其他的问题，我将非常乐意尽力帮助您。」
 *
 * 为什么这是最不能放过的一类缺陷：产品承诺的是「每位答主按自己的领域、立场、
 * 说话方式作答」，而正文是 AI 助手在自我介绍 —— 评委一眼就看穿整条叙事，
 * 而且它同时违反 AGENTS.md 铁律 2（不编造）与铁律 3（保留来源）。
 * 这跟「回答写得不够好」不是一回事：前者是质量，后者是造假。
 *
 * 为什么放在 lib/domain：判定是纯文本计算，无 IO、不读 process.env（AGENTS.md §2）。
 * 检出后的处置由调用方决定 —— `lib/server/mirror.ts` 走既有的「证据直引」降级路径，
 * 不在这里另造话术。
 */

/**
 * 高精度标记：这些句式只可能出自 AI 助手，不可能出自答主本人。
 *
 * 刻意不去匹配任何「提到 AI」的正常句子 —— 答主完全可以写「AI 这东西」，
 * 那跟「我是一个 AI 助手」是两回事。
 *
 * 全部带 `g` 标志：同一个数组既用于 `search` 计数（`search` 忽略 `g`、不动
 * `lastIndex`），也用于 `replace` 删除。
 */
const MARKERS: RegExp[] = [
  // —— 知乎直答的产品自我介绍（线上实测那一整段）——
  /我(?:就)?是\s*知乎直答/g,
  /知乎直答\s*[—–\-]{1,2}\s*知乎官方推出的/g,
  /知乎官方推出的\s*AI\s*搜索产品/g,
  /通过结合知乎站内优质内容/g,
  /专业可信赖的答案/g,
  /知乎直答都能为您提供/g,
  /助力思维拓展与创意实现/g,
  // —— 自报家门为通用 AI 助手 / 语言模型 ——
  /(?:作为|我是)\s*(?:一个)?\s*(?:AI|人工智能)(?:助手|语言模型)/g,
  // —— 客服式拒答与兜底承诺。真人会说「这事我不懂」，但不会说「无法针对您的问题」——
  /非常抱歉[^。！？\n]{0,40}(?:无法|不能)/g,
  /(?:无法|不能)针对您(?:的)?问题/g,
  /(?:如果|若)您(?:还)?有(?:其他|其它|别的)(?:的)?问题/g,
  /如果您有具体问题/g,
  /我(?:将|会)(?:非常乐意|乐意)?(?:尽力|努力)?(?:为您)?(?:解答|帮助)/g,
  /很高兴为您(?:解答|服务|提供帮助)/g,
];

/**
 * 一段回答至少要有这么多字，才算「模型真的答了」。
 *
 * 定这个数是因为清理之后可能只剩半句话 —— 那种结果必须判成「没生成出来」，
 * 交给调用方走降级，而不是把残句当成回答渲染出去。
 * 取 60：名册里最短的人格字数下限是 80（`voice.wordRange[0]`），留一点余量。
 */
export const MIN_ANSWER_CHARS = 60;

/**
 * 一段里命中多少个**不同**标记。
 *
 * 用 `String.search` 而不是 `RegExp.test`：这些正则带 `g` 标志，
 * `test` 会推进 `lastIndex`，同一个正则连用两次会得到不同答案。
 */
function markerHits(paragraph: string): number {
  return MARKERS.filter((re) => paragraph.search(re) >= 0).length;
}

/**
 * 删除用的规则：把探测标记延伸到**句末**。
 *
 * 为什么探测要短、删除要长：探测只回答「这段像不像 AI」，短才精确；
 * 而删除必须删干净 —— 只删「如果您有其他的问题」会留下「，可以再问我。」
 * 这种更尴尬的残句。标记本身已经是高精度的，所以「标记 + 同句剩余部分」
 * 整体都属于同一句 AI 腔，一起删不会伤到答主的话。
 */
const REMOVALS: RegExp[] = MARKERS.map(
  (re) => new RegExp(re.source + "[^。！？\\n]*[。！？]?", "g"),
);

export interface IntegrityResult {
  /** 清理后的正文 */
  text: string;
  /** 被删掉的片段（供测试断言与日志，不面向用户） */
  removed: string[];
  /** true = 清理后已经不成其为回答，调用方应当降级 */
  degenerate: boolean;
}

/** 是否命中「模型掉出人格」的标记。 */
export function hasAssistantBoilerplate(text: string): boolean {
  return markerHits(text) > 0;
}

/**
 * 清理掉 AI 助手腔，并如实报告是否已经不成其为回答。
 *
 * 分两级处理，理由是误删的代价不对称 —— 漏删一句套话只是少一处优化，
 * 误删答主写的一句真话却是静默抹掉内容（用户看不出来，因为页面不会报错）：
 *
 *   · 一段里命中 **≥2 个不同标记** → 这一段通篇都是客服话术 / 产品自我介绍，整段丢弃。
 *     线上那两条脏数据都落在这里：张佳玮整条是一段产品介绍，马前卒是末段被套话灌满。
 *   · 一段里只命中 **1 个** → 退化往往发生在句子中间（套话接在真话后面），
 *     只删命中的那一句，同段其余内容保留。
 */
export function stripAssistantBoilerplate(text: string): IntegrityResult {
  const removed: string[] = [];
  const kept: string[] = [];

  for (const paragraph of text.split(/\n{2,}/)) {
    const hits = markerHits(paragraph);

    if (hits >= 2) {
      removed.push(paragraph);
      continue;
    }

    let out = paragraph;
    if (hits === 1) {
      for (const re of REMOVALS) {
        out = out.replace(re, (m) => {
          removed.push(m);
          return "";
        });
      }
      // 抠掉一句之后会留下悬空标点（「……，。下一句」），顺手清掉。
      out = out.replace(/^[，、；：\s]+/, "").replace(/[，、；：\s]+$/, "");
    }

    if (out.trim().length > 0) kept.push(out);
  }

  const out = kept
    .join("\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[。！？，、；：]{2,}/g, (m) => m[0])
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: out,
    removed,
    // 只有「确实删过东西、且删完已经不成其为回答」才算退化 ——
    // 本来就写得短的回答不该被这个判据误伤。
    degenerate: removed.length > 0 && out.length < MIN_ANSWER_CHARS,
  };
}
