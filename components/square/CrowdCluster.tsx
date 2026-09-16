"use client";

import { memo } from "react";
import type { CrowdCluster as CrowdClusterData } from "@/lib/domain/crowd";
import { crowdSummary } from "@/lib/domain/crowd";
import type { LightSource } from "@/lib/domain/light";
import { groundOpacityAt, lightOfCluster, shadowOf } from "@/lib/domain/light";
import { interactionsOf, type Gesture } from "@/lib/domain/dialogue";
import { relicOf } from "@/lib/domain/relic";
import TopicRelic from "./TopicRelic";
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
 * ## 这一版加了什么（2026-09-15 第三轮 · 视觉重做）
 *
 *   ① **姿态与体态**：四种姿态 symbol + 每人独立的身高/肩宽/倾斜
 *      （由稳定 key 派生，见 `light.ts` 的 `shapeOf`）。上一版 97 个一模一样
 *      的剪影 = 一个图标复制 97 次，这是被说「平庸」的直接原因之一。
 *   ② **影子**：每个人朝背离光源的方向在地上甩出一条硬影。
 *      影子用 **CSS transform + transition**，所以光源一移，全场影子是
 *      **转过去**的而不是瞬间跳过去的 —— 那一下是整个广场的记忆点。
 *   ③ **缺口 = 地上的洞**：不再画空心小人，而是画地面上一个透着暖光的洞。
 *      **所有人都投下影子，只有那几个位置地上是空的** —— 一眼就知道
 *      「这儿少了一个人」，不需要任何解释。
 *      ⚠️ 这只改**渲染**，不改 `crowd.ts` 里 `kind: "gap"` 的语义 ——
 *      那个字段是另一个线程（PR #53）的自检依赖的，动它会跨线程弄坏别人的守卫。
 *   ④ **纵深**：整簇按 y 坐标缩放（远处小），并按纵深降明度（远处暗）。
 *
 * ## 呼吸为什么在「簇」这一层，而不是每个人
 *
 * GSAP 官方技能的性能规范明确写着：**不要为几百个元素各建一条 tween，
 * 用 stagger**。这里同理 —— 97 个独立动画元素会造出 97 个合成层，
 * 而 22 个（每簇一个、错相）在视觉上完全够：一整片人群在缓慢起伏，
 * 正是「广场活着」的信号。幅度刻意压到 1.2px，低于这个就看不出动。
 *
 * ## 命中区为什么是一个圆形按钮
 *
 * 外层容器 `pointer-events: none`，只有一个人形大小的圆形 `<button>` 接事件。
 * 这样做的两个理由：
 *   ① 空白处必须留给「按住拖动平移」—— 如果整块方形区域都吃事件，
 *      22 个簇会把广场铺满，用户根本找不到地方下手指。
 *   ② 用真的 `<button>` 而不是给 `<div>` 加 `role`，键盘与读屏软件天然可用
 *      （WCAG 2.2 要求拖拽之外必须有单指针/键盘路径）。
 */

/** 每簇内部坐标系边长。与 `<symbol viewBox>` 无关，只影响 `<use>` 的换算。 */
const BOX = 200;

/** 人形宽高比，必须与 `SquareCanvas` 里各姿态 symbol 的 viewBox 一致。 */
const GLYPH_ASPECT = 12 / 20;

/** 姿态 → symbol id。四个 symbol 都在 `SquareCanvas` 的 `<defs>` 里定义一次。 */
const POSE_HREF: Record<string, string> = {
  stand: "#sq-fig-stand",
  turn: "#sq-fig-turn",
  fold: "#sq-fig-fold",
  lean: "#sq-fig-stand",
};

export interface CrowdClusterProps {
  cluster: CrowdClusterData;
  node: TopicNode;
  focused: boolean;
  dimmed: boolean;
  hovered: boolean;
  reduced: boolean;
  onHover: (id: string | null) => void;
  onSelect: () => void;
}

function CrowdClusterImpl({
  cluster,
  node,
  focused,
  dimmed,
  hovered,
  reduced,
  onHover,
  onSelect,
}: CrowdClusterProps) {
  const r = cluster.radius;
  const d = r * 2;

  // 字号跟着簇走：中央那场大一些，外圈的略小。上下限收得很紧，
  // 因为标题是「同一批问题」的标签，忽大忽小会让人以为层级不同。
  const titleSize = Math.round(11.5 + (r / 115) * 3.5);

  // 纵深 → 明度。远处的簇淡入背景（大气透视），这是「地面向远处退去」
  // 最便宜也最有效的一半；另一半是尺度（已在 crowd.ts 里算进 height）。
  const depthOpacity = groundOpacityAt(cluster.depth);

  /**
   * **本簇自己的光源** —— 就在中心那件发光物件上。
   *
   * 2026-09-16 修正：原先是全广场一盏灯。后果是离灯远的那十几簇，
   * 所有人的影子互相平行地甩向同一方向，读起来像一片被风吹倒的草。
   * 现在每簇自发光，影子从物件向外辐射，每簇的光影自己就闭合了。
   */
  const relic = relicOf(node.title, node.size);
  const light = lightOfCluster(cluster.x, cluster.y, relic.intensity);
  // 影长的归一化尺度 = 簇半径（不再是「到最远簇的距离」，见 light.ts）
  const reach = Math.max(cluster.radius, 1);

  /**
   * 小动作。**只给在场分身** —— 缺口的人还没来，给他动作等于假装他已站在这儿。
   *
   * 62% 的人只是静立（见 dialogue.ts）：人人都动就不像人群，像机器人展。
   */
  const acts = interactionsOf(
    node.id,
    cluster.figures.filter((f) => f.kind === "persona").map((f) => f.key),
  );
  const actOf = new Map(acts.map((a) => [a.from, a]));

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
        // 整簇的纵深明度挂在这里（而不是 svg 上），这样悬停/聚焦的
        // 透明度变化可以和它相乘，不会互相覆盖。
        ["--sq-depth-opacity" as string]: depthOpacity,
      }}
    >
      <div className="sq-crowd-body">
        {/* 地面：人群占的那块地被压暗一点。
            没有它，外圈小簇在大片地面上会像漂浮的点。 */}
        <span className="sq-crowd-ground" />
        {focused && <span className={"sq-crowd-ring r-" + node.theme.accent} />}

        {/* **话题中心那件发光的东西**。
            放在人群底座之下、人形之上 —— DOM 顺序上先于 svg，
            所以光晕会被后面的人形压住一层，人因而「站在光里」而不是「浮在光上」。
            尺寸取簇直径的 30%（`RELIC_RADIUS_RATIO` 的两倍，含光晕余量）。 */}
        <TopicRelic
          relic={relic}
          title={node.title}
          size={d * 0.34}
          focused={focused}
          hovered={hovered}
          reduced={reduced}
        />

        <svg
          className="sq-crowd"
          viewBox={`0 0 ${BOX} ${BOX}`}
          aria-hidden="true"
          focusable="false"
          style={reduced ? undefined : { animationDelay: `-${(cluster.depth * 4.6).toFixed(2)}s` }}
        >
          {/* 中心那件发光的东西。画在人**之前**（人在它外侧站着），
              但它自己带光晕，会盖到人脚下 —— 这正是「围着它」的观感来源。 */}
          {light &&
            cluster.figures
              .filter((f) => f.kind === "persona")
              .map((f) => {
                const h = (f.height / d) * BOX;
                const fx = BOX / 2 + (f.dx / r) * (BOX / 2);
                const fy = BOX / 2 + (f.dy / r) * (BOX / 2);
                const s = shadowOf(
                  { x: f.dx, y: f.dy },
                  f.height,
                  { id: light.id, x: light.x - cluster.x, y: light.y - cluster.y },
                  reach,
                );
                const sw = (s.width / d) * BOX;
                const sl = (s.length / d) * BOX;
                return (
                  <rect
                    key={"sh-" + f.key}
                    className="sq-shadow"
                    x={-sw / 2}
                    y={0}
                    width={sw}
                    height={sl}
                    rx={sw / 2}
                    style={{
                      transform: `translate(${fx}px, ${fy}px) rotate(${s.angle}deg)`,
                    }}
                  />
                );
              })}

          {/* 缺口 → 地上的洞。三层椭圆叠出「往下漏光」的纵深：
              外圈暖光、洞口的暗、洞里最深的一层。 */}
          {cluster.figures
            .filter((f) => f.kind === "gap")
            .map((f) => {
              const h = (f.height / d) * BOX;
              const fx = BOX / 2 + (f.dx / r) * (BOX / 2);
              const fy = BOX / 2 + (f.dy / r) * (BOX / 2);
              const hw = h * GLYPH_ASPECT * 1.15;
              return (
                <g key={"hole-" + f.key}>
                  <ellipse
                    className="sq-hole-glow"
                    cx={fx}
                    cy={fy}
                    rx={hw * 1.55}
                    ry={hw * 0.62}
                    style={reduced ? undefined : { animationDelay: `-${(f.shape.phase * 3.6).toFixed(2)}s` }}
                  />
                  <ellipse className="sq-hole-void" cx={fx} cy={fy} rx={hw} ry={hw * 0.4} />
                  <ellipse className="sq-hole-deep" cx={fx} cy={fy} rx={hw * 0.58} ry={hw * 0.23} />
                  <ellipse className="sq-hole-rim" cx={fx} cy={fy} rx={hw} ry={hw * 0.4} />
                </g>
              );
            })}

          {cluster.figures
            .filter((f) => f.kind === "persona")
            .map((f) => {
              // crowd.ts 给的 dy 是「脚底中点」的世界坐标偏移，这里换算到 BOX 空间。
              const h = (f.height / d) * BOX;
              const w = h * GLYPH_ASPECT * f.shape.widthScale;
              const fx = BOX / 2 + (f.dx / r) * (BOX / 2);
              const fy = BOX / 2 + (f.dy / r) * (BOX / 2);
              const act = actOf.get(f.key);
              const g: Gesture = act?.gesture ?? "breeze";
              return (
                <g
                  key={f.key}
                  // 动作的类挂在 <g> 上、旋转挂在 <use> 上 —— 两者都是 transform，
                  // 放同一个元素会互相覆盖（CSS transform 会盖掉 attribute transform）。
                  className={"sq-act sq-act-" + g}
                  style={
                    reduced || !act
                      ? undefined
                      : {
                          animationDelay: `-${(act.phase * act.period).toFixed(2)}s`,
                          animationDuration: `${act.period}s`,
                        }
                  }
                >
                  <use
                    href={POSE_HREF[f.shape.pose] ?? "#sq-fig-stand"}
                    x={fx - w / 2}
                    y={fy - h}
                    width={w}
                    height={h}
                    className="sq-figure sq-figure-persona"
                    // 倾斜绕**脚底**转 —— 绕中心转会让人像飘起来。
                    transform={`rotate(${f.shape.lean.toFixed(2)} ${fx.toFixed(2)} ${fy.toFixed(2)})`}
                  />
                </g>
              );
            })}
        </svg>
      </div>

      {/* 浮标标题：问题标题是视觉主体，所以放在簇的上方而不是塞进圆里。
          ⚠️ 下面那行真名**全部来自库里已有的 `skills[].name`** ——
          一个字都不是我们编的。半佛仙人没说过的话，不能由我们替他写。 */}
      <div className="sq-crowd-label">
        <span className={"sq-cluster-dot a-" + node.theme.accent} />
        <span className="sq-crowd-title" style={{ fontSize: titleSize }}>
          {node.title}
        </span>
        {node.avatarNames.length > 0 && (
          <span className="sq-crowd-who">
            {node.avatarNames.slice(0, 4).join(" · ")}
            {node.personaCount > node.avatarNames.length
              ? " 等 " + node.personaCount + " 位"
              : ""}
          </span>
        )}
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
 * `memo` 是必要的，不是优化洁癖：拖动广场时父组件每帧都会重新渲染，
 * 22 簇 × 每个 100 来个子元素会跟着重算 —— 而它们的输入（位置、计数）
 * 在拖动过程中**一点都没变**。这一层 memo 把拖动的代价压回「改一个 transform」。
 */
export default memo(CrowdClusterImpl);
