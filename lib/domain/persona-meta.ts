import { corpusLabel, PERSONAS, personaByHandle } from "./personas";

/**
 * 答主档案页（`/personas/<handle>`）的页面元信息。
 *
 * ## 为什么抽成纯函数，而不是直接写在 layout 里
 *
 * `app/(explore)/personas/[handle]/page.tsx` 是 `"use client"`（要用 `useParams`
 * 与 Motion），而**客户端组件不能导出 `generateMetadata`** —— 所以这一页的
 * metadata 只能由同目录的 `layout.tsx`（服务端组件）提供。
 *
 * 但把逻辑写在 layout 里有三个问题：
 *   1. `app/` 下的 import 走 `@/` 别名，而自检脚本的 TS 加载钩子
 *      （`scripts/_ts-hook.mjs`）只给**相对路径**补扩展名、不解析别名 ——
 *      于是守卫没法直接调用它，只能退化成「源码里出现过某个字符串」的假断言。
 *   2. layout 是 React 组件文件，被测模块会连带把 JSX 运行时一起拉进来。
 *   3. 这里**不 import next**：返回值是普通对象，由 layout 组装成 `Metadata`。
 *      `lib/domain/` 保持零框架依赖，口径也只有这一处。
 *
 * ## 背景（2026-09-16 实测）
 *
 * `[handle]/layout.tsx` 此前只在「不在名册里」时返回 metadata，命中名册时 `return {}`
 * —— 于是**16 位答主档案页全部只有根布局的默认标题**
 * 「影子知乎 · Agent 可调用的人类知识网络」。分享任何一位答主的档案，卡片上都是
 * 同一句话；而这个产品的评价标准恰恰是「遮住名字也该看得出不是同一个人」。
 *
 * #72 的决策要保留：**不把未知 handle 改成 404** —— 点旧链接的是活人，给一个能回到
 * 名册的提示页比甩 404 好；要解决的只是「别让搜索引擎把空页当内容收进去」。
 */
export interface PersonaPageMeta {
  title: string;
  description: string;
  /** 不在名册里：可以被收录的是「人」，不是一页提示。 */
  noindex: boolean;
  /** canonical 路径；`noindex` 时不给出 —— 那会暗示它才是「正主」。 */
  path?: string;
}

/** 名册里没有这个人时的标题（与 2026-09-16 #72 的提示页文案一致）。 */
export const UNKNOWN_PERSONA_TITLE = "名册里没有这个人 · 影子知乎";

/**
 * 一位答主的档案页元信息。
 *
 * `description` 里的**蒸馏依据**直接复用 `corpusLabel()` —— 它是卡片上那一行的
 * 同一个来源。这样「标题/描述里说的」与「页面上印的」不可能各说各话；
 * 尤其是 `jiangxiaozhang`（唯一一位没有可用公开语料的预置人格），
 * 绝不能在任何地方被描述成「由本人公开回答蒸馏而来」（铁律 2）。
 */
export function personaPageMeta(handle: string): PersonaPageMeta {
  const persona = personaByHandle(handle);
  if (!persona) {
    return {
      title: UNKNOWN_PERSONA_TITLE,
      description: `名册目前收录 ${PERSONAS.length} 位知乎答主的分身，可以回去看看他们各是谁。`,
      noindex: true,
    };
  }

  const basis = persona.corpus.real
    ? `蒸馏依据：${corpusLabel(persona)}。`
    : "公开印象档案：没有可用的本人公开语料，不声称真实蒸馏。";

  return {
    title: `${persona.displayName} · 分身档案 · 影子知乎`,
    description: `${persona.headline}。${basis}`,
    noindex: false,
    path: `/personas/${persona.handle}`,
  };
}
