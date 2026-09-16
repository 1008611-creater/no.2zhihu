import type { Metadata } from "next";

import PersonaDirectory from "@/components/personas/PersonaDirectory";
import { PERSONAS } from "@/lib/domain/personas";

/**
 * 分身发现（独立 tab）。
 *
 * 只回答一个问题：这座虚拟知乎里住着谁。答主名册、四要素拆解、公共人物
 * 都在这里；「某一场问答的结果」不在这里 —— 那是 /mirror 工作台的职责。
 *
 * 这一页是**服务端组件**（渲染的 `PersonaDirectory` 才是 `"use client"`），
 * 所以可以直接导出 `metadata`，不需要像 `[handle]` 那样借 layout。
 * 数字从 `PERSONAS` 现算，不写死 —— 「16 位」这种会漂移的字面量写进
 * 描述里，改了名册就会变成一句假话。
 */
const distilled = PERSONAS.filter((p) => p.corpus?.real).length;

export const metadata: Metadata = {
  title: "分身发现 · 影子知乎",
  description:
    `这里住着 ${PERSONAS.length} 位知乎答主的分身，其中 ${distilled} 位由本人的公开回答蒸馏而来。` +
    `领域、立场与说话方式各不相同 —— 谁像谁不像，可以逐条核对。`,
  alternates: { canonical: "/personas" },
  openGraph: {
    title: "分身发现 · 影子知乎",
    description: `${PERSONAS.length} 位知乎答主的分身名册，领域、立场与说话方式各不相同。`,
    url: "/personas",
  },
};

export default function PersonasPage() {
  return <PersonaDirectory />;
}
