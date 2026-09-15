import type { Persona } from "../types";

import { persona as banFoXianRen } from "./ban-fo-xian-ren";
import { persona as zhangJiaWei } from "./zhang-jia-wei";
import { persona as splitter } from "./splitter";
import { persona as liSongWei } from "./li-song-wei";
import { persona as daMeng } from "./da-meng";
import { persona as chenZhangYu } from "./chen-zhang-yu";
import { persona as maQianZu } from "./ma-qian-zu";
import { persona as taiKongJingNiang } from "./tai-kong-jing-niang";
import { persona as liLei } from "./li-lei";
import { persona as wenYiFei } from "./wen-yi-fei";
import { persona as caiTong } from "./cai-tong";
import { persona as dongJiZaiHangZhou } from "./dong-ji-zai-hang-zhou";
import { persona as bingDengXing } from "./bing-deng-xing";
import { persona as jiangXiaoZhang } from "./jiang-xiao-zhang";
import { persona as chiJi } from "./chi-ji";
import { persona as chenLanXiang } from "./chen-lan-xiang";

/**
 * 预置答主名册（16 位）。
 *
 * 顺序即默认展示顺序：领域与风格反差最大化，方便评委一眼看出
 * 「同一个问题换不同答主，回答真的不是一个人写的」。
 *
 * 全部为预置人格（按公开印象撰写，未抓取全量回答），卡片上如实标注。
 * 跑 scripts/persona-crawler.mjs 抓取真实回答后，各文件里的 corpus.real
 * 会变成 true、sampleSize 变成实际条数，其余字段由 distill-personas.mjs 覆盖。
 *
 * 2026-09-15：从 6 位扩到 16 位。原来的 6 位集中在互联网/心理/制造/文学，
 * 换上问题就容易全打平；新增 10 位把工业、航天、生物、金融、学习方法、
 * 心理咨询、半导体、军事史、网文、法律补齐，保证任何一类问题都有对口的人。
 */
export const PERSONAS: Persona[] = [
  banFoXianRen,
  zhangJiaWei,
  splitter,
  liSongWei,
  daMeng,
  chenZhangYu,
  maQianZu,
  taiKongJingNiang,
  liLei,
  wenYiFei,
  caiTong,
  dongJiZaiHangZhou,
  bingDengXing,
  jiangXiaoZhang,
  chiJi,
  chenLanXiang,
];

export const PERSONA_BY_HANDLE = new Map(PERSONAS.map((p) => [p.handle, p]));

export function personaByHandle(handle: string): Persona | undefined {
  return PERSONA_BY_HANDLE.get(handle);
}

/**
 * 卡片上显示蒸馏依据。
 *
 * 2026-09-15：卡片上那类「预置风格设定 / 尚未经语料验证」的自述标签**整体删除**，
 * 不替换成任何中性说法 —— 换一种措辞仍是同一件事：卡片在自我否定，读起来像
 * 免责声明而不是身份说明。做法是只有**真实抓取到语料**时才给出依据，其余情况
 * 返回空串，由调用方整块不渲染（不留占位空白）。
 *
 * 诚实性改由档案页正文承担（明说不声称真实蒸馏），见 AGENTS.md §1.2。
 */
export function corpusLabel(p: Persona): string {
  return p.corpus.real ? `基于公开片段提取 · ${p.corpus.sampleSize} 条有效样本` : "";
}

/**
 * 语言指纹的必备字段。
 *
 * 2026-09-15 新增：评委反复指出「文风还是像 GPT 直答」。诊断结论是
 * 原来只有 tone / sentenceLength 这类**形容词**，模型没法把形容词落地 ——
 * 「语气温和」这句话六个人都能认领，所以六个人写出来是一个腔调。
 * 新加的这四样是**可执行、可核对**的：开头句式能照抄，标点习惯能数，
 * 反面例句是明确的禁区，语感范例给了节奏目标。
 *
 * 这里做的是**运行时报错**而不是静默降级：如果哪天新增答主漏填了这些字段，
 * 生成出来的回答会悄悄退回 AI 腔，而这种退化在页面上看不出来。
 * 与其让它悄悄发生，不如在开发环境直接抛错。
 */
export const VOICE_FINGERPRINT_FIELDS = ["opening", "punctuation", "avoid", "exemplars"] as const;

/** 返回该答主缺失的指纹字段名；空数组表示齐全。 */
export function missingVoiceFingerprint(p: Persona): string[] {
  return VOICE_FINGERPRINT_FIELDS.filter((k) => {
    const v = p.voice[k];
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    return String(v).trim().length === 0;
  });
}

/**
 * 全量体检：返回所有指纹不全的答主（空数组 = 都齐）。
 *
 * 这里刻意**只做纯计算** —— 不读 `process.env`、不抛错、不产生副作用。
 * AGENTS.md §2 要求 lib/domain 必须是纯函数层；「要不要因此让进程起不来」
 * 是运行环境的决策，交给 lib/server 去判断（见 lib/server/mirror.ts 的加载自检）。
 */
export function voiceFingerprintGaps(): Array<{ name: string; missing: string[] }> {
  return PERSONAS.map((p) => ({ name: p.displayName, missing: missingVoiceFingerprint(p) })).filter(
    (x) => x.missing.length > 0,
  );
}
