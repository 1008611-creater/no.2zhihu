"use client";

import { memo } from "react";
import { RELIC_LABELS, type Relic } from "@/lib/domain/relic";

/**
 * 话题中心那件**发光的东西**。
 *
 * ## 为什么要有一件东西，而不是一个虚线圈
 *
 * owner 的原话：「话题要做可视化，要能一眼看出是干什么的，
 * 人围着就好像这个话题是一颗奇珍异宝一样，发光 —— 这样才能让影子合理」。
 *
 * 三件事被这一件东西同时解决：
 *   ① 一眼看出在聊什么（房子 / 眼镜 / 咖啡杯 / 钟…）
 *   ② 影子有了来源（光就在物件上，人朝外投影 —— 每簇自洽）
 *   ③ 有了「点下去」的理由（它看起来就像一件值得看的东西）
 *
 * ## 为什么全部用几何原语、不用图片
 *
 * 与站内其它插画同一套语言（设计系统只允许圆 / 方 / 线 / 弧），
 * 更重要的是**可复现**：同一标题永远得到同一件物件，不依赖任何外部资源。
 *
 * 形状刻意画得**简到不能再简**：广场上它只有 40–70px 宽，
 * 细节在这个尺寸下会糊成一个色块，反而是「轮廓对不对」决定读不读得出。
 */

/**
 * 每个形状在 `0 0 40 40` 坐标系里的画法。
 *
 * ⚠️ 两种线，**不能混用**（2026-09-17 实测）：
 *   · `sq-relic-line`  —— 画在**物件外面**的线（杯柄 / 蒸汽 / 镜腿 / 底座）。
 *                        它压在近黑的地面上，必须是**亮色**才看得见。
 *   · `sq-relic-detail`—— 画在**物件内部**的线（钟的指针 / 药瓶的分隔 / 楼的窗）。
 *                        它压在实心暖白的本体上，必须是**深色**才看得见。
 *
 * 这两类原来共用一个类名。本体还是「22% 透明暖色」时两者都勉强能用；
 * 本体改成实心暖白之后，同一个颜色必然有一边看不见 ——
 * 要么杯柄消失（深色压在暗底上），要么指针消失（浅色压在亮本体上）。
 * 按「这条线画在物件里面还是外面」拆开，两边就都成立了。
 */
const SHAPES: Record<string, React.ReactNode> = {
  // 房子：三角顶 + 方身 + 一扇门
  house: (
    <>
      <path d="M20 5 L35 17 L32 17 L32 34 L8 34 L8 17 L5 17 Z" />
      <rect x="16.5" y="24" width="7" height="10" className="sq-relic-hole" />
    </>
  ),
  // 钱：一枚币 + 中间的方孔（中国钱的形制）
  coin: (
    <>
      <circle cx="20" cy="20" r="14" />
      <rect x="16" y="16" width="8" height="8" className="sq-relic-hole" />
    </>
  ),
  cup: (
    <>
      <path d="M9 14 L31 14 L28 33 L12 33 Z" />
      {/* 杯柄与蒸汽都在物件**外面** → 亮线 */}
      <path d="M31 17 C36 17 36 26 30 26" className="sq-relic-line" />
      <path d="M15 9 L15 12 M20 8 L20 12 M25 9 L25 12" className="sq-relic-line" />
    </>
  ),
  book: (
    <>
      <path d="M8 10 L20 13 L20 34 L8 31 Z" />
      <path d="M32 10 L20 13 L20 34 L32 31 Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="20" cy="21" r="13" />
      {/* 指针在表盘**内部** → 深线 */}
      <path d="M20 21 L20 13 M20 21 L26 24" className="sq-relic-detail" />
      {/* 表冠在物件外面 → 亮线 */}
      <path d="M15 5 L25 5" className="sq-relic-line" />
    </>
  ),
  glass: (
    <>
      <circle cx="15" cy="24" r="8" />
      <circle cx="27" cy="24" r="8" />
      {/* 镜腿在外面 → 亮线 */}
      <path d="M21 15 L25 12" className="sq-relic-line" />
    </>
  ),
  pill: (
    <>
      <rect x="13" y="10" width="14" height="22" rx="3" />
      {/* 分隔线在药瓶内部 → 深线 */}
      <path d="M13 18 L27 18" className="sq-relic-detail" />
      <rect x="17" y="5" width="6" height="5" rx="1.5" />
    </>
  ),
  ring: (
    <>
      <circle cx="20" cy="23" r="11" />
      <circle cx="20" cy="8.5" r="4" />
    </>
  ),
  heart: (
    <path d="M20 34 C6 24 4 17 9 12 C13 8 18 10 20 14 C22 10 27 8 31 12 C36 17 34 24 20 34 Z" />
  ),
  city: (
    <>
      <rect x="7" y="17" width="8" height="17" />
      <rect x="16" y="9" width="9" height="25" />
      <rect x="26" y="21" width="7" height="13" />
      {/* 窗在楼体内部 → 深线 */}
      <path d="M18 14 L21 14 M18 19 L21 19 M18 24 L21 24" className="sq-relic-detail" />
    </>
  ),
  screen: (
    <>
      <rect x="7" y="10" width="22" height="15" rx="1.5" />
      {/* 底座在物件外面 → 亮线 */}
      <path d="M15 29 L21 29 M18 25 L18 29" className="sq-relic-line" />
      {/* 屏幕内容在屏内 → 深线 */}
      <path d="M11 15 L16 15 M11 19 L21 19" className="sq-relic-detail" />
    </>
  ),
  people: (
    <>
      <circle cx="14" cy="15" r="5" />
      <path d="M6 33 C6 25 10 22 14 22 C18 22 22 25 22 33 Z" />
      <circle cx="27" cy="17" r="4" />
      <path d="M21 33 C21 27 24 24 27 24 C30 24 34 27 34 33 Z" />
    </>
  ),
};

export interface TopicRelicProps {
  relic: Relic;
  /** 该话题标题（无障碍） */
  title: string;
  /** 已按纵深缩放过的世界尺寸 */
  size: number;
  focused: boolean;
  hovered: boolean;
  reduced: boolean;
  /**
   * 只画一半 —— 光晕与本体必须分两次渲染。
   *
   * ⚠️ 为什么必须拆开（2026-09-17 实测）：
   * 原来光晕和本体在同一个 div 里，整块排在人群 svg **之前** ——
   * 于是物件被人挡掉大半。实测截图里「小城市开一家咖啡店」那簇，
   * 那件咖啡杯只从两个人的缝隙里露出一小块，**读不出是什么东西**，
   * 而 owner 的原话是「要能一眼看出是干什么的」。
   *
   * 但也不能整块挪到人前：光晕跑到人前会把人洗白，
   * 「人站在光里」这条就没了（见 crowd.ts 的「人围着它站」）。
   *
   * 所以：**光晕留在人后，本体挪到人前**。
   *   · `part="aura"` → 只画两层光晕（排在人群 svg 之前）
   *   · `part="body"` → 只画物件本体 + 高光（排在人群 svg 之后）
   *   · 不传 → 两块都画（保持向后兼容）
   */
  part?: "aura" | "body";
}

function TopicRelicImpl({ relic, title, size, focused, hovered, reduced, part }: TopicRelicProps) {
  const s = size;
  const showAura = part !== "body";
  const showBody = part !== "aura";
  return (
    <div
      className={
        "sq-relic" +
        (focused ? " sq-relic-focused" : "") +
        (hovered ? " sq-relic-hover" : "")
      }
      style={{
        width: s,
        height: s,
        // 光晕强度由热度决定（relic.intensity）。做成 CSS 变量而不是直接写 opacity，
        // 是为了让「脉动」的关键帧能在它基础上叠加，两者相乘而不是互相覆盖。
        ["--sq-relic-power" as string]: relic.intensity,
      }}
      aria-hidden="true"
    >
      {/* 光晕：从物件往外扩散的一圈暖色。分两层是为了做出「中心很亮、边缘散开」
          的衰减 —— 单层圆形读起来像一个色盘，不像光。 */}
      {showAura && <span className="sq-relic-halo" />}
      {showAura && <span className="sq-relic-halo-outer" />}
      {showBody && (
        <svg className="sq-relic-svg" viewBox="0 0 40 40" focusable="false">
          <title>{RELIC_LABELS[relic.shape] + " —— 这场讨论的核心"}</title>
          <g className="sq-relic-body">{SHAPES[relic.shape] ?? SHAPES.ring}</g>
        </svg>
      )}
      {showBody && !reduced && <span className="sq-relic-spark" />}
    </div>
  );
}

export default memo(TopicRelicImpl);
