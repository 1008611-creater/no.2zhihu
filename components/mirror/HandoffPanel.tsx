"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { toZhihuDraft } from "@/lib/domain/handoff";
import { useMirror } from "@/lib/store/mirror-store";

/**
 * 搬运面板。
 *
 * 事实：知乎开放平台没有写入/发布接口（54 个文档条目全部只读）。
 * 所以这里不做模拟发布，而是：
 *   1. 把真人补充后的正文拼好，一键复制；
 *   2. 生成知乎真实编辑器深链，新标签打开；
 *   3. 由用户本人在知乎点击发布，回来点「我已在知乎发布」确认状态。
 */
export function HandoffPanel() {
  const { mirror, markHandoffOpenedFor, confirmHandoffFor } = useMirror();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * 为什么需要兜底：自托管用「IP + HTTP」访问时，浏览器会禁用安全剪贴板 API
   * （它只在 HTTPS 或 localhost 下可用）。演示的最后一步正是「复制正文」，
   * 所以这里退回到「选中文本 + execCommand」这条老路径，保证闭环在任何访问方式下都能走完。
   */
  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const el = draftRef.current;
      if (!el) return false;
      try {
        el.focus();
        el.select();
        return document.execCommand("copy");
      } catch {
        return false;
      }
    }
  };

  if (!mirror) return null;

  const ready = mirror.answers.some((a) => a.status === "human");
  const confirmed = mirror.handoff.status === "confirmed";

  // 用共享的搬运稿生成器：它会强制附上来源与作者，满足「保留来源」的合规要求。
  const composed = toZhihuDraft(mirror);

  const open = async () => {
    setError(null);
    try {
      const res = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionUrl: mirror.handoff.targetUrl,
          questionTitle: mirror.title,
          body: composed
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "生成深链失败");

      if (await copyText(composed)) setCopied(true);

      if (mirror) markHandoffOpenedFor(mirror.id, data.editorUrl);
      window.open(data.editorUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "打开失败");
    }
  };

  const copy = async () => {
    if (await copyText(composed)) {
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } else {
      setError("浏览器拒绝了剪贴板访问，请手动选中正文复制。");
    }
  };

  return (
    <motion.section
      className="card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="accent-bar a-green" />
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ marginRight: "auto" }}>搬运回真实知乎</h2>
        <span className={`chip ${confirmed ? "chip-green" : ready ? "chip-blue" : ""}`}>
          {confirmed ? "已确认搬运" : ready ? "可以搬运" : "等待真人补充"}
        </span>
      </div>

      <div className="notice notice-info" style={{ marginBottom: 14 }}>
        <strong>关于「直接发布」：</strong>我们审计了知乎开放平台全部 54 个接口文档，
        目前只有读取能力（搜索、热榜、直答、用户数据、知识库），
        <strong>没有把回答写入知乎的接口</strong>。官方文档也明确写明发布相关字段与 scope 未文档化，
        不允许猜测实现。所以这里采用真实深链：正文自动复制到剪贴板并打开知乎编辑器，
        由你本人点发布 —— 不经过任何模拟。
      </div>

      <div className="grid grid-2" style={{ gap: 14 }}>
        <div>
          <div className="mono dimmer" style={{ marginBottom: 8 }}>待搬运正文（{composed.length} 字）</div>
          <textarea ref={draftRef} className="field" rows={9} readOnly value={composed} style={{ fontSize: 13 }} />
        </div>
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <button className="btn" onClick={copy}>
            {copied ? "已复制到剪贴板" : "只复制正文"}
          </button>
          <button className="btn btn-primary" onClick={open} disabled={!ready}>
            {ready ? "复制并打开知乎编辑器" : "先让真人补充内容"}
          </button>
          <button className="btn" onClick={() => confirmHandoffFor(mirror.id)} disabled={!ready || confirmed}>
            {confirmed ? "已确认" : "我已在知乎发布"}
          </button>
          {mirror.handoff.editorUrl && (
            <a className="link mono" href={mirror.handoff.editorUrl} target="_blank" rel="noreferrer noopener">
              上次打开的编辑器地址
            </a>
          )}
          {error && <div className="notice notice-warn" style={{ fontSize: 12 }}>{error}</div>}
          <p className="dimmer mono" style={{ fontSize: 11 }}>
            {mirror.handoff.note}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

export default HandoffPanel;
