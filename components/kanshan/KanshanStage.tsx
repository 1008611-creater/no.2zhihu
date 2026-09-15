"use client";

import { AnimatePresence, motion } from "motion/react";
import { Kanshan } from "./Kanshan";
import { FLOW_STATES, flowStateAt } from "./states";
import { DUR } from "@/lib/motion/tokens";

/**
 * 看山主持舞台：把产品流程的每一步映射成看山的一个状态。
 * 流程条本身也是提交给评委看的「AI 到底做了什么」的可视化。
 */
export interface KanshanStageProps {
  /** 当前进行到第几步（-1 表示未开始，走完为 length） */
  step: number;
  size?: number;
  running?: boolean;
}

export function KanshanStage({ step, size = 190, running = false }: KanshanStageProps) {
  const current = flowStateAt(step);
  const caption =
    step < 0 ? "看山在等你的问题" : step >= FLOW_STATES.length ? "这一轮闭环完成" : FLOW_STATES[step].caption;
  const label = step < 0 ? "Standby" : step >= FLOW_STATES.length ? "Mesh updated" : FLOW_STATES[step].label;

  return (
    <div className="card" style={{ display: "grid", gap: 16, justifyItems: "center", padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "stretch" }}>
        <span className="mono dimmer" style={{ marginRight: "auto" }}>KANSHAN · HOST</span>
        <span className={`chip ${running ? "chip-blue" : "chip-green"}`}>
          <motion.span
            animate={running ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
            transition={{ duration: DUR.slower, repeat: running ? Infinity : 0 }}
            style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", display: "inline-block" }}
          />
          {running ? "处理中" : "就绪"}
        </span>
      </div>

      <Kanshan state={current} size={size} />

      <AnimatePresence mode="wait">
        <motion.div
          key={caption}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: DUR.base }}
          style={{ textAlign: "center", minHeight: 52 }}
        >
          <div className="mono" style={{ color: "var(--blue-soft)", marginBottom: 5 }}>{label}</div>
          <div style={{ fontSize: 14, color: "var(--text-300)" }}>{caption}</div>
        </motion.div>
      </AnimatePresence>

      {/* 流程进度 */}
      <div style={{ display: "flex", gap: 5, alignSelf: "stretch" }}>
        {FLOW_STATES.map((s, i) => (
          <div
            key={s.key}
            title={s.label}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background: i <= step ? "linear-gradient(90deg, var(--blue), var(--violet))" : "var(--ink-700)",
              transition: "background 0.3s"
            }}
          />
        ))}
      </div>
      <div className="mono dimmer" style={{ fontSize: 10.5 }}>
        {Math.min(Math.max(step + 1, 0), FLOW_STATES.length)} / {FLOW_STATES.length} 步
      </div>
    </div>
  );
}

export default KanshanStage;
