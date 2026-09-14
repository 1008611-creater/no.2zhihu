import type { Persona } from "../types";

import { persona as banFoXianRen } from "./ban-fo-xian-ren";
import { persona as zhangJiaWei } from "./zhang-jia-wei";
import { persona as splitter } from "./splitter";
import { persona as liSongWei } from "./li-song-wei";
import { persona as daMeng } from "./da-meng";
import { persona as chenZhangYu } from "./chen-zhang-yu";

/**
 * 预置答主名册。
 *
 * 顺序即默认展示顺序：领域与风格反差最大化，方便评委一眼看出
 * 「同一个问题换不同答主，回答真的不是一个人写的」。
 *
 * 这 6 位是默认值。跑 scripts/persona-crawler.mjs 抓取真实回答后，
 * 各文件里的 corpus.real 会变成 true、sampleSize 变成实际条数，
 * 其余字段由 distill-personas.mjs 覆盖。
 */
export const PERSONAS: Persona[] = [
  banFoXianRen,
  zhangJiaWei,
  splitter,
  liSongWei,
  daMeng,
  chenZhangYu,
];

export const PERSONA_BY_HANDLE = new Map(PERSONAS.map((p) => [p.handle, p]));

export function personaByHandle(handle: string): Persona | undefined {
  return PERSONA_BY_HANDLE.get(handle);
}

/** 卡片上显示蒸馏依据：真实抓取 vs 预置人格，必须如实区分。 */
export function corpusLabel(p: Persona): string {
  return p.corpus.real
    ? `基于 ${p.corpus.sampleSize} 条真实回答蒸馏`
    : "预置人格 · 未抓取全量回答";
}
