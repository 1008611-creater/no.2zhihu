"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  HANDOFF_BOUNDARY_SHORT,
  INVITE_COPIED_FEEDBACK,
  toInviteText,
  toZhihuDraft,
} from "@/lib/domain/handoff";
import { matchRouteId } from "@/lib/domain/route-id";
import { useMirror } from "@/lib/store/mirror-store";
import { DUR, EASE, SHIFT } from "@/lib/motion/tokens";

/**
 * 搬运面板。
 *
 * 事实：知乎开放平台没有写入/发布接口（54 个文档条目全部只读）。
 * 所以这里不做模拟发布，而是：
 *   1. 把真人补充后的正文拼好，一键复制；
 *   2. 生成知乎真实编辑器深链，新标签打开；
 *   3. **不记录「已发布」状态** —— 产品无从得知用户有没有真的发出去。
 *
 * ⚠️ 2026-09-16 按 owner 收敛清单 P0-3 改：
 *   · 3.1 删掉「我已在知乎发布」按钮（那是个**无法验证**的状态）
 *   · 3.2 主按钮改为「复制邀请文案」—— 邀请是**发给答主本人**的动作，与「搬运正文到知乎」是两件事；
 *         且它**不以 `status === "human"` 为前置**（要邀请的正是还没补过的那位）
 *   · 3.4 界面上的长接口解释缩短成一句（完整版留在 `HANDOFF_NOTE` 与 docs/api-audit.md）
 */
export function HandoffPanel({ inviteAnswerId }: { inviteAnswerId?: string } = {}) {
  const { mirror, markHandoffOpenedFor } = useMirror();
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
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

  /**
   * 复制「邀请一位答主补充」的文案（owner 收敛清单 3.2 / 3.3）。
   *
   * 三个刻意的选择：
   *   1. **不以 `ready` 为前置** —— 要邀请的正是**还没补过**的那位答主。
   *      清单原文：「注意它不该以 status===human 为前置条件」。
   *   2. 反馈用 `INVITE_COPIED_FEEDBACK`（清单 3.3 原文），措辞里**没有「已发送」**。
   *   3. 页面状态**保持「等待真人补充」不变** —— 复制不改变任何状态。
   *
   * 选谁：优先「还没被真人补过」的第一位（信息增量最大）；
   * 都补过了就退回第一位 —— 让按钮始终可用，不指向空。
   */
  const copyInvite = async (answerId?: string) => {
    /*
     * 3.5：「邀请补充」点的是**具体某一位**，所以要能指名邀请。
     * answerId 走 matchRouteId() —— useParams() 可能返回**百分号编码**串（本仓库既有坑），
     * 直接比较会永远不命中。
     */
    const target =
      (answerId ? matchRouteId(mirror.answers, answerId, (a) => a.id) : null) ||
      mirror.answers.find((a) => a.status !== "human") ||
      mirror.answers[0];
    if (!target) {
      setError("这一场还没有分身回答，无法生成邀请文案。");
      return;
    }
    setError(null);
    if (await copyText(toInviteText(mirror, target))) {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2600);
    } else {
      setError("浏览器拒绝了剪贴板访问，请手动选中邀请文案复制。");
    }
  };

  return (
    <motion.section
      /* 3.5：需要一个锚点，让「邀请补充」能指向**这一块**搬运区域 */
      id="handoff"
      className="card"
      initial={{ opacity: 0, y: SHIFT.md }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      <div className="accent-bar a-green" />
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ marginRight: "auto" }}>搬运回真实知乎</h2>
        <span className={`chip ${ready ? "chip-blue" : ""}`}>
          {/* 3.1：不再有「已确认搬运」—— 产品无从得知用户有没有真的发出去，就别记这个状态 */}
          {ready ? "可以搬运" : "等待真人补充"}
        </span>
      </div>

      <div className="notice notice-info" style={{ marginBottom: 14 }}>
        {/* 3.4：界面只留一句。长解释（54 个条目全只读）在 HANDOFF_NOTE 与 docs/api-audit.md */}
        {HANDOFF_BOUNDARY_SHORT}
      </div>

      <div className="grid grid-2" style={{ gap: 14 }}>
        <div>
          <div className="mono dimmer" style={{ marginBottom: 8 }}>待搬运正文（{composed.length} 字）</div>
          <textarea ref={draftRef} className="field" rows={9} readOnly value={composed} style={{ fontSize: 13 }} />
        </div>
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {/* 3.2：邀请是「发给答主本人」，与「把正文搬运到知乎」是两件事，所以给两个按钮。
              这个按钮**不设 disabled** —— 要邀请的正是还没补过的那位答主（清单原文：
              「注意它不该以 status===human 为前置条件」）。 */}
          <button className="btn btn-primary" onClick={() => copyInvite(inviteAnswerId)}>
            {inviteCopied ? INVITE_COPIED_FEEDBACK : "复制邀请文案"}
          </button>
          <button className="btn" onClick={copy}>
            {copied ? "正文已复制" : "只复制正文"}
          </button>
          {/* 搬运正路：复制正文 + 打开知乎编辑器深链。有真人补充过才有意义，故保留 disabled。 */}
          <button className="btn" onClick={open} disabled={!ready}>
            {ready ? "复制正文并打开知乎编辑器" : "有真人补充后可搬运正文"}
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
