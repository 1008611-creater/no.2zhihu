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

/**
 * AI 痕迹的严重度分级。
 *
 * 沿用上游 humanizer（`docs/skill-engineering.md` §3 路由表 #16）的规则：
 *   S1 —— 一次命中即可判定，属于「人不会这么写」的构造；
 *   S2 —— 同段落内多个共现才处理，单次出现可能只是巧合，避免误杀正常写作。
 *
 * 为什么必须分级：中文里「可能」「其实」「首先」都是正常词。若一律按命中即判，
 * 结果是把真人写作也判成 AI —— 那比漏检更糟，因为它会逼模型写得更僵硬。
 * 所以 S1 只放**构造级**痕迹（句式对、伪深刻格言、借来的权威），
 * 词表类一律进 S2，且要求共现。
 */
export type TraceSeverity = "S1" | "S2";

/** 一条命中的 AI 痕迹。`samples` 保留原文片段，便于人工复核与 PR 自测贴证据。 */
export interface TraceHit {
  /** 判据编号，对应速查表里的 humanizer § 号 */
  id: string;
  /** 人类可读说明 */
  what: string;
  severity: TraceSeverity;
  samples: string[];
}

export interface VoiceCheck {
  /** 段落数 */
  paragraphs: number;
  /** 总字数（不含空白） */
  chars: number;
  /** 首句 */
  firstSentence: string;
  /** 命中的 AI 腔套话（词汇级，旧版判据） */
  cliches: string[];
  /** 是否出现分点标记 */
  hasListMarkers: boolean;
  /** 违背「篇幅」区间 */
  lengthOutOfRange: boolean;
  /** 违背「段落数」区间 */
  paragraphsOutOfRange: boolean;
  /** 结构问题的人类可读描述；空数组 = 通过 */
  issues: string[];
  /** 命中的全部 AI 痕迹（词汇 + 结构两层） */
  traces: TraceHit[];
  /** 其中「一次命中即判定」的部分 */
  s1: TraceHit[];
  /** 其中「需要共现才处理」的部分 */
  s2: TraceHit[];
  /** 段落长度的变异系数；越小越像机器写的整齐段落 */
  paragraphCv: number;
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

  /**
   * AI 痕迹扫描（词汇 + 结构两层）。
   *
   * 与 `AI_CLICHE` 的关系：黑名单是**词汇级**的兜底，这里是**构造级**的补充 ——
   * 「不是…而是…」「这才是关键。」「体现了」这些都不是黑名单词，但一眼就是 AI。
   * 两层都在，是因为它们抓的是不同的东西，谁也替代不了谁。
   */
  const traces = detectAiTraces(body);
  const s1 = traces.filter((t) => t.severity === "S1");
  const s2 = traces.filter((t) => t.severity === "S2");

  // 段落长度变异系数：真人写作段落长短差异大，机器写的往往等长。
  const paragraphCv = coefficientOfVariation(paragraphs.map((p) => p.replace(/\s/g, "").length));

  if (lengthOutOfRange) issues.push(`篇幅 ${chars} 字，超出人格区间 ${lo}–${hi}`);
  if (paragraphsOutOfRange) {
    issues.push(`段落数 ${paragraphs.length}，超出人格区间 ${para[0]}–${para[1]}`);
  }
  if (cliches.length > 0) issues.push(`命中 AI 腔套话：${cliches.slice(0, 3).join("、")}`);
  if (hasListMarkers && !v.usesLists) issues.push("出现分点标记，但这位答主从不分点");

  // S1：一次命中即判定，逐条列出（附命中原文，便于人工核对是不是误判）。
  for (const t of s1) {
    issues.push(`AI 痕迹（${t.id}）：${t.what}${t.samples[0] ? ` —— 「${t.samples[0]}」` : ""}`);
  }
  // S2：单个出现可能只是巧合，要求**同段落共现 ≥2 条**才判定，避免误杀正常写作。
  if (s2.length >= 2) {
    for (const t of s2) issues.push(`AI 痕迹（${t.id}）：${t.what}`);
  }
  // 段落长度高度均匀（CV 过小）本身就是结构痕迹 —— 与上面 S2 合并计数。
  if (paragraphs.length >= 4 && paragraphCv < PARAGRAPH_CV_FLOOR && !paragraphsOutOfRange) {
    issues.push(
      `段落长度过于均匀（变异系数 ${paragraphCv.toFixed(2)} < ${PARAGRAPH_CV_FLOOR}）：真人写作长短是错落的`,
    );
  }

  return {
    paragraphs: paragraphs.length,
    chars,
    firstSentence: firstSentenceOf(body),
    cliches,
    hasListMarkers,
    lengthOutOfRange,
    paragraphsOutOfRange,
    issues,
    traces,
    s1,
    s2,
    paragraphCv,
  };
}

/**
 * 这次生成是否值得重写一次。
 *
 * 判据只有两类：**结构性问题**（段落/篇幅/分点）与 **S1 级 AI 痕迹**。
 * 措辞偏好、S2 单词命中都不重写 —— 直答只有 100/天，为「可能」「其实」这类
 * 正常词各烧一次额度，会把额度从真正需要的答主身上挪走。
 *
 * ⚠️ 扩判据后触发率会上升，因此调用方（`lib/server/mirror.ts`）必须有上限：
 * 每位答主最多重写一次，重写后仍不合格就如实保留，不无限重试。
 */
export function needsRewrite(check: VoiceCheck): boolean {
  return (
    check.cliches.length > 0 ||
    check.hasListMarkers ||
    check.paragraphsOutOfRange ||
    check.lengthOutOfRange ||
    check.s1.length > 0 ||
    check.s2.length >= 2 ||
    (check.paragraphs >= 4 && check.paragraphCv < PARAGRAPH_CV_FLOOR)
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

/* ------------------------- AI 痕迹判据：词汇 + 结构两层 ------------------------- */

/**
 * 这一节是「AI 痕迹」判据的**构造级**部分，与上面的 `AI_CLICHE`（词汇级）互补。
 *
 * 来源与编译依据：`docs/skill-engineering.md` §4.8 登记的 humanizer owner
 * （上游 blader/humanizer，判据源自 Wikipedia *Signs of AI writing*）。
 * 上游是**英文**判据，这里做的是中文等价映射，不是照搬：
 *   - 英文的 em dash 滥用 → 中文的「——」密度；
 *   - 英文的 "It's not X, it's Y" → 中文的「不是…而是…」句式对；
 *   - 英文的 -ly 副词堆叠 → 中文的「可能/或许/一定程度上」限定词堆叠；
 *   - 英文的 title case / 弯引号 / 连字符对 → 中文不适用，**不硬套**（速查表里的 N/A）。
 *
 * ⚠️ 使用边界（§4.8 已写明）：humanizer 是**改写器**，不是生成器，也不做事实核查。
 * 这里只取它的**判据**，编译进本文件做确定性检测；**不用它改写任何线上回答** ——
 * 那会同时踩 AGENTS.md §1.2（不编造）与 §1.3（保留来源）。
 */

/** 段落长度变异系数下限：低于它视为「等长段落」这一结构痕迹。 */
const PARAGRAPH_CV_FLOOR = 0.2;

/** 句式对（§1）—— 一次命中即判定。这是最典型的「AI 转折腔」。 */
const CONTRAST_PAIRS: Array<{ re: RegExp; what: string }> = [
  { re: /不是[^。！？\n]{1,30}?而是/, what: "「不是…而是…」转折句式" },
  { re: /不只是[^。！？\n]{1,30}?更是/, what: "「不只是…更是…」递进句式" },
  { re: /不仅[^。！？\n]{1,20}?更是/, what: "「不仅…更是…」递进句式" },
  { re: /与其说[^。！？\n]{1,30}?不如说/, what: "「与其说…不如说…」对举句式" },
  { re: /真正的问题(?:不|并不)是/, what: "「真正的问题不是…」自我设问" },
];

/**
 * 段末独立短句收尾（§2）。
 *
 * 刻意**不认所有短句** —— 真人收尾也常常很短（「这事没完。」「我不信。」）。
 * 只认「判断/祈使模板」这一类：它们的作用不是表达，而是给段落盖个章。
 * 宁可漏检几个，也不能把真人的短促节奏当成 AI 痕迹删掉。
 */
const TRAILING_JUDGMENT =
  /(?:这(?:才|正)是|记住|请记住|值得注意|关键是|关键在|重要的是|说白了|一句话|说到底)[^。！？\n]{0,10}[。！？]$/;

/** 伪深刻格言（§3）。原黑名单里只有「归根结底」，这里补齐同族。 */
const PSEUDO_PROFOUND = [
  "本质上",
  "说到底",
  "核心在于",
  "归根结底",
  "底层逻辑",
  "从本质上看",
  "某种意义上说",
];

/** 铺垫式开场（§4）—— 只在**句首**判定，句中出现的「先说结论」不算。 */
const OPENING_FILLERS = [
  "先说结论",
  "话不多说",
  "让我们来看看",
  "先说一个反直觉的事实",
  "不得不说",
  "不吹不黑",
];

/** 与不存在的对手辩论（§5）。 */
const STRAW_MAN = [
  "有人可能会说",
  "有人会说",
  "你可能会觉得",
  "你可能觉得",
  "我并不是说",
  "需要澄清的是",
];

/** 借来的权威（§17）—— 词表命中后还要过 `SOURCE_MARKER`，带真实出处就放行。 */
const BORROWED_AUTHORITY = [
  "研究表明",
  "专家认为",
  "业内普遍认为",
  "有数据显示",
  "数据显示",
  "据统计",
  "调查显示",
  "被誉为",
];

/** 出处标记：书名号、引号、链接、年份、可核对的数字。出现即认为作者给了来源。 */
const SOURCE_MARKER =
  /(《[^》]{2,40}》|「[^」]{2,40}」|https?:\/\/|知乎|[12]\d{3}\s*年|\d+(?:\.\d+)?\s*(?:万|亿|%|元|人|条|次|年))/;

/** 营销语言（§16）。 */
const MARKETING = ["令人惊艳", "不容错过", "独树一帜", "匠心", "颠覆性", "天花板级"];

/** 夸大意义（§13）。 */
const GRANDIOSE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /标志着/, label: "标志着" },
  { re: /里程碑/, label: "里程碑" },
  { re: /开创性/, label: "开创性" },
  { re: /具有深远意义/, label: "具有深远意义" },
  { re: /奠定了[^。！？\n]{0,10}基础/, label: "为…奠定了基础" },
  { re: /在[^。！？\n]{0,14}的大背景下/, label: "在…的大背景下" },
];

/** 浅层附加（§15）—— 评价性动词。AI 最爱用它给事实「升华」。 */
const EVALUATIVE = ["体现了", "彰显了", "折射出", "映射出", "印证了", "凸显了", "诠释了", "的缩影"];

/** Chatbot 残留（§22）。 */
const CHATBOT_RESIDUE = [
  "希望对你有所帮助",
  "希望可以帮到你",
  "希望这些对你有帮助",
  "以上是我的回答",
  "如果你还有其他问题",
  "还有任何疑问",
];

/** 无主语句式（§11）。原黑名单缺「可以看到」「众所周知」。 */
const IMPERSONAL = ["需要注意的是", "可以看到", "不难发现", "不难看出", "由此可见", "众所周知"];

/** 知识边界声明（§23）。 */
const KNOWLEDGE_DISCLAIMER = ["据我了解", "就我所知", "由于资料有限", "公开信息显示"];

/** 限定词堆叠（§9）—— 单个出现是正常口语，**同句 ≥2 个**才算痕迹。 */
const HEDGE_WORDS = ["可能", "或许", "一定程度上", "某种意义上", "可以说", "大概", "似乎", "恐怕"];

/**
 * AI 高频抽象词（§12）。
 *
 * 这些词本身没错，问题在于**密度**：一篇里凑齐 3 个以上，读起来就像述职报告。
 * 所以判据是「不同词 ≥2 个」而不是「出现即违规」。
 */
const ABSTRACT_BUZZ = [
  "赋能",
  "闭环",
  "抓手",
  "颗粒度",
  "对齐",
  "沉淀",
  "复盘",
  "范式",
  "痛点",
  "链路",
  "心智",
  "破圈",
  "护城河",
  "增长飞轮",
  "至关重要",
  "不可或缺",
  "日益",
  "愈发",
  "深耕",
];

/** 模糊关联（§14）。 */
const VAGUE_LINK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /息息相关/, label: "息息相关" },
  { re: /在[^。！？\n]{0,10}方面/, label: "在…方面" },
  { re: /与[^。！？\n]{0,10}(?:相关|有关)/, label: "与…相关" },
];

/** 回避「是/有」（§18）。 */
const AVOID_COPULA = ["堪称", "不失为", "可谓", "扮演着", "起到了", "构成了", "无异于"];

/** 装饰性 emoji / 箭头（§20）—— 知乎答主正文里不会出现。 */
const DECORATIVE = /[\u2190-\u21FF\u2600-\u27BF\uFE0F]|\p{Extended_Pictographic}/u;

/** 加粗装饰 / 标签式列表（§19）：每条都是「**标题：** 内容」。 */
const BOLD_LABEL = /\*\*[^*\n]{1,20}\*\*\s*[：:]/g;

/** 句切分：保留句末标点，便于判断「段末短句」。 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 收集所有命中的原文片段（去重、截断），用于人工复核。 */
function matchSamples(text: string, re: RegExp, limit = 3): string[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const s = m[0].replace(/\s+/g, " ").trim();
    if (s && !out.includes(s)) out.push(s.length > 40 ? s.slice(0, 40) + "…" : s);
    if (out.length >= limit) break;
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return out;
}

/** 词表命中：返回命中的词本身。 */
function literalSamples(text: string, list: string[], limit = 3): string[] {
  return list.filter((w) => text.includes(w)).slice(0, limit);
}

/** 连续 ≥3 个 ≤6 字的短句 = 碎片排比（「不解释。不铺垫。不妥协。」）。 */
function fragmentTriplets(text: string): string[] {
  const out: string[] = [];
  for (const p of splitParagraphs(text)) {
    let run: string[] = [];
    for (const s of splitSentences(p)) {
      const core = s.replace(/[。！？!?]/g, "").trim();
      if (core.length > 0 && core.length <= 6) {
        run.push(s);
      } else {
        if (run.length >= 3) out.push(run.join(""));
        run = [];
      }
    }
    if (run.length >= 3) out.push(run.join(""));
  }
  return out;
}

/** 顿号并列 ≥3 且同类（首字相同）→ 强制三段式（「更高效、更精准、更可靠」）。 */
function forcedTriples(text: string): string[] {
  const out: string[] = [];
  const g = /[\u4e00-\u9fa5]{2,6}(?:、[\u4e00-\u9fa5]{2,6}){2,}/g;
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const items = m[0].split("、");
    if (items.length >= 3 && items.every((i) => i[0] === items[0][0])) out.push(m[0]);
  }
  // 序数词序列同样是「模板感」的来源。
  if (/首先[^。！？\n]{0,20}[，,][^。！？\n]{0,40}其次/.test(text)) out.push("首先…其次…");
  return out;
}

/** 连续 ≥3 句以同样的两个字起头（同一主语反复开场）。 */
function repeatedOpenings(text: string): string[] {
  const out: string[] = [];
  for (const p of splitParagraphs(text)) {
    const ss = splitSentences(p);
    let run = 1;
    for (let i = 1; i < ss.length; i++) {
      if (ss[i - 1].slice(0, 2) === ss[i].slice(0, 2)) {
        run++;
        if (run >= 3 && out.length < 3) out.push(ss[i].slice(0, 14));
      } else {
        run = 1;
      }
    }
  }
  return out;
}

/** 变异系数：标准差 / 均值。用来判断段落长度是不是「整齐得像机器排的」。 */
export function coefficientOfVariation(values: number[]): number {
  const xs = values.filter((v) => v > 0);
  if (xs.length < 2) return 1;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return 1;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
}

/**
 * 扫描一段文本里的 AI 痕迹。
 *
 * 纯函数、零额度、可复现 —— 这是本层唯一的硬要求：判据必须能被人工逐条复核，
 * 所以每条命中都带上**原文片段**，PR 自测里直接贴出来即可对照。
 */
export function detectAiTraces(text: string): TraceHit[] {
  const body = text.trim();
  if (!body) return [];
  const hits: TraceHit[] = [];
  const push = (id: string, what: string, severity: TraceSeverity, samples: string[]) => {
    const s = samples.filter(Boolean).slice(0, 3);
    if (s.length > 0) hits.push({ id, what, severity, samples: s });
  };

  // §1 句式对
  for (const { re, what } of CONTRAST_PAIRS) {
    push("§1", what, "S1", matchSamples(body, re));
  }

  // §2 段末独立短句收尾 + 碎片排比
  const trailing: string[] = [];
  for (const p of splitParagraphs(body)) {
    const last = splitSentences(p).pop();
    if (last && TRAILING_JUDGMENT.test(last)) trailing.push(last);
  }
  push("§2", "段末补一句独立短句收尾", "S1", trailing);
  push("§2", "碎片排比（连续三个以上的极短句）", "S1", fragmentTriplets(body));

  // §3 伪深刻格言
  push("§3", "伪深刻格言（本质/说到底/核心在于）", "S1", literalSamples(body, PSEUDO_PROFOUND));

  // §4 铺垫式开场 —— 只认句首
  const openings = splitSentences(body).filter((s) => OPENING_FILLERS.some((f) => s.startsWith(f)));
  push("§4", "铺垫式开场（先说结论 / 话不多说）", "S1", openings);

  // §5 与不存在的对手辩论
  push("§5", "与不存在的对手辩论（有人可能会说）", "S1", literalSamples(body, STRAW_MAN));

  // §6 强制三段式 / 序数词模板
  push("§6", "强制三段式或「首先…其次…」模板", "S2", forcedTriples(body));

  // §7 连续多句同一主语开场
  push("§7", "连续多句以同样的字起头", "S2", repeatedOpenings(body));

  // §8 破折号滥用：每千字 > 2 次
  const chars = body.replace(/\s/g, "").length;
  const dashes = (body.match(/——/g) ?? []).length;
  if (dashes > 2 && (dashes / Math.max(1, chars / 1000)) > 2) {
    push("§8", `破折号密度过高（${dashes} 次 / ${chars} 字）`, "S2", [`—— × ${dashes}`]);
  }

  // §9 限定词堆叠：同一句里 ≥2 个
  const stacked = splitSentences(body).filter(
    (s) => HEDGE_WORDS.filter((h) => s.includes(h)).length >= 2,
  );
  push("§9", "限定词堆叠（可能 / 或许 / 一定程度上）", "S2", stacked);

  // §11 无主语句式
  push("§11", "无主语句式（需要注意的是 / 众所周知）", "S2", literalSamples(body, IMPERSONAL));

  // §12 AI 高频抽象词：要求不同词 ≥2 个，避免误杀单次正常用词
  const buzz = literalSamples(body, ABSTRACT_BUZZ, 6);
  if (buzz.length >= 2) push("§12", "AI 高频抽象词聚集", "S2", buzz);

  // §13 夸大意义
  const grandiose = GRANDIOSE_PATTERNS.flatMap((p) => matchSamples(body, p.re, 1));
  push("§13", "夸大意义（标志着 / 里程碑 / 具有深远意义）", "S1", grandiose);

  // §14 模糊关联
  const vague = VAGUE_LINK_PATTERNS.flatMap((p) => matchSamples(body, p.re, 1));
  push("§14", "模糊关联（与…相关 / 在…方面）", "S2", vague);

  // §15 浅层附加 / 评价性动词
  push("§15", "评价性动词（体现了 / 彰显了 / 折射出）", "S1", literalSamples(body, EVALUATIVE));

  // §16 营销语言
  push("§16", "营销语言（令人惊艳 / 不容错过）", "S1", literalSamples(body, MARKETING));

  // §17 借来的权威 —— 但**带真实出处就放行**
  const borrowed = splitSentences(body).filter(
    (s) => BORROWED_AUTHORITY.some((w) => s.includes(w)) && !SOURCE_MARKER.test(s),
  );
  push("§17", "借来的权威但没有给出处（研究表明 / 业内普遍认为）", "S1", borrowed);

  // §18 回避「是 / 有」
  push("§18", "回避「是 / 有」（堪称 / 不失为 / 起到了…的作用）", "S2", literalSamples(body, AVOID_COPULA));

  // §19 加粗装饰 / 标签式列表
  const bold = body.match(BOLD_LABEL) ?? [];
  if (bold.length >= 2) push("§19", "标签式加粗列表（**标题：** 内容）", "S2", bold.slice(0, 3));

  // §20 装饰性 emoji / 箭头
  const deco = body.match(new RegExp(DECORATIVE.source, "gu")) ?? [];
  push("§20", "正文里出现装饰性 emoji 或箭头", "S1", deco.slice(0, 3));

  // §22 Chatbot 残留
  push("§22", "Chatbot 残留（希望对你有所帮助）", "S1", literalSamples(body, CHATBOT_RESIDUE));

  // §23 知识边界声明
  push("§23", "知识边界声明（据我了解 / 公开信息显示）", "S2", literalSamples(body, KNOWLEDGE_DISCLAIMER));

  return hits;
}

/**
 * 「不许这样写」的正面出口。
 *
 * 为什么必须有：只给禁令时，模型知道自己不能写「不是…而是…」，但它**不知道写什么**，
 * 于是退回另一个通用构造 —— 实测就是从一种 AI 腔换到另一种 AI 腔。
 * 每条禁令都必须配一句可执行的替换路径，否则这一层只是把文字变得更僵硬。
 */
export const AI_TRACE_REWRITES: Array<{ avoid: string; instead: string }> = [
  {
    avoid: "不是 A，而是 B / 与其说 A 不如说 B",
    instead: "直接把 B 说出来，A 当靶子放前一句：「很多人以为是 A。我看不是，是 B。」",
  },
  {
    avoid: "段末补一句「这才是关键。」「记住这一点。」",
    instead: "把判断写进正文那一句里，或者干脆停在上一句 —— 真人写完就走。",
  },
  {
    avoid: "本质上 / 说到底 / 核心在于",
    instead: "换成具体动作或数字：「算下来差 3 万」比「本质上是成本问题」硬得多。",
  },
  {
    avoid: "先说结论 / 话不多说",
    instead: "第一句就是那个结论本身，不要报幕。",
  },
  {
    avoid: "有人可能会说…（造一个不存在的对手）",
    instead: "不同意就直接点名或直接给反例；没人说过的话不要替他说。",
  },
  {
    avoid: "研究表明 / 业内普遍认为（没有出处）",
    instead: "要么给出具体出处（书名、链接、年份、机构），要么改成「我见过」「我碰到过」这类第一人称经验。",
  },
  {
    avoid: "体现了 / 彰显了 / 折射出",
    instead: "写清楚它具体做了什么、谁受益、代价是什么 —— 评价性动词换成事实。",
  },
  {
    avoid: "更高效、更精准、更可靠（三连并列）",
    instead: "只留你真正想说的那一个，另外两个删掉。三个并列等于一个都没说。",
  },
  {
    avoid: "标志着 / 里程碑 / 具有深远意义",
    instead: "给一个可核对的后果：谁的时间省了、哪笔钱变了、哪个数字动了。",
  },
  {
    avoid: "希望对你有所帮助（收尾寒暄）",
    instead: "说完就结束。最后一句可以是一个没展开的判断。",
  },
];

/** 把上面这张表渲染成提示词片段（生成侧负向约束，零额度消耗）。 */
export function antiAiGuidance(): string[] {
  return AI_TRACE_REWRITES.map((x) => `× 不要写：${x.avoid}\n→ 改成：${x.instead}`);
}

/* ------------------------- 写后：删改（纯文本，不调模型） ------------------------- */

/**
 * 结尾套话黑名单。
 *
 * ⚠️ 判据：只有**整句就是一个纯套话**时才删（2026-09-15 审计修正）。
 *
 * 早期版本写成 `/(?:总之|...)[^\n]{0,80}[。！？]?\s*$/`，实测会误伤：
 * 「总之我劝你别碰这个，去年我朋友就亏了六十万。」是一句**有实质信息**的
 * 结论，只因为以「总之」开头就被整句删掉了。而这些答主恰恰爱用「总之」
 * 起句说硬话 —— 删掉它等于删掉回答里最有价值的一句。
 *
 * 所以每个模式都收紧成「起手词 + 最多一句空泛收束」，长度上限只有 14 字，
 * 并在 `stripClosing` 里再加一道「删完不能伤到信息量」的兜底校验。
 */
export const CLOSING_PATTERNS: RegExp[] = [
  /^(?:总之|综上(?:所述)?|总而言之|总的来说)[，,：:]?[^\n]{0,14}[。！？]?\s*$/,
  /^(?:希望|祝愿)(?:以上|这些|这)[^\n]{0,40}[。！？]?\s*$/,
  /^(?:希望(?:能|可以)?(?:对|给)你?[^\n]{0,40}(?:帮助|参考|启发))[。！？]?\s*$/,
  /^(?:以上(?:就是|便是|是)我[^\n]{0,40})[。！？]?\s*$/,
  /^(?:仅供参考)[^\n]{0,20}[。！？]?\s*$/,
  /^(?:如果|若)?(?:觉得|认为)?(?:有用|有帮助|感兴趣)?[，,]?\s*(?:欢迎|可以|请)\s*(?:点赞|关注|收藏|转发|评论)[^\n]{0,20}[。！？]?\s*$/,
];

/**
 * 删掉末段里的总结句。
 *
 * 只在**最后一段**上做：真人也会在中间用「总之」引出下一层意思，
 * 全局替换会毁掉正文。末尾是套话高发位，且删掉它不影响信息完整性。
 *
 * 兜底：剥离不能把末段削得太狠。上面每个正则都要求「整句就是套话」，
 * 但正则总有漏网的可能；真人的实质结论恰恰爱用「总之 / 综上」起句说硬话，
 * 一旦误删，丢的是整篇最有价值的一句，而且用户看不出来（不是报错，是内容没了）。
 * 所以这里做一次量的校验：末段被削掉超过一半且剩下的不足 30 字，
 * 就认为这次剥离「伤到肉了」，回退保留原文。
 */
export function stripClosing(text: string): string {
  const blocks = text.split(/\n{2,}/);
  if (blocks.length === 0) return text;
  const last = blocks[blocks.length - 1];

  let out = last;
  // 反复剥离：模型有时会连写两句收尾。
  for (let i = 0; i < 2; i++) {
    const before = out;
    for (const re of CLOSING_PATTERNS) out = out.replace(re, "").trim();
    if (out === before) break;
  }

  // 剥完如果这段空了，就整段丢掉（说明最后一段本来就是一句收尾）。
  if (out.trim().length === 0) {
    const rest = blocks.slice(0, -1).join("\n\n").trim();
    return rest.length > 0 ? rest : text;
  }

  if (last.trim().length > 0 && out.length < last.trim().length * 0.5 && out.length < 30) {
    return text;
  }

  blocks[blocks.length - 1] = out;
  return blocks.join("\n\n").trim();
}

/**
 * 句首套话黑名单。
 *
 * 每一条都要求「出现在句首（行首或句末标点之后）」且「后面紧跟逗号或直接接内容」，
 * 这样才不会误伤正文里的正常用词。
 */
export const LEADING_CLICHE_PATTERNS: RegExp[] = [
  /(^|[。！？\n])\s*(?:总的来说|综上所述|总而言之|综合来看|归根结底|需要注意的是|值得注意的是|由此可见|不难看出|需要从多个角度来分析)[，,：:]\s*/g,
  /(^|[。！？\n])\s*(?:首先|其次|最后|再者|另外)[，,]\s*/g,
  // 「一方面……另一方面」是成对的，删前半会破句 → 整对清掉
  /(^|[。！？\n])\s*一方面[，,][^。！？\n]{0,80}?另一方面[，,]\s*/g,
  // 从句首独立成句的免责声明（「这取决于个人情况。」）—— 这一句整个删掉
  /(^|[。！？\n])\s*(?:这取决于个人情况|因人而异|没有标准答案|这是一个复杂的问题)[。！？]\s*/g,
  /(^|[。！？\n])\s*(?:在当今社会|随着(?:时代|社会)的发展)[，,]\s*/g,
  /(^|[。！？\n])\s*(?:作为一个人工智能|我们应该辩证地看|让我们一起)[，,]?\s*/g,
];

/**
 * 删掉句首的 AI 套话连接词。
 *
 * 关键纪律：**只删连接词本身，不删整句**。删掉「总的来说，」之后
 * 「这个生意赚的是信息差。」仍然是一句完整的话，语义无损；
 * 而删掉整句会留下结构性空洞，读起来更假 —— 那是另一处 AI 腔。
 *
 * ⚠️ 替换用 `"$1"` 而不是空串：每条规则的第一个捕获组是「句首锚点」
 * （行首，或前一句的句末标点）。若替换成空串，那个句号会被一起吃掉 ——
 * 实测 "首先，算启动成本。其次，算时间成本。" 会变成
 * "算启动成本算时间成本。"，两句被粘成一句。
 */
export function stripAiCliches(text: string): string {
  let out = text;
  for (const re of LEADING_CLICHE_PATTERNS) out = out.replace(re, "$1");
  return out;
}
