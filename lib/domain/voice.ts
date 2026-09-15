/**
 * 语言指纹 → 可执行约束（纯函数，零模型、零额度、可复现）。
 *
 * 这一层是「不再像 GPT 直答」这个问题的核心解法落点。
 *
 * 问题诊断（2026-09-15，基于 public/square-library.json 里 66 篇真实生成结果的量化审计）：
 *   1. 全站统一写了「字数严格控制在 180–320 个汉字」，而人格自己的 wordRange 是
 *      180–780 —— 约束互相打架，模型只好取中间值，于是每个人的篇幅都一样长。
 *   2. 段落节奏完全随机：半佛仙人的段落长度序列实测是 [46,157,69,167,51]、
 *      [112,28,193,119,21]，而他的人格写的是「段落极短，一到两句就换行」。
 *   3. 全部 10 位答主的段落数落在 3.8–9.0、平均段长 86–130 字 —— 即
 *      「4-5 段等长段落 + 破折号密集」这一套 GPT 默认结构，与人格无关。
 *   4. 16 位答主的 usesLists 全为 false，但生成结果里仍出现「但有几条别搞错：」。
 *   5. 66 篇里 5 篇命中 AI 腔黑名单（「没有标准答案」「因人而异」），
 *      而黑名单当时只在提示词里，没有任何后处理兜底。
 *
 * 结论：形容词（tone / summary）谁都能认领，所以每个人写出来是一个腔调；
 * 必须换成**可执行、可核对、能验伪**的约束 —— 段落数能数、首句句式能对上、
 * 标点能统计、禁区能扫描。本文件就是把 voice 字段翻译成这三类东西：
 *   - 写前：给模型的执行清单（不是形容词堆砌）
 *   - 写后：确定性校验（段落数 / 首句 / 标点密度 / 黑名单 / 收尾套话）
 */

import type { Persona, PersonaVoice } from "./types";

/* ------------------------------ 写前：执行清单 ------------------------------ */

/**
 * 从 punctuation 的自然语言描述里解析出**段落数区间**。
 *
 * 为什么值得做正则解析：`punctuation` 是人格作者用中文写的描述，里面已经
 * 含了「整篇 6–10 段」「段落 4–6 句，整篇 4–6 段」这类**可数**的硬信息。
 * 当前它只是被整段丢进提示词，模型读完不一定落实；抽成数字后可以：
 *   ① 在提示词里以「必须 6–10 段」的形式单独强调；
 *   ② 在生成后真的数一遍段落，不符就重新生成一次。
 * 这是把「形容词」变成「可验收指标」最关键的一步。
 *
 * 抽不到时的兜底见 `deriveParagraphRange` —— 实测 16 位答主里有 4 位的
 * punctuation 只写了「段落 3–5 句」而没写整篇段数，但它们并非没有倾向：
 * 篇幅区间 ÷（每段句数 × 该人格的典型句长）就能推出一段数。
 * 宁可给一个推出来的区间，也不要让这 4 位的段落数约束**退化回空**——
 * 约束一旦为空，它们就又回到「4-5 段等长段落」的默认结构里。
 */
export function parseParagraphRange(punctuation: string | undefined): [number, number] | null {
  if (!punctuation) return null;
  // 优先级：「整篇 N–M 段」>「N–M 段」。「段落 4–6 句」里的「段」不算，因为后面跟的是「句」。
  const whole = punctuation.match(/整篇\s*(\d+)\s*[–—~-]\s*(\d+)\s*段/);
  const plain = punctuation.match(/(\d+)\s*[–—~-]\s*(\d+)\s*段(?!落)/);
  const single = punctuation.match(/整篇\s*(\d+)\s*段/);
  if (whole) return [Number(whole[1]), Number(whole[2])];
  if (plain) return [Number(plain[1]), Number(plain[2])];
  if (single) return [Number(single[1]), Number(single[1])];
  return null;
}

/**
 * 段落数兜底推导。
 *
 * 公式：总字数 ÷（每段句数 × 典型句长）→ 段数区间。
 * 典型句长按 writer 的句长类型取经验值（中文字数）：
 *   short 12、medium 20、long 30、mixed 22。
 *
 * 为什么用经验常数而不是真实语料统计：这 4 位答主的语料尚未抓取
 * （corpus.real 全为 false），没有统计数据可用。用经验值至少能给出一个
 * **有区分度**的区间（张佳玮长句长段落 → 段数少；大猛短句 → 段数多），
 * 比「不限段数」强得多。
 *
 * ⚠️ 关键是区间**必须收窄**：初版按 minPara−1 ~ maxPara+1 直接给，
 * 蒋校长（420–780 字、每段 2–5 句、长句）算出来是 2–19 段 ——
 * 这种宽区间等于没有约束，模型仍然会选中间值（≈10 段），
 * 恰好又落回被拉平的老路。所以这里做三件事收紧：
 *   ① 用**中位估计**（字数中值 ÷ 每段句数中值 ÷ 句长）定中心；
 *   ② 中心上下各留 1 段，得到 3 段宽的窗口；
 *   ③ 若自述的每段句数区间本身很宽（≥4 句），窗口各放 1 段。
 * 目标是让区间宽度落在 3–5 段之间 —— 既容得下正常波动，又真的有指向性。
 */
export function deriveParagraphRange(voice: PersonaVoice): [number, number] {
  const [lo, hi] = voice.wordRange;
  const [sLo, sHi] = parseSentencesPerParagraph(voice);
  const charsPerSentence =
    voice.sentenceLength === "short"
      ? 12
      : voice.sentenceLength === "long"
        ? 30
        : voice.sentenceLength === "mixed"
          ? 22
          : 20;

  // 中位估计：用字数中值与每段句数中值，得到最可能的段数。
  const midChars = (lo + hi) / 2;
  const midSentences = (sLo + sHi) / 2;
  const center = midChars / (midSentences * charsPerSentence);

  // 句数区间越宽，段数的合理波动越大。
  const slack = sHi - sLo >= 4 ? 2 : 1;
  const minPara = Math.max(2, Math.round(center) - slack);
  const maxPara = Math.max(minPara + 2, Math.round(center) + slack);

  return [minPara, maxPara];
}

/** 解析段落数；解析不到就用推导值。调用方无需再处理 null。 */
export function resolveParagraphRange(voice: PersonaVoice): [number, number] {
  return parseParagraphRange(voice.punctuation) ?? deriveParagraphRange(voice);
}

/** 从 punctuation 里解析「段落 N–M 句」。没有就按句长类型给一个默认区间。 */
export function parseSentencesPerParagraph(
  voice: PersonaVoice,
): [number, number] {
  const m = voice.punctuation?.match(/段落\s*(\d+)\s*[–—~-]\s*(\d+)\s*句/);
  if (m) return [Number(m[1]), Number(m[2])];
  if (voice.sentenceLength === "short") return [1, 3];
  if (voice.sentenceLength === "long") return [3, 6];
  return [2, 5];
}

/**
 * 标点特征：从 punctuation 描述里数出「哪些标点是这个人的招牌」。
 *
 * 用途是生成后的确定性校验 —— 例如 splitter 的「每段至少一个自我吐槽括号」、
 * 马前卒的「问号多（每段一两个）」。这些是**能统计出来**的特征，
 * 比「语气冷静」有信息量得多，也是「遮住名字能不能认出人」最有效的判据。
 */
export interface PunctuationTraits {
  /** 招牌标点符号，生成后至少要出现若干次 */
  signature: string[];
  /** 每段最低出现次数（针对 signature[0]） */
  perParagraph: number;
  /** 明确少用的标点 */
  rare: string[];
}

export function parsePunctuationTraits(voice: PersonaVoice): PunctuationTraits {
  const p = voice.punctuation ?? "";
  const signature: string[] = [];
  const rare: string[] = [];

  // 「括号是招牌」「大量使用括号」「括号偶尔用来…」——量级不同，分开处理。
  if (/(括号是招牌|大量使用?括号|括号.{0,6}每段至少)/.test(p)) signature.push("（）");
  else if (/括号/.test(p) && !/很少用括号|几乎不用括号|不用括号/.test(p)) signature.push("（）");

  if (/破折号/.test(p) && !/几乎不用破折号|很少用破折号|破折号少/.test(p)) signature.push("——");
  if (/(问号多|反问句是主要推进手段|反问)/.test(p)) signature.push("？");
  if (/(省略号|……)/.test(p)) signature.push("……");
  if (/(冒号)/.test(p) && !/几乎不用冒号/.test(p)) signature.push("：");

  if (/几乎不用感叹号|很少用感叹号|不用感叹号/.test(p)) rare.push("！");
  if (/几乎不用破折号/.test(p)) rare.push("——");
  if (/很少用括号|几乎不用括号/.test(p)) rare.push("（）");
  if (/问号也很少|几乎不用问号/.test(p)) rare.push("？");

  // 每段一个 vs 偶尔一个，量级要分开 —— 否则会把「偶尔」也写成硬指标，
  // 反而逼模型堆标点，变成另一种 AI 腔（标点堆砌）。
  const perParagraph = /(每段至少一个|每段一两个|大量使用?括号)/.test(p) ? 1 : 0;
  return { signature, perParagraph, rare };
}

/**
 * 把人格翻译成一份**执行清单**，直接替换掉原来那堆形容词。
 *
 * 每一行都是「照做即可」或「做不到就算失败」的二值判断，
 * 刻意不给模型留「我大致理解了」的空间。
 */
export function voiceDirectives(persona: Persona): string[] {
  const v = persona.voice;
  const [lo, hi] = v.wordRange;
  const para = resolveParagraphRange(v);
  const [sLo, sHi] = parseSentencesPerParagraph(v);
  const traits = parsePunctuationTraits(v);

  const out: string[] = [];

  // 1. 篇幅：只由人格决定，不再有全站统一值。
  out.push(`篇幅 ${lo}–${hi} 字（这是你的区间，不是通用长度；少于 ${lo} 或多于 ${hi} 都算没写完）。`);

  // 2. 段落数：这是阻断「4-5 段等长段落」GPT 结构最有效的一条。
  out.push(
    `全篇 ${para[0]}–${para[1]} 段，段落之间用空行分开。**段数必须落在这个区间内。**`,
  );

  // 3. 每段句数：把「段落极短」这种描述变成可数指标。
  out.push(`每段 ${sLo}–${sHi} 句。不要写成一段四句以上的整齐段落。`);

  // 4. 标点：招牌标点写进清单，稀用标点明确禁用。
  if (traits.signature.length > 0) {
    const sig = traits.signature
      .map((s) => {
        if (s === "（）") return "括号（）";
        if (s === "——") return "破折号（——）";
        if (s === "？") return "问号";
        if (s === "……") return "省略号（……）";
        return "冒号";
      })
      .join("、");
    out.push(
      `标点招牌：${sig}。${traits.perParagraph > 0 ? "几乎每一段都要出现。" : "自然地出现几次。"}`,
    );
  } else {
    // 抽不出招牌标点的答主（如半佛仙人：句号密、几乎不用破折号）
    // 也不是没有特征 —— 特征就是「标点干净」。明确写出来，避免模型
    // 因为「没提到标点」而随手加一堆破折号，反而破坏人格。
    out.push("标点：以句号为主，标点干净利落，不要为了显得有文采而堆破折号或括号。");
  }
  if (traits.rare.length > 0) {
    const label = traits.rare
      .map((s) => (s === "！" ? "感叹号" : s === "——" ? "破折号" : s === "（）" ? "括号" : "问号"))
      .join("、");
    out.push(`几乎不用的标点：${label}。整篇出现超过 1 次就不像你了。`);
  }

  // 5. 开头句式：最容易暴露 AI 的位置，必须给出目标而不是禁区。
  if (v.opening) {
    out.push(`第一句：${v.opening}`);
  }

  // 6. 分点与否：usesLists 是硬约束。
  out.push(
    v.usesLists
      ? "可以用短分点或小序号，但每点不超过两句。"
      : "**绝不使用任何分点**：不写「第一、第二」、不写「首先/其次/最后」、不写「1. 2. 3.」、不写「几个方面」。你只会连着往下说。",
  );

  // 7. 情绪：把 0–1 的数值翻译成行为描述。
  out.push(`情绪强度 ${v.emotion.toFixed(2)}：${emotionDirective(v.emotion)}`);

  return out;
}

function emotionDirective(emotion: number): string {
  if (emotion >= 0.7) return "可以阴阳、可以骂、可以下狠判断，不用替对方留面子。";
  if (emotion >= 0.5) return "态度明确，允许带点情绪和玩笑，但不刻薄。";
  if (emotion >= 0.3) return "克制但不冷淡，允许对事情有明确不喜欢的地方。";
  return "非常克制，不下重判断，多用「也许」「大概」留余地。";
}

/* ------------------------------ 写后：确定性校验 ------------------------------ */

export interface VoiceCheck {
  /** 段落数 */
  paragraphs: number;
  /** 总字数（不含空白） */
  chars: number;
  /** 首句 */
  firstSentence: string;
  /** 命中的 AI 腔套话 */
  cliches: string[];
  /** 是否出现分点标记 */
  hasListMarkers: boolean;
  /** 违背「篇幅」区间 */
  lengthOutOfRange: boolean;
  /** 违背「段落数」区间 */
  paragraphsOutOfRange: boolean;
  /** 结构问题的人类可读描述；空数组 = 通过 */
  issues: string[];
}

/**
 * AI 腔黑名单。
 *
 * 与提示词里的版本分开维护：提示词版本是**预防**，这里是**兜底**。
 * 实测 66 篇里有 5 篇仍然带出「没有标准答案」「因人而异」——
 * 说明光靠提示词拦不住，必须在生成后扫一遍。
 * 这里只扫描、**不删改正文**（删改会破坏句子结构，反而更假），
 * 而是把命中结果交给上层决定「重写一次」。
 */
const AI_CLICHE = [
  "首先",
  "其次",
  "综上所述",
  "总的来说",
  "总而言之",
  "值得注意的是",
  "不难看出",
  "由此可见",
  "因人而异",
  "没有标准答案",
  "这是一个复杂的问题",
  "希望以上回答对你有帮助",
  "作为一个人工智能",
  "我们应该辩证",
  "在当今社会",
  "随着时代的发展",
  "综合来看",
  "归根结底",
  "需要注意的是",
  "从多个角度",
  "建议您",
  "让我们一起",
  "以下是我的看法",
  "希望可以帮到你",
  "需要从多个角度来分析",
];

/** 分点标记：全部答主的 usesLists 都是 false，出现即为违规。 */
const LIST_MARKER = /(^\s*(?:[-*+•]|\d+[.、)]|[一二三四五六七八九十][、.])\s*)/m;

/** 段落切分：空行优先；没有空行时按单换行兜底（模型偶尔只用一个换行分段）。 */
export function splitParagraphs(text: string): string[] {
  const byBlank = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (byBlank.length > 1) return byBlank;
  return text
    .split(/\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 取首句：到第一个句末标点为止；没有标点时取前 40 字。 */
export function firstSentenceOf(text: string): string {
  const t = text.trim();
  const m = t.match(/^[^。！？\n]{1,60}[。！？]/);
  return (m ? m[0] : t.slice(0, 40)).trim();
}

/**
 * 对生成结果做一次确定性的文风体检。
 *
 * 这里**不做任何修改**，只返回事实与问题清单。原因：
 * 自动删改正文会让句子变得不连贯，读起来更像机器 —— 那正是我们想避免的。
 * 正确做法是发现问题后**重写一次**，重写仍不合格就如实保留并记录，
 * 不做「假装合格」的掩盖。
 */
export function checkVoice(text: string, persona: Persona): VoiceCheck {
  const v = persona.voice;
  const body = text.trim();
  const paragraphs = splitParagraphs(body);
  const chars = body.replace(/\s/g, "").length;
  const issues: string[] = [];

  const [lo, hi] = v.wordRange;
  const lengthOutOfRange = chars < lo * 0.85 || chars > hi;

  // 段落数用 resolve（解析不到时自动推导），这样 16 位答主全部有约束 ——
  // 只要有一个人没有段数约束，他就退回到默认的 GPT 段落结构里。
  const para = resolveParagraphRange(v);
  const paragraphsOutOfRange =
    paragraphs.length < Math.max(1, para[0] - 1) || paragraphs.length > para[1] + 1;

  const cliches = AI_CLICHE.filter((c) => body.includes(c));
  const hasListMarkers = LIST_MARKER.test(body);

  if (lengthOutOfRange) issues.push(`篇幅 ${chars} 字，超出人格区间 ${lo}–${hi}`);
  if (paragraphsOutOfRange) {
    issues.push(`段落数 ${paragraphs.length}，超出人格区间 ${para[0]}–${para[1]}`);
  }
  if (cliches.length > 0) issues.push(`命中 AI 腔套话：${cliches.slice(0, 3).join("、")}`);
  if (hasListMarkers && !v.usesLists) issues.push("出现分点标记，但这位答主从不分点");

  return {
    paragraphs: paragraphs.length,
    chars,
    firstSentence: firstSentenceOf(body),
    cliches,
    hasListMarkers,
    lengthOutOfRange,
    paragraphsOutOfRange,
    issues,
  };
}

/** 这次生成是否值得重写一次：只有结构性问题才重写，措辞偏好不重写（会烧额度）。 */
export function needsRewrite(check: VoiceCheck): boolean {
  return (
    check.cliches.length > 0 ||
    check.hasListMarkers ||
    check.paragraphsOutOfRange ||
    check.lengthOutOfRange
  );
}

/**
 * 无相关证据时的诚实降级文案。
 *
 * 为什么需要它：实测「贱贱（力学答主）」回答「30 岁从大厂转行做独立开发」时，
 * 检索到的是 7 条力学专业劝退帖 —— 与问题相关性几乎为零。此时模型没有可依
 * 的事实，只能落回 GPT 的通用结构硬写一篇，这正是「像 GPT 直答」的直接来源。
 *
 * AGENTS.md §1.2 要求「接口失败时展示真实错误与降级，禁止用假数据填充」。
 * 所以检索不到对口证据时，正确做法是**承认这件事**，而不是硬凑一篇通顺文章。
 */
export function unrelatedEvidenceNotice(name: string, scanned: number): string {
  return (
    `检索到 ${scanned} 条公开内容，但都不是「${name}」针对这个问题的本人回答 —— ` +
    "没有对口证据，这一段就不硬写了。等一位真人来补。"
  );
}
