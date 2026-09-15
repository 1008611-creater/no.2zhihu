"use client";

import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, SPRING } from "@/lib/motion/tokens";

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
 * 无障碍：prefers-reduced-motion 下不渲染任何动画，直接给静态合成图。
 */

type Props = {
  /** 渲染尺寸（正方形边长，px） */
  size?: number;
  /** 是否响应 hover 触发分离。false 时只保留极缓慢的呼吸 */
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

  const label = alt || undefined;
  const decorative = !alt;

  // 降级：静态合成图。与 app/icon.svg 同一形象，保证品牌一致。
  if (reduced) {
    return (
      <span className={className} style={{ display: "inline-block", width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt={alt}
          width={size}
          height={size}
          role={decorative ? "presentation" : "img"}
          aria-label={label}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
        />
      </span>
    );
  }

  // 图层是 785×695 的紧致裁切（见 scripts/split-logo-layers.py 与 logo-layers/meta.json），
  // 因此 viewBox 直接取图层原生尺寸、图层铺 x=0 y=0 即可严格对齐。
  // 不要在这里「凭感觉」加 padding 或改 x/y —— 那会让两层错位，交叠的圆就散掉了。
  const LW = 785;
  const LH = 695;

  // 位移以图形尺寸为基准，取约 4% 宽（品牌标识只能做暗示，不能喧宾夺主）
  const REST = { x: -14, y: 5, scale: 1 };
  const OPEN = { x: 7, y: -10, scale: 1.045 };

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", width: size, height: size, position: "relative" }}
      initial={false}
      whileHover={interactive ? "open" : undefined}
      // 焦点联动只在外部确实可聚焦时才挂：motion 遇到 whileFocus 会给元素
      // 补一个 tabindex，纯装饰场景下就会凭空多出一个 Tab 停留点，
      // 键盘用户必须多按一次才能跳过 logo。
      whileFocus={undefined}
      whileTap={interactive ? "open" : undefined}
      animate={interactive ? undefined : "open"}
      role={decorative ? "presentation" : "img"}
      aria-label={label}
      // 装饰场景下完全退出无障碍树，也不参与键盘序列
      aria-hidden={decorative || undefined}
    >
      {/* hover 分离效果由父级 .brand 的 :hover/:focus-within 触发，
          这样键盘焦点落在真正的链接上时同样会播放，且不引入额外 tabindex。 */}
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
          {/* 暖白底砖。
              为什么不抠成透明：标识里的「真人」是近黑色 #151517，而站点底色是
              #07080f，两者亮度只差约 3%，抠掉底色后黑头会直接融进背景。
              保留暖白圆角底既解决了对比度，又让动态版与静态图标是同一块
              「品牌砖」，不会出现两种观感。 */}
          <defs>
            <clipPath id={`lm-clip-${size}`}>
              <rect width={LW} height={LH} rx="96" />
            </clipPath>
          </defs>
          <rect width={LW} height={LH} rx="96" fill="#F7F6F3" />

          <g clipPath={`url(#lm-clip-${size})`}>
          {/* 分身（蓝）：在底层。激活时向侧后方拉开，让交叠区张开 */}
          <motion.g
            variants={{
              rest: { ...REST },
              open: { ...OPEN, transition: SPRING.gap },
            }}
            initial="rest"
            style={{ transformOrigin: "560px 330px" }}
          >
            <image href="/logo-layers/shadow.png" x="0" y="0" width={LW} height={LH} />
          </motion.g>

          {/* 真人（黑）：在上层。几乎不动，只做极轻微的回落，
              制造「本体稳住、影子才有动作」的对比。 */}
          <motion.g
            variants={{
              rest: { x: 0, y: 0 },
              open: { x: -7, y: 3, transition: SPRING.card },
            }}
            initial="rest"
            style={{ transformOrigin: "340px 350px" }}
          >
            <image href="/logo-layers/human.png" x="0" y="0" width={LW} height={LH} />
          </motion.g>
        </g>
        </svg>
      </motion.span>
    </motion.span>
  );
}

/**
 * 首屏大型品牌标识。
 *
 * 与 LogoMark 的区别：它不依赖 hover，而是在挂载后自己演一次「分离 → 归位」，
 * 作为首屏的开场动作；随后进入极缓慢的循环呼吸，让页面看起来是活的。
 *
 * 为什么只演一次就当静物：首屏元素持续运动会分散注意力，且持续动画会
 * 一直占用合成线程。开场演完即止，是「有节制的动」。
 */
export function LogoMarkHero({ size = 132, className }: { size?: number; className?: string }) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={className}
        src="/logo.png"
        alt="影子知乎"
        width={size}
        height={size}
        style={{ display: "block", width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", width: size, height: size }}
      initial="rest"
      animate={{ x: 0, y: 0 }}
    >
      <svg
        viewBox="0 0 785 695"
        width={size}
        height={size}
        style={{ display: "block" }}
        role="img"
        aria-label="影子知乎"
      >
        {/* 与 LogoMark 同一套处理：暖白底砖保证黑头可见，同时与静态图标同观感。
            坐标系同取自图层原生尺寸（785×695），不额外加 padding。 */}
        <defs>
          <clipPath id="lm-hero-clip">
            <rect width="785" height="695" rx="96" />
          </clipPath>
        </defs>
        <rect width="785" height="695" rx="96" fill="#F7F6F3" />

        <g clipPath="url(#lm-hero-clip)">
          {/* 分身：入场时从本体位置向侧后拉开，缓速归位，随后循环呼吸。
              用 times 控制关键帧落点，让「拉开」比「归位」更快，
              符合「分离是主动的、回归是自然的」这一身体直觉。 */}
          <motion.g
            initial={{ x: -14, y: 5, scale: 1 }}
            animate={{
              x: [-14, 5, -14, -11, -14],
              y: [5, -8, 5, 3, 5],
              scale: [1, 1.04, 1, 1.012, 1],
            }}
            transition={{
              duration: DUR.cinematic * 3.4,
              times: [0, 0.18, 0.42, 0.72, 1],
              ease: EASE.standard,
              repeat: Infinity,
              repeatDelay: 0.6,
            }}
            style={{ transformOrigin: "560px 330px" }}
          >
            <image href="/logo-layers/shadow.png" x="0" y="0" width="785" height="695" />
          </motion.g>

          {/* 真人：完全静止。让「本体不动」成为画面的锚点 */}
          <g>
            <image href="/logo-layers/human.png" x="0" y="0" width="785" height="695" />
          </g>
        </g>
      </svg>
    </motion.span>
  );
}
