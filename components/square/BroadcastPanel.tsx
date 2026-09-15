"use client";

import type { BroadcastItem } from "@/lib/domain/broadcast";

/**
 * 现场广播 —— 页面右侧那一列。
 *
 * ## 它是干什么的（不只是「右边放个列表」）
 *
 * 产品说明给它的定位是「一列标准问题信息流」。但它在可访问性上还承担一个
 * 更硬的角色：**广场的拖拽替代路径**。
 *
 * WCAG 2.2 有一条 AA 要求（Dragging Movements）：凡是作者定义的拖拽操作，
 * 都必须提供单指针的替代方式。广场的浏览方式是「拖动平移」——如果那是
 * 唯一的路径，对无法精确拖拽的用户（运动障碍、触控板失灵、键盘用户）来说
 * 广场就是不可用的。现场广播让**每一个话题都能被点到**，不需要拖一下。
 * 这不是顺手加的装饰，是那条要求在页面结构上的落地。
 *
 * ## 三条来自产品说明的硬约束
 *
 *   ① 标题固定为「现场广播」，**下面直接是信息流**：没有「展开信息流」，
 *      也没有推荐/最新/关注分类
 *   ② 每条依次是：完整问题标题 → 至多两行摘要 → 少量真实元信息。
 *      **标题是视觉主体**；条目之间用轻分隔线；**不重复放广场人群缩略图**
 *   ③ 右栏拥有独立的纵向滚动；标题始终停在栏顶
 *
 * ## 关于「不联动」——这是刻意的，不是没做
 *
 * 说明原文：拖动广场时右栏不滚动、不重排、不自动高亮；滚动右栏时广场不平移、
 * 不切换高亮；页面不提供两边浏览位置的自动同步。所以这个组件**不接收**
 * `focusedId`，也不接收任何来自广场的悬停状态。两边唯一的联系是同一个 id。
 *
 * 如果以后有人想「顺手把选中的那条也高亮一下」，请先回去读产品说明那一段 ——
 * 那个联动正是规格明确排除的行为。
 *
 * ## 空态去哪了
 *
 * 这里不渲染空态：广场与广播共用同一批讨论，一旦一条都没有，页面级会直接
 * 给出空态（并说明「广场上还没有讨论」），而不是让左半边空着、右半边再写一句
 * 同样的话。所以本组件约定 `items` 非空，由父组件保证。
 */

export interface BroadcastPanelProps {
  items: BroadcastItem[];
  /** 点某一条 → 进入这场讨论（与广场点人群走同一条路径、同一个 id） */
  onOpen: (id: string) => void;
}

export default function BroadcastPanel({ items, onOpen }: BroadcastPanelProps) {
  return (
    <aside className="sq-broadcast" aria-label="现场广播">
      {/* 栏头放在滚动容器**外面** —— 说明要求「标题始终停在右栏上方」。
          用 sticky 也能做到，但 sticky 在滚动容器里遇到 backdrop-filter 或
          带 transform 的祖先时会失效；放在外面是唯一不会出意外的做法。 */}
      <div className="sq-broadcast-head">
        <h2 className="sq-broadcast-title">现场广播</h2>
      </div>

      <div className="sq-broadcast-list">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className="sq-broadcast-row"
            onClick={() => onOpen(it.id)}
          >
            {/* 标题是这一条的主体：字号最大、字重最实、行高最松 */}
            <span className="sq-broadcast-row-title">{it.title}</span>

            {/* 摘要取自某条回答的**原文首句** —— 是引用不是概括，读者可以回原文核对。
                出处不写在这里，而是放进下面的元信息（第一版写成「原文 —— 半佛仙人」，
                结果出处被 line-clamp 挤到第二行，白白吃掉一整行摘要）。
                没有可摘的正文时整行不出现，不写占位文字。 */}
            {it.excerpt && <span className="sq-broadcast-row-excerpt">{it.excerpt}</span>}

            {/* 元信息全部由真实计数拼出；某项为 0 时它压根不在数组里，
                所以不会出现「0 个缺口待补」这种占位噪音。

                每一段单独包一层 nowrap —— 否则窄栏里会从词中间断开
                （实测把「1 个缺口待补」断成「…1 个缺口待」+「补」）。
                段与段之间才是合法的换行点。 */}
            {it.meta.length > 0 && (
              <span className="sq-broadcast-row-meta mono">
                {it.meta.map((m, i) => (
                  <span key={m} className="sq-broadcast-meta-item">
                    {i > 0 ? "· " + m : m}
                  </span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
}
