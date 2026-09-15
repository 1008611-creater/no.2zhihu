"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import CrowdCluster from "@/components/square/CrowdCluster";
import { crowdSummary, type CrowdCluster as CrowdClusterData } from "@/lib/domain/crowd";
import type { SquareLayout, SquareScope, TopicNode, Viewport } from "@/lib/domain/square-layout";
import { SCOPE_LABELS, clampViewport, focusViewport, homeViewport, zoomAt } from "@/lib/domain/square-layout";

/**
 * 虚拟广场 · 可游逛的二维平面。
 *
 * ## 这一版改了什么（2026-09-15 第二轮）
 *
 * 上一版把每场讨论画成一张**话题卡**（矩形、标题 + 头像 + 预览），本质还是
 * 「一屏卡片换个摆法」。这一版改成**人群**：每场讨论是一簇站在广场上的人，
 * 问题标题浮在人群上方。改动的依据是老大给的概念图与产品说明。
 *
 * 同时做减法（说明原文：页面只保留顶部导航、左侧广场和右侧现场广播）：
 *   · 去掉左下角缩略地图 —— 它是「地图」隐喻，而这一版要的是「站在广场里」
 *   · 去掉右下角「我的位置 / 发现一场讨论 / 全景」三个按钮 —— 它们把广场
 *     变回了工具栏。回到可读视野改由**双击空白处**承担（画布类产品的通用手势，
 *     不占界面位置）
 *   · 去掉常驻的四个筛选 chip（说明与概念图都没有；筛选只保留 URL 深链入口，
 *     生效时才显示一枚可关闭的说明条，见下）
 *
 * ## 交互契约（产品说明逐条对应）
 *
 *   · 空白处按住拖动 → 只改视野；话题位置不变、人物不跟鼠标
 *   · 平移范围受限 → `clampViewport`（推导见 square-layout.ts）
 *   · 滚轮缩放、双击放大；**禁止页面上下滚动**
 *   · 点人群 → 原地展开详情；「载入工作台」才离开本页
 *   · 首次进入给一次「拖动探索广场」提示，之后不再出现
 *
 * ## 与右栏的关系：**刻意不联动**
 *
 * 说明写得很死：拖动广场时右栏不滚动、不重排、不自动高亮；滚动右栏时广场
 * 不平移、不切换高亮；页面不提供两边浏览位置的自动同步。所以这个组件
 * **不接收任何来自右栏的状态**，也不向外暴露悬停/滚动位置。
 * 两边唯一的共同点是「点进去是同一场讨论」—— 那走的是同一个 id。
 */

export interface SquareCanvasProps {
  layout: SquareLayout;
  /** 与 layout.nodes 一一对应的人群（由 SquareField 统一算，避免两处重复计算） */
  clusters: CrowdClusterData[];
  /** 当前聚焦的节点 id；null = 广场常态 */
  focusedId: string | null;
  onFocus: (node: TopicNode | null) => void;
  /** 进入某场讨论（跳工作台） */
  onOpen: (node: TopicNode) => void;
  /** 渲染详情面板内容 */
  renderDetail: (node: TopicNode) => React.ReactNode;
  /** 当前筛选（只由 URL 深链设置，界面上没有常驻入口） */
  scope: SquareScope;
  onScope: (s: SquareScope) => void;
  /** 筛选前的总数，用于如实说明「筛掉了几场」 */
  totalCount: number;
}

/** 像素：小于这个距离算「点击」，防止拖完误触聚焦。 */
const DRAG_THRESHOLD = 4;

/** 拖动提示只出现一次；换版本号可以让老用户再看一次。 */
const HINT_KEY = "sq-drag-hint-v1";

export default function SquareCanvas({
  layout,
  clusters,
  focusedId,
  onFocus,
  onOpen,
  renderDetail,
  scope,
  onScope,
  totalCount,
}: SquareCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [size, setSize] = useState({ w: 1200, h: 760 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(false);

  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: -1,
  });

  const reduced = useReducedMotion();

  /**
   * 平移约束用的包围盒。
   *
   * 为什么单独 memo 成四个数字：`layout.bounds` 每次布局重算都是新对象，
   * 直接进依赖数组会让滚轮监听每帧重新挂载 —— 拖动时会明显掉帧。
   */
  const bounds = useMemo(
    () => ({
      minX: layout.bounds.minX,
      minY: layout.bounds.minY,
      maxX: layout.bounds.maxX,
      maxY: layout.bounds.maxY,
    }),
    [layout.bounds.minX, layout.bounds.minY, layout.bounds.maxX, layout.bounds.maxY],
  );

  /** 视口尺寸 —— 拖拽、缩放、取景都要用它换算，所以集中一处监听。 */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(r.width, 320), h: Math.max(r.height, 320) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ 首次取景 ------------------------------ */

  /**
   * 落到「家视角」：对准最热的那一场 + 一个读得清标题的缩放。
   *
   * 为什么不是把所有内容装进视口：22 场讨论铺开后包围盒约 2300px 宽，
   * 广场只占屏幕 75%（1440 下约 1050px）时 fit 只能到 45% —— 人形缩成几个点、
   * 标题糊成灰线，那不是广场，是一张看不懂的地图。
   *
   * 为什么放在 size 就绪之后：mount 那一刻容器尺寸还是 0，按 0 算出来的
   * 取景会把内容全推出屏幕，看起来像一片空白。
   */
  useEffect(() => {
    if (ready) return;
    if (size.w <= 320 || size.h <= 320) return;
    if (layout.nodes.length === 0) return;
    setViewport(clampViewport(homeViewport(layout, size.w, size.h), bounds, size.w, size.h));
    setReady(true);
  }, [ready, size, layout, bounds]);

  /* ------------------------------ 聚焦 ------------------------------ */

  useEffect(() => {
    if (!ready) return;
    if (!focusedId) {
      setViewport(clampViewport(homeViewport(layout, size.w, size.h), bounds, size.w, size.h));
      return;
    }
    const node = layout.nodes.find((n) => n.id === focusedId);
    if (!node) return;
    setViewport(clampViewport(focusViewport(node, size.w, size.h), bounds, size.w, size.h));
  }, [focusedId, ready, size, layout, bounds]);

  /* ------------------------------ 拖动提示 ------------------------------ */

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(HINT_KEY) === "1";
    } catch {
      // 隐私模式 / 存储被禁 —— 那就每次都提示，总好过静默不给任何引导。
      seen = false;
    }
    if (!seen) setHint(true);
  }, []);

  /** 提示消失时记下「看过了」。开始拖动也算看过。 */
  const dismissHint = useCallback(() => {
    setHint((h) => {
      if (!h) return false;
      try {
        window.localStorage.setItem(HINT_KEY, "1");
      } catch {
        /* 存不下就算了，不因为存储失败打断交互 */
      }
      return false;
    });
  }, []);

  useEffect(() => {
    if (!hint) return;
    // 4.6s 足够读完一行字，又不至于让人等它消失才能看清广场。
    const t = window.setTimeout(dismissHint, 4600);
    return () => window.clearTimeout(t);
  }, [hint, dismissHint]);

  /* ------------------------------ 拖拽平移 ------------------------------ */

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 只有空白处能开始拖动画布；人群的命中区上不触发（否则点人变成拖布）。
      const target = e.target as HTMLElement;
      if (target.closest("[data-topic-card]") || target.closest("[data-no-pan]")) return;
      drag.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        originX: viewport.x,
        originY: viewport.y,
        pointerId: e.pointerId,
      };
      // setPointerCapture：手指/鼠标滑出元素也不会丢事件。
      // 包 try/catch 是因为它对**已经失效的 pointerId 会抛 NotFoundError**
      // （指针被系统回收、合成事件、某些浏览器在 pointerdown 之后立刻 cancel）。
      // 不包的话，一次异常就让这一次拖拽彻底失灵，而用户只看到「拖不动」。
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* 拿不到捕获也能拖 —— 只是手指滑出画布时会丢事件 */
      }
    },
    [viewport.x, viewport.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      if (!d.moved) {
        d.moved = true;
        dismissHint();
      }
      setViewport(
        clampViewport(
          { scale: viewport.scale, x: d.originX + dx, y: d.originY + dy },
          bounds,
          size.w,
          size.h,
        ),
      );
    },
    [viewport.scale, bounds, size.w, size.h, dismissHint],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.active) return;
      d.active = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId);
      } catch {
        /* 指针可能已被系统回收，忽略 */
      }
      // 拖完（有明显位移）就当作平移手势，不触发「点空白处关闭详情」。
      if (d.moved) return;
      if (focusedId) onFocus(null);
    },
    [focusedId, onFocus],
  );

  /* ------------------------------ 滚轮 ------------------------------ */

  /**
   * 滚轮：缩放广场。
   *
   * ⚠️ 两处必须保持现状，改之前先读这段：
   *   ① 监听挂在 `.sq-canvas` 上（不是 window/document），所以**右栏现场广播的
   *      滚动完全不受影响** —— 它是兄弟节点，wheel 事件不会冒泡到这里。
   *      如果哪天把监听挪到 window，右栏立刻会被缩放吃掉。
   *   ② 必须 `passive: false` 才能 preventDefault，否则页面还是会滚，
   *      而「禁止页面上下滚动」是规格里的硬要求。
   *
   * 触控板双指横滑（deltaX 大、deltaY 小）当平移，鼠标滚轮当缩放 ——
   * 混在一起会让 Mac 用户「想滑一下结果缩得飞起」。
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const isTrackpadPan =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.8 && Math.abs(e.deltaY) < 12;

      if (isTrackpadPan && !e.ctrlKey) {
        setViewport((v) =>
          clampViewport(
            { scale: v.scale, x: v.x - e.deltaX, y: v.y - e.deltaY },
            bounds,
            size.w,
            size.h,
          ),
        );
        return;
      }

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // 指数缩放：不同设备 deltaY 量级差别很大，线性缩放会「一下缩到底」。
      const factor = Math.exp(-e.deltaY * 0.0016);
      setViewport((v) => clampViewport(zoomAt(v, px, py, factor), bounds, size.w, size.h));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [bounds, size.w, size.h]);

  /* ------------------------------ 双击 ------------------------------ */

  /**
   * 双击空白：把光标处放大到 1.6 倍并保持该点不动。
   *
   * 为什么用双击而不是保留「全景」按钮：说明要求页面只保留三块，而
   * 「凑近看某个角落」是高频动作，不能没有。双击是画布类产品的通用手势，
   * 不占任何界面位置，也不会让人以为这里是个工具栏。
   */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-topic-card]")) return;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setViewport((v) => clampViewport(zoomAt(v, px, py, 1.6), bounds, size.w, size.h));
    },
    [bounds, size.w, size.h],
  );

  /* ------------------------------ 选中 ------------------------------ */

  const selectNode = useCallback((node: TopicNode) => onFocus(node), [onFocus]);

  const focused = useMemo(
    () => (focusedId ? layout.nodes.find((n) => n.id === focusedId) ?? null : null),
    [focusedId, layout.nodes],
  );

  const focusedCluster = useMemo(
    () => (focused ? clusters.find((c) => c.id === focused.id) ?? null : null),
    [focused, clusters],
  );

  const scopeLabel = SCOPE_LABELS.find((s) => s.key === scope)?.label ?? "";

  return (
    <div className="sq-root">
      <div
        ref={wrapRef}
        className="sq-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        style={{
          cursor: drag.current.active ? "grabbing" : "grab",
          touchAction: "none", // 移动端：禁止浏览器接管手势，交给我们的 pan/zoom
        }}
      >
        {/* 人形轮廓定义一次，全广场的 <use> 都引用它。
            放在 defs 里而不是每个簇各画一遍：22 簇 × 约 5 人 = 110 份重复路径，
            既撑大 DOM，也让「改一次人形」变成改 110 处。

            ⚠️ viewBox 的宽高比（12/20）必须与 CrowdCluster.tsx 的 GLYPH_ASPECT 一致，
            否则人形会被拉伸成胖子或竹竿。改这里必须同时改那里。

            第一版是 10×24（细高个），实测截图里人形读起来像一根竖条加个点，
            不像人。加宽到 12×20、并把头和肩接上之后才有「人」的轮廓。 */}
        <svg className="sq-defs" aria-hidden="true" focusable="false">
          <defs>
            {/* 实心：在场分身。圆头 + 肩弧 + 直身 —— 形状全部来自设计系统允许的圆/线/弧。 */}
            <symbol id="sq-figure" viewBox="0 0 12 20">
              <circle cx="6" cy="3.6" r="3.2" />
              <path d="M1.4 20 L1.4 12 A4.6 4.6 0 0 1 10.6 12 L10.6 20 Z" />
            </symbol>
            {/* 空心：未补的缺口 —— 「还缺的那个真人」。
                只描边不填色，一眼就能和在场的人区分开。 */}
            <symbol id="sq-figure-gap" viewBox="0 0 12 20">
              <circle cx="6" cy="3.6" r="3.2" fill="none" strokeWidth="1.7" />
              <path
                d="M1.4 20 L1.4 12 A4.6 4.6 0 0 1 10.6 12 L10.6 20 Z"
                fill="none"
                strokeWidth="1.7"
              />
            </symbol>
          </defs>
        </svg>

        <div
          className="sq-world"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            // 拖动中不要 transition —— 那会让手指拖影。聚焦的动画由详情面板的
            // 弹簧单独做，所以这里只在非拖动时给一个短过渡。
            transition:
              drag.current.active || reduced
                ? "none"
                : "transform var(--dur-slow) var(--ease-out)",
          }}
        >
          {layout.nodes.map((n, i) => {
            const c = clusters[i];
            if (!c) return null;
            return (
              <CrowdCluster
                key={n.id}
                node={n}
                cluster={c}
                focused={focusedId === n.id}
                dimmed={!!focusedId && focusedId !== n.id}
                hovered={hovered === n.id}
                onHover={setHovered}
                onSelect={() => selectNode(n)}
              />
            );
          })}
        </div>

        {/* 广场标题。概念图上是两行：大字「虚拟广场」+ 一句副题。
            刻意不做成首屏 hero —— 广场本身才是主角，标题是立在广场边上的指示牌。 */}
        <div className="sq-plaza-head" data-no-pan>
          <h1 className="sq-plaza-title">虚拟广场</h1>
          <p className="sq-plaza-sub">此刻，人们正在讨论</p>
        </div>

        {/* 筛选只在 URL 深链生效时出现。
            为什么不给常驻 chip 行：说明与概念图都没有这一行，而它会让广场看起来
            像后台的筛选列表。但深链一旦生效又必须**可见** —— 否则用户看到的是
            全部讨论，界面却以为自己被筛过，那是骗人。 */}
        {scope !== "all" && (
          <div className="sq-scope-active" data-no-pan role="status">
            <span className="dim">只显示</span>
            <span className="chip chip-blue">{scopeLabel}</span>
            <span className="dim">
              共 {totalCount} 场，其中 {layout.nodes.length} 场符合
            </span>
            <button type="button" className="sq-scope-clear" onClick={() => onScope("all")}>
              看全部
            </button>
          </div>
        )}

        {/* 首次进入的一次性提示。不是常驻板块，也没有关闭按钮 ——
            它自己会走（4.6s 或首次拖动），所以不需要用户做任何事。 */}
        <AnimatePresence>
          {hint && (
            <motion.div
              className="sq-hint"
              data-no-pan
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              按住空白处拖动，逛逛这座广场
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------------- 原地展开的详情 ---------------- */}
      <AnimatePresence>
        {focused && (
          <motion.aside
            key={focused.id}
            className="sq-detail"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            transition={
              reduced ? { duration: 0.12 } : { type: "spring", stiffness: 260, damping: 30 }
            }
          >
            <div className="sq-detail-head">
              <div style={{ minWidth: 0 }}>
                <div className="sq-detail-theme">
                  <span className={"sq-cluster-dot a-" + focused.theme.accent} />
                  {focused.theme.label}
                  <span className="dim"> · {focused.statusLabel}</span>
                </div>
                <h2 className="no-tail sq-detail-title">{focused.title}</h2>
              </div>
              <button
                className="sq-close"
                onClick={() => onFocus(null)}
                aria-label="关闭详情，回到广场"
              >
                ×
              </button>
            </div>

            {/* 人群规模如实说：数字直接来自 CrowdCluster，与画出来的人形**同源**。
                分成两段（在场 / 缺口）而不是合成一句「5 人参与」——
                因为「等真人」的那个人还没到场，混在一起说就是把未来当现在。 */}
            <div className="sq-detail-crowd">
              {focused.avatarNames.length > 0 && (
                <div className="sq-detail-avatars">
                  {focused.avatarNames.map((n, i) => (
                    <span key={n + i} className="sq-avatar sq-avatar-lg" title={n}>
                      {n.slice(0, 1)}
                    </span>
                  ))}
                </div>
              )}
              <span className="dim sq-detail-crowd-note">
                {focusedCluster ? crowdSummary(focusedCluster) : ""}
              </span>
            </div>

            <div className="sq-detail-body">{renderDetail(focused)}</div>

            <div className="sq-detail-actions">
              <button className="btn btn-primary" onClick={() => onOpen(focused)}>
                载入工作台看完整讨论
              </button>
              <button className="btn btn-ghost" onClick={() => onFocus(null)}>
                回到广场
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
