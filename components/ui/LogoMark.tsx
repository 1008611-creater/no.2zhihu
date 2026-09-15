"use client";

import { useId } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { SPRING } from "@/lib/motion/tokens";
import {
  LOGO_HUMAN_PATH,
  LOGO_SHADOW_PATH,
  LOGO_VIEWBOX,
} from "@/lib/brand/logo-paths";

/**
 * 品牌标识（可动版）。
 *
 * 静态 logo 只能整体缩放或位移，那是装饰性动效，看多了没有记忆点。
 * 但本标识的构造本身就有叙事：左边黑色侧影是「真人」，右边蓝色侧影是
 * 「分身」，两者交叠处挖空的圆是「重合处生成的回答」。因此可以拆成两层
 * 独立驱动——
 *
 *   静止：两层严丝合缝，与静态 logo 完全一致（不会让品牌形象走样）
 *   激活：分身向侧后方轻移、略微放大，交叠区随之扩大，再借弹簧归位
 *
 * 这个动作的语义是「分身从本体中分离、又回到本体」，即产品在做的事。
 * 位移量刻意压得很小（约图形宽度的 4%），因为品牌标识的首要职责是
 * 稳定可辨认，动效只能做暗示，不能喧宾夺主。
 *
 * 为什么用矢量而不是位图：顶栏 logo 只有 32px，位图方案要为它下载并解码
 * 两张 785x695 的 RGBA 图，而 inline <path> 是零请求、零解码。轮廓由
 * scripts/build-logo-vector.py 从同一套裁切生成，与 logo-layers/*.png 坐标
 * 完全一致，所以换成矢量后视觉零变化。
 *
 * 无障碍：prefers-reduced-motion 下不渲染任何动画，直接给静态合成图。
 */

type Props = {
  /** 渲染尺寸（正方形边长，px） */
  size?: number;
  /** 是否响应 hover 触发分离。false 时保持静止 */
  interactive?: boolean;
  className?: string;
  /** 无障碍标签；纯装饰场景传空字符串 */
  alt?: string;
};

export function LogoMark({
  size = 32,
  interactive = true,
  className,
  alt = "影子知乎",
}: Props) {
  const reduced = useReducedMotion();
  const uid = useId();
  const clipId = `lm-clip-${uid}`;

  const decorative = !alt;
  const { width: LW, height: LH } = LOGO_VIEWBOX;

  // 位移以图形尺寸为基准，取约 4% 宽（品牌标识只能做暗示，不能喧宾夺主）
  const REST = { x: -14, y: 5, scale: 1 };
  const OPEN = { x: 7, y: -10, scale: 1.045 };

  // 暖白底砖。
  // 为什么不抠成透明：标识里的「真人」是近黑色 #151517，而站点底色是
  // #07080f，两者亮度只差约 3%，抠掉底色后黑头会直接融进背景。
  // 保留暖白圆角底既解决了对比度，又让动态版与静态图标是同一块「品牌砖」。
  const brick = (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect width={LW} height={LH} rx="96" />
        </clipPath>
      </defs>
      <rect width={LW} height={LH} rx="96" fill="#F7F6F3" />
    </>
  );

  // 降级：不渲染任何动画，直接给静态合成图。
  // 这里也走矢量，所以开启「减少动态效果」的用户不会额外下载 174KB 位图。
  if (reduced) {
    return (
      <span
        className={className}
        style={{ display: "inline-block", width: size, height: size }}
        role={decorative ? "presentation" : "img"}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative || undefined}
      >
        <svg
          viewBox={`0 0 ${LW} ${LH}`}
          width={size}
          height={size}
          style={{ display: "block" }}
          aria-hidden="true"
        >
          {brick}
          <g clipPath={`url(#${clipId})`}>
            <path d={LOGO_SHADOW_PATH} fill="#3F79FD" />
            <path d={LOGO_HUMAN_PATH} fill="#151517" />
          </g>
        </svg>
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", width: size, height: size, position: "relative" }}
      initial={false}
      whileHover={interactive ? "open" : undefined}
      // 焦点联动交给外层 .brand 的 :focus-within。这里刻意不挂 whileFocus：
      // motion 遇到它会自动补一个 tabindex，纯装饰场景下就会凭空多出一个
      // Tab 停留点，键盘用户必须多按一次才能跳过 logo。
      whileFocus={undefined}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative || undefined}
    >
      <motion.span
        style={{ display: "block", width: "100%", height: "100%" }}
        variants={{ rest: { scale: 1 }, open: { scale: 1.06 } }}
        transition={SPRING.light}
      >
        <svg
          viewBox={`0 0 ${LW} ${LH}`}
          width={size}
          height={size}
          style={{ display: "block" }}
          aria-hidden="true"
        >
          {brick}
          <g clipPath={`url(#${clipId})`}>
            {/* 分身（蓝）：在底层。激活时向侧后方拉开，让交叠区张开 */}
            <motion.g
              variants={{ rest: { ...REST }, open: { ...OPEN, transition: SPRING.gap } }}
              initial="rest"
              style={{ transformOrigin: "560px 330px" }}
            >
              <path d={LOGO_SHADOW_PATH} fill="#3F79FD" />
            </motion.g>

            {/* 真人（黑）：在上层。几乎不动，只做极轻微的回落，
                制造「本体稳住、影子才有动作」的对比。 */}
            <motion.g
              variants={{ rest: { x: 0, y: 0 }, open: { x: -7, y: 3, transition: SPRING.card } }}
              initial="rest"
              style={{ transformOrigin: "340px 350px" }}
            >
              <path d={LOGO_HUMAN_PATH} fill="#151517" />
            </motion.g>
          </g>
        </svg>
      </motion.span>
    </motion.span>
  );
}

export default LogoMark;
