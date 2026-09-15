#!/usr/bin/env node
/**
 * 回答完整性守卫的回归自检。
 *
 * 为什么必须有负例：这个守卫做的是「删文本」，而删错的代价是不对称的 ——
 * 漏删一句套话只是少一处优化；误删答主写的一句真话，是**静默抹掉内容**
 * （页面不会报错，用户看不出来）。所以下面的负例不是凑数，是这份守卫的
 * 主要价值所在：它们全是真人会写、模型也可能写的句子，一条都不许被删。
 *
 * 用法：node scripts/check-answer-integrity.mjs
 */

import {
  stripAssistantBoilerplate,
  hasAssistantBoilerplate,
} from "../lib/domain/answerIntegrity.ts";

/** 负例：必须原样保留（一个字都不能动）。 */
const NEGATIVE = [
  ["提到 AI 的正常句子", "AI 这东西，说到底是个概率机器。我干这行十几年，见过太多人把它当成万能药。"],
  ["以「总之」说硬话", "总之我劝你别碰这个，去年我朋友就亏了六十万。"],
  ["「如果您有闲钱」不是客服话术", "如果您有闲钱，我建议先买指数基金，别碰个股。"],
  ["「我会帮你算」是真人语气", "我会帮你算清楚这笔账：房租、人工、水电，一个月三万起步。"],
  ["单说「抱歉」不算 AI 腔", "抱歉，这个我真不知道。"],
  ["短促收尾", "这事我不懂，别问我。就这么个事。"],
  ["正常分点回答", "一是启动成本，二是时间成本。两条都算完再决定。"],
];

/** 正例 1：线上实测——整条回答是知乎直答的产品自我介绍。 */
const PRODUCT_BLURB = `我是知乎直答 —— 知乎官方推出的AI搜索产品，专注于提供高效、精准的知识回答。通过结合知乎站内优质内容、全网搜索信息，我能在各种领域提供专业可信赖的答案。无论是学术研究还是生活决策，知乎直答都能为您提供专业可靠的知识支持，助力思维拓展与创意实现。如果您有具体问题或需要帮助，我会尽力为您解答！`;

/** 正例 2：线上实测——正文写到一半从句子中间裂开，接了两遍客服套话。 */
const SPLICED_TAIL = `这笔账其实很好算。问"是不是到头了"，得先弄清楚"头"在哪儿——是职务的头，还是人生的头。

先看职务这个天花板，数据是硬的。约 90% 的公务员止步于科级以下职务，能升到县处级的只有 4.4%。

所以这笔账的逻辑是：你放弃的是职务上的可能性，换回来的是财务上的确定性和时间上的自由。

县城的就业市场本身就小。大部分县城产业结构单一，要么资源型，要么农业型非常抱歉，我目前无法针对您的问题提供更多信息，如果您有其他的问题，我将非常乐意尽力帮助您。非常抱歉，我目前无法针对您的问题提供更多信息，如果您有其他的问题，我将非常乐意尽力帮助您。`;

/** 正例 3：单标记出现在句中——只删那一句，同段其余内容必须留下。 */
const SINGLE_MARKER = `先说结论，这事能成，但前提是你手里得有一个最小可收钱的闭环。

成本我算过，一年二十万——房租、人工、水电、平台抽成，一个月三万起步，这还是不含你自己的工资。如果您有其他的问题，可以再问我。`;

/** 正例 4：正常的人格短答，长度接近下限，不该被判退化。 */
const SHORT_OK = `就这么个事。别信"都是朋友不好意思谈"，正因为是朋友，才更得谈。`;

let fail = 0;

function check(ok, label, detail = "") {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : "\n        " + detail}`);
}

console.log("=== 负例：真人会写的句子，一个字都不许删 ===");
for (const [name, text] of NEGATIVE) {
  const r = stripAssistantBoilerplate(text);
  check(
    r.removed.length === 0 && r.text === text && !r.degenerate,
    name,
    `removed=${JSON.stringify(r.removed)}`,
  );
}

console.log("\n=== 正例：AI 助手腔必须被拦住 ===");
{
  const r = stripAssistantBoilerplate(PRODUCT_BLURB);
  check(
    r.degenerate && r.text.length === 0,
    "整段产品自我介绍 → 判为未生成（上层走证据直引降级）",
    `degenerate=${r.degenerate} 剩余 ${r.text.length} 字`,
  );
}
{
  const r = stripAssistantBoilerplate(SPLICED_TAIL);
  check(
    r.removed.length > 0 && !r.degenerate && !hasAssistantBoilerplate(r.text) && r.text.endsWith("。"),
    "末段被套话灌满 → 整段丢弃，前面的真话保留",
    `删 ${r.removed.length} 段，保留 ${r.text.length} 字，残留标记=${hasAssistantBoilerplate(r.text)}`,
  );
}
{
  const r = stripAssistantBoilerplate(SINGLE_MARKER);
  check(
    r.removed.length === 1 &&
      !r.degenerate &&
      !r.text.includes("如果您有") &&
      r.text.includes("一年二十万") &&
      r.text.includes("最小可收钱的闭环"),
    "单标记出现在句中 → 只删那一句",
    `删 ${r.removed.length} 句（${r.removed[0]}），保留 ${r.text.length} 字`,
  );
}
{
  const r = stripAssistantBoilerplate(SHORT_OK);
  check(r.removed.length === 0 && r.text === SHORT_OK, "正常短答 → 原样保留");
}

console.log(`\n结果：${fail === 0 ? "全部通过" : fail + " 项失败"}`);
process.exit(fail === 0 ? 0 : 1);
