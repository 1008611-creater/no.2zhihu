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

/** 卡片上显示蒸馏依据：真实抓取 vs 预置人格，必须如实区分。 */
export function corpusLabel(p: Persona): string {
  return p.corpus.real
    ? `基于公开片段提取 · ${p.corpus.sampleSize} 条有效样本`
    : p.corpus.status === "unavailable" || p.corpus.capturedAt ? "人格提取未完成" : "预置风格设定 · 尚未经本人语料验证";
}
