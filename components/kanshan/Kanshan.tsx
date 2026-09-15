"use client";

import { useReducedMotion } from "motion/react";
import { KANSHAN_ASSET_BY_STATE, KANSHAN_ACCENT_BY_STATE, type KanshanState } from "./states";

/**
 * 看山（刘看山）主持人形象。
 *
 * 素材来源：官方素材包（看山三视图.zip / 刘看山动态.zip），
 * 由用户提供，逐字节核对为官方原文件。**不使用任何自绘几何**。
 *
 * 为什么用位图而不是继续画 SVG：
 *   1. 用户明确要求「刘看山形象用官方素材，不要自己设计」；
 *   2. 官方动态包本身就是成品循环动画（20fps、透明底），
 *      再自绘一遍只会失真，也违反「不使用未授权素材」的边界。
 *
 * 降级：prefers-reduced-motion 时改用静态首帧 PNG（still/），
 * 因为 GIF 无法通过 CSS 暂停，必须换图源。
 *
 * 接口保持与旧版完全一致（state / size / autoBlink / followPointer / className），
 * 所有调用方无需改动。
 */

export interface KanshanProps {
  state?: KanshanState;
  size?: number;
  /** 保留参数以兼容旧调用方；官方素材为成品循环，不再需要单独眨眼调度。 */
  autoBlink?: boolean;
  /** 保留参数以兼容旧调用方；成品动画自带视线，不再叠加指针跟随。 */
  followPointer?: boolean;
  className?: string;
}

export function Kanshan({
  state = "idle",
  size = 220,
  className,
}: KanshanProps) {
  const reducedMotion = useReducedMotion();
  const asset = KANSHAN_ASSET_BY_STATE[state];
  const accent = KANSHAN_ACCENT_BY_STATE[state];

  return (
    <div
      className={className ? "kanshan " + className : "kanshan"}
      data-state={state}
      data-accent={accent}
      style={{ width: size, height: size }}
    >
      <span className="kanshan-glow" aria-hidden />
      <span className="kanshan-ring" aria-hidden />
      {reducedMotion ? (
        // 减少动态效果时用静态首帧：GIF / WebP 动画都无法用 CSS 暂停，必须换图源。
        <img
          className="kanshan-img"
          src={asset.still}
          width={size}
          height={size}
          alt={"看山主持人 · " + asset.label}
          draggable={false}
          decoding="async"
        />
      ) : (
        // 优先 WebP（约为官方 GIF 的 24%），GIF 保留为兜底源。
        <picture>
          <source srcSet={asset.animWebp} type="image/webp" />
          <img
            className="kanshan-img"
            src={asset.anim}
            width={size}
            height={size}
            alt={"看山主持人 · " + asset.label}
            draggable={false}
            decoding="async"
          />
        </picture>
      )}
    </div>
  );
}

export default Kanshan;
