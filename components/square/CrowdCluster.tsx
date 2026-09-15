"use client";

import { memo } from "react";
import type { CrowdCluster as CrowdClusterData } from "@/lib/domain/crowd";
import { crowdSummary } from "@/lib/domain/crowd";
import type { TopicNode } from "@/lib/domain/square-layout";

/**
 * 广场上的一簇人。
 *
 * ## 人形怎么画（为什么不是「一人一个 div」）
 *
 * 每簇 3–6 个人形，全广场约 100 个。做法是：人形轮廓定义成 `<symbol>` 一次
 * （在 `SquareCanvas` 的 `<defs>` 里），每个位置只放一个 `<use>`。
 * 这样 100 个人形 = 100 个 `<use>`，没有额外样式计算、没有布局回流；
 * 拖拽只改最外层 `sq-world` 的 transform，整棵树不参与重排。
 *
 * 不用 `<canvas>` 的原因：中文标题在缩放后的 canvas 上会糊，而「文字清晰」
 * 是产品说明里明确的画布选型判据；同时 canvas 里的人群不可聚焦、不可被读屏
 * 软件识别，会同时丢掉可点击性与可访问性。
 *
 * ## 命中区为什么是一个圆形按钮
 *
 * 外层容器 `pointer-events: none`，只有一个人形大小的圆形 `<button>` 接事件。
 * 这样做的两个理由：
 *   ① 空白处必须留给「按住拖动平移」—— 如果整块方形区域都吃事件，
 *      22 个簇会把广场铺满，用户根本找不到地方下手指。
 *   ② 用真的 `<button>` 而不是给 `<div>` 加 `role`，键盘与读屏软件天然可用
 *      （WCAG 2.2 要求拖拽之外必须有单指针/键盘路径）。
 *
 * 标签是注释，不参与交互（`pointer-events: none`），所以它不会挡住相邻簇。
 */

/** 每簇内部坐标系边长。与 `<symbol viewBox>` 无关，只影响 `<use>` 的换算。 */
const BOX = 200;

/** 人形宽高比，必须与 `SquareCanvas` 里 `#sq-figure` 的 viewBox 一致。 */
const GLYPH_ASPECT = 12 / 20;

export interface CrowdClusterProps {
  cluster: CrowdClusterData;
  node: TopicNode;
  focused: boolean;
  dimmed: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}

function CrowdClusterImpl({
  cluster,
  node,
  focused,
  dimmed,
  hovered,
  onHover,
  onSelect,
}: CrowdClusterProps) {
  const r = cluster.radius;
  const d = r * 2;

  // 字号跟着簇走：中央那场大一些，外圈的略小。上下限收得很紧，
  // 因为标题是「同一批问题」的标签，忽大忽小会让人以为层级不同。
  const titleSize = Math.round(11.5 + (r / 115) * 3.5);

  return (
    <div
      className={
        "sq-crowd-node" +
        (focused ? " sq-crowd-node-focused" : "") +
        (dimmed ? " sq-crowd-node-dimmed" : "") +
        (hovered ? " sq-crowd-node-hover" : "")
      }
      style={{
        width: d,
        height: d,
        transform: `translate(${cluster.x - r}px, ${cluster.y - r}px)`,
      }}
    >
      <div className="sq-crowd-body">
        {/* 地面圈：用虚线圆标出「这场讨论占的那块地」。
            没有它的话，外圈小簇在大片深色地面上会像漂浮的点。 */}
        <span className="sq-crowd-ground" />
        {focused && <span className={"sq-crowd-ring r-" + node.theme.accent} />}

        <svg
          className="sq-crowd"
          viewBox={`0 0 ${BOX} ${BOX}`}
          aria-hidden="true"
          focusable="false"
        >
          {cluster.figures.map((f) => {
            // crowd.ts 给的 dy 是「脚底中点」的世界坐标偏移，这里换算到 BOX 空间。
            const h = (f.height / d) * BOX;
            const w = h * GLYPH_ASPECT;
            const fx = BOX / 2 + (f.dx / r) * (BOX / 2);
            const fy = BOX / 2 + (f.dy / r) * (BOX / 2);
            const isGap = f.kind === "gap";
            return (
              <use
                key={f.key}
                href={isGap ? "#sq-figure-gap" : "#sq-figure"}
                x={fx - w / 2}
                y={fy - h}
                width={w}
                height={h}
                // 类名直接由 kind 派生，颜色写死在 CSS 里：
                // 在场 = 中性剪影，缺口 = 空心橙（见 crowd.ts 文件头）。
                className={"sq-figure sq-figure-" + f.kind}
              />
            );
          })}
        </svg>
      </div>

      {/* 浮标标题：问题标题是视觉主体，所以放在簇的上方而不是塞进圆里 */}
      <div className="sq-crowd-label">
        <span className={"sq-cluster-dot a-" + node.theme.accent} />
        <span className="sq-crowd-title" style={{ fontSize: titleSize }}>
          {node.title}
        </span>
      </div>

      {/* 唯一接事件的元素。aria-label 把「谁在这儿、还缺什么」一并说清楚 ——
          读屏用户看不到人形，只能靠这句话。 */}
      <button
        type="button"
        data-topic-card
        className="sq-crowd-hit"
        style={{ width: d, height: d }}
        onPointerEnter={() => onHover(node.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(node.id)}
        onBlur={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        aria-label={node.title + "。" + node.statusLabel + "。" + crowdSummary(cluster)}
      />
    </div>
  );
}

/**
 * `memo` 是必要的，不是优化洁癖：拖动广场时父组件每帧都会重渲染，
 * 22 簇 × 每个 100 来个子元素会跟着重算 —— 而它们的输入（位置、计数）
 * 在拖动过程中**一点都没变**。这一层 memo 把拖动的代价压回「改一个 transform」。
 */
export default memo(CrowdClusterImpl);
