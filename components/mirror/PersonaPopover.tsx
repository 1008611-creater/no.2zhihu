"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { Persona } from "@/lib/domain/types";
import { corpusLabel } from "@/lib/domain/personas";

/**
 * 答主框上的详情浮层。
 *
 * 为什么不是新页面：答主名册本身已经是「浏览态」，点一个人跳走再点回来
 * 会打断浏览节奏；浮层能让人在名册上下文里把 16 位挨个扫一遍。
 *
 * 交互约束（都按可访问性来，不做「只有鼠标能用」的浮层）：
 *   - 触发按钮是真正的 <button>，键盘 Enter/Space 可开；
 *   - Esc 关闭、点击浮层外部关闭；
 *   - 开启时焦点移到浮层，关闭后焦点还给触发按钮；
 *   - 浮层内 Tab 循环，不会跑到背后的页面元素上。
 *
 * 内容只放「已经在 Persona 里的事实」：领域、立场、语癖、不装懂的边界、
 * 以及蒸馏依据。来源链接与知乎主页链接都如实给出，不新增编造字段。
 */
export function PersonaPopover({ persona }: { persona: Persona }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // 关闭时把焦点还给触发按钮，键盘用户不会「掉」在页面某处。
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      // 浮层内 Tab 循环 —— 避免焦点跑到背后仍可见的页面元素上。
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // 打开后把焦点送进浮层，让读屏与键盘用户立刻进入上下文。
  useEffect(() => {
    if (open) panel.current?.focus();
    else trigger.current?.focus({ preventScroll: true });
  }, [open]);

  const profileUrl = `https://www.zhihu.com/people/${persona.handle}`;

  return (
    <div ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={trigger}
        type="button"
        className="persona-info-btn"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`查看 ${persona.displayName} 的分身档案`}
        onClick={(e) => {
          // 卡片整体是个 <Link>，这里必须阻止冒泡，否则点「详情」会直接跳去提问页。
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        i
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            ref={panel}
            role="dialog"
            aria-label={`${persona.displayName} 的分身档案`}
            tabIndex={-1}
            className="persona-popover"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => {
              // 浮层里的链接是外链，点击时不要触发外层卡片的跳转。
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className={"accent-bar a-" + persona.accent} />
            <div className="row-between" style={{ alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <h4 style={{ margin: 0, fontSize: 15 }}>{persona.displayName}</h4>
              <span className="mono dimmer" style={{ fontSize: 11 }}>@{persona.handle}</span>
            </div>
            <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px" }}>{persona.headline}</p>

            <Group label="知道什么" items={persona.knows} limit={4} />
            <Group label="怎么看问题" items={persona.stance} limit={3} />
            <Group label="不装懂什么" items={persona.doesNotKnow} limit={3} />

            {persona.catchphrases.length > 0 && (
              <>
                <div className="lbl">语癖</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
                  {persona.catchphrases.slice(0, 4).map((x) => (
                    <span key={x} className="chip mono">{x}</span>
                  ))}
                </div>
              </>
            )}

            <div className="mono dimmer" style={{ fontSize: 11, marginBottom: 12 }}>
              蒸馏依据：{corpusLabel(persona)}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <a
                className="link mono"
                style={{ fontSize: 11.5 }}
                href={profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
              >
                知乎主页 ↗
              </a>
              <a
                className="link mono"
                style={{ fontSize: 11.5 }}
                href={"/personas/" + persona.handle}
                onClick={(e) => e.stopPropagation()}
              >
                完整人格档案 →
              </a>
            </div>

            {persona.corpus.sources.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12 }}>可核对的来源（{persona.corpus.sources.length}）</summary>
                {persona.corpus.sources.slice(0, 5).map((s) => (
                  <a
                    key={s.url}
                    className="link"
                    style={{ display: "block", padding: "6px 0", fontSize: 12 }}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {s.author} · {s.title}
                  </a>
                ))}
              </details>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({ label, items, limit }: { label: string; items: string[]; limit: number }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="lbl">{label}</div>
      <div style={{ display: "grid", gap: 3, marginBottom: 11 }}>
        {items.slice(0, limit).map((x) => (
          <div key={x} className="dimmer" style={{ fontSize: 12.5 }}>· {x}</div>
        ))}
      </div>
    </>
  );
}

export default PersonaPopover;
