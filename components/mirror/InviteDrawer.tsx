"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import PersonaCard from "@/components/mirror/PersonaCard";
import type { PersonaCandidate } from "@/lib/domain/router";
import type { AnswerDraft, Skill } from "@/lib/domain/types";
import { SHIFT } from "@/lib/motion/tokens";

export interface InviteOutcome {
  skill: Skill;
  answer: AnswerDraft;
  mode: "preset" | "distilled";
  confidence?: "high" | "medium" | "low";
  matched?: number;
  scanned?: number;
  note?: string;
}

/**
 * 「+ 邀请一个分身回答」抽屉。
 *
 * 两条路径，产品上必须在 UI 上分清楚：
 *   1. 名册里已有的答主 —— 点一下就进来，零蒸馏成本。
 *   2. 临时指定一位没预置的答主 —— 现场检索 + 蒸馏。命中 0 条时会如实
 *      告诉用户「没有取到本人内容，人格为低置信度」，绝不假装成功。
 *
 * 邀请只生成新来的这一位，不重跑已有分身 —— 这是额度纪律里最关键的一条。
 */
export function InviteDrawer({
  open,
  question,
  candidates,
  presentHandles,
  onClose,
  onInvited,
}: {
  open: boolean;
  question: string;
  candidates: PersonaCandidate[];
  /** 已经在场上的 handle，不再重复展示。 */
  presentHandles: string[];
  onClose: () => void;
  onInvited: (outcome: InviteOutcome) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);

  const available = candidates.filter((c) => !presentHandles.includes(c.handle));

  async function invitePreset(handle: string) {
    setBusy(handle);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/mirror/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, handle, evidencePerSkill: 3 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "邀请失败，请稍后重试。");
        return;
      }
      onInvited({ skill: data.skill, answer: data.answer, mode: "preset" });
    } catch {
      setError("网络连接失败，请检查后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function inviteCustom() {
    if (busy) return;
    const name = customName.trim();
    if (name.length < 2) {
      setError("请填一个答主昵称，至少 2 个字。");
      return;
    }
    setBusy("__custom__");
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/mirror/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, name, evidencePerSkill: 3 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "邀请失败，请稍后重试。");
        return;
      }
      setNote(data.note ?? null);
      onInvited({
        skill: data.skill,
        answer: data.answer,
        mode: "distilled",
        confidence: data.confidence,
        matched: data.matched,
        scanned: data.scanned,
        note: data.note,
      });
      setCustomName("");
    } catch {
      setError("网络连接失败，请检查后重试。");
    } finally {
      setBusy(null);
    }
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-lenis-prevent
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4,5,12,0.72)",
            backdropFilter: "blur(6px)",
            zIndex: 60,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "48px 20px",
            overflowY: "auto",
          }}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: SHIFT.lg }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: SHIFT.md }}
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: "min(1080px, 100%)", padding: 26 }}
          >
            <div className="row-between" style={{ marginBottom: 6 }}>
              <p className="eyebrow" style={{ margin: 0 }}>邀请一个分身回答</p>
              <button className="btn btn-sm btn-ghost" onClick={onClose}>关闭</button>
            </div>
            <h2 id="invite-title" style={{ marginBottom: 8 }}>再加一个人进来看看</h2>
            <p className="lede" style={{ marginBottom: 20 }}>
              指定一位答主，他会按自己的领域、立场和说话方式回答这个问题 —— 哪怕他从没答过它。
              只生成新来的这一位，已有的回答原样保留。
            </p>

            {error && <div className="notice notice-warn" style={{ marginBottom: 16 }}>{error}</div>}
            {note && <div className="notice notice-info" style={{ marginBottom: 16 }}>{note}</div>}

            <div className="lbl">名册里的答主</div>
            {available.length === 0 ? (
              <div className="notice" style={{ marginBottom: 20 }}>名册里的答主都已经在场上了。</div>
            ) : (
              <div className="grid grid-3" style={{ marginBottom: 22 }}>
                {available.map((c, i) => (
                  <div key={c.handle} style={{ position: "relative" }}>
                    <PersonaCard
                      candidate={c}
                      index={i}
                      selected={busy === c.handle}
                      onToggle={() => { if (!busy) invitePreset(c.handle); }}
                    />
                  </div>
                ))}
              </div>
            )}

            <hr className="divider" />

            <div className="lbl">或者，临时指定一位没预置的答主</div>
            <p className="dim" style={{ fontSize: 12.5, marginBottom: 10 }}>
              会现场检索这位答主的公开回答并抽取人格。如果没取到本人内容，我们会如实告诉你，
              不会假装成功。
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="field"
                style={{ flex: "1 1 260px" }}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") inviteCustom(); }}
                placeholder="答主昵称，例如：马伯庸"
                aria-label="临时指定的答主昵称"
              />
              <button
                className="btn btn-primary"
                onClick={inviteCustom}
                disabled={busy !== null || customName.trim().length < 2}
              >
                {busy === "__custom__" ? "正在检索并蒸馏…" : "邀请并生成 →"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body
  );
}

export default InviteDrawer;
