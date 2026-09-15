import PersonaDirectory from "@/components/personas/PersonaDirectory";

/**
 * 分身发现（独立 tab）。
 *
 * 只回答一个问题：这座虚拟知乎里住着谁。答主名册、四要素拆解、公共人物
 * 都在这里；「某一场问答的结果」不在这里 —— 那是 /mirror 工作台的职责。
 */
export default function PersonasPage() {
  return <PersonaDirectory />;
}
