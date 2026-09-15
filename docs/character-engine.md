# 看山角色引擎规格

> 最后更新：2026-09-14（v2：改用官方素材，废弃自绘 SVG 方案）
> 目标：把刘看山做成**状态驱动的官方形象**，全站唯一状态源，不自己设计角色

## 一、这一版改了什么（重要）

**v1（已废弃）**：用原创几何自绘一只北极狐，弹簧驱动眼睛、耳朵、尾巴。

**v2（当前）**：直接使用**官方素材包**里刘看山的成品形象。

改版原因：

1. 用户明确要求「刘看山形象用官方素材，不要自己设计」；
2. 官方动态包本身就是成品循环动画（透明底、20fps），再自绘一遍只会失真；
3. 遵守「不使用未授权素材」的边界：自绘「像刘看山」的形象有版权风险，用官方素材反而干净。

因此本项目**不再自绘任何看山几何**，只做「产品状态 → 官方动作」的映射。
旧方案里的 EYE_PLAYLISTS / HOLD_MS / 弹簧姿态表已全部删除。

## 二、素材落地

官方素材由用户提供（看山三视图.zip / 刘看山动态.zip），逐字节核对为官方原文件。
解压后统一放到 public/kanshan/，并**重命名为 ASCII 文件名**，避免 URL 中文编码问题：

```
public/kanshan/
  anim/    动态 GIF（成品循环，透明底，20fps，320x320）
           idle / greet / sway / computer / sleepy / ball
  still/   静态首帧 PNG（reduced-motion 兜底）
           同名 6 张 + _map.json（原始中文名映射）
  views/   三视图 JPG（比例参考，不在页面直接展示）
```

原始中文名与 ASCII 名的对应关系记录在 still/_map.json，便于追溯。

## 三、状态表（全站唯一状态源）

定义在 components/kanshan/states.ts。

KanshanState 保留 10 个产品状态，但每个状态现在**映射到一段真实存在的官方动作**，而不是自己画关键帧：

| 产品状态 | 官方动作 | 选型理由 |
|---|---|---|
| idle | 待机 | 默认，无输入时 |
| greeting | 打招呼 | 开场与邀请，都是「面向某个人」 |
| routing | 晃悠 | 挑人时在场上踱步 |
| searching | 电脑 | 「正在处理」的统一动作 |
| thinking | 电脑 | 同上：用户眼里检索与思考是同一件事 |
| answering | 电脑 | 同上 |
| gap | 晃悠 | 发现缺口时的转折、踱步 |
| inviting | 打招呼 | 面向真人 |
| celebrate | 运球 | 全站最稀缺的庆祝动作，只在闭环完成时出现 |
| sleepy | 瞌睡 | 长时间无交互 |

映射常量：KANSHAN_ASSET_BY_STATE（状态 -> { anim, still, label }），
配色：KANSHAN_ACCENT_BY_STATE（状态 -> 设计系统四色）。

### 为什么映射写死在表里

不允许在组件里临时拼状态。收敛到一张表后：

- 同一页面上多个看山实例的动作必然一致；
- 新增页面时不会各写各的；
- 无障碍描述（label）集中维护。

## 四、流程接线

FLOW_STATES 是 8 步产品流程，每步给出 key（KanshanState）、label、caption：

| 步 | 状态 | 文案 |
|---|---|---|
| 1 | greeting | 接入问题 |
| 2 | routing | Human Router · 正在挑选该由哪些分身来答 |
| 3 | searching | 取真实证据 · 在知乎检索公开回答 |
| 4 | thinking | 交叉比对 · 检查哪些地方证据不足 |
| 5 | answering | 生成多视角 · 每个分身按自己的文风作答 |
| 6 | gap | 缺口识别 · 这一段只有真人能答 |
| 7 | inviting | 邀请真人 · 按公开回答匹配到具体的人 |
| 8 | celebrate | 更新 Mesh · 补充完成，关系图长出新的边 |

flowStateAt(step) 是唯一的状态推导函数：step < 0 返回 idle，超过最后一步返回 celebrate，其余返回当前步的 key。

## 五、组件接口

```tsx
// components/kanshan/Kanshan.tsx
export interface KanshanProps {
  state?: KanshanState;   // 默认 "idle"
  size?: number;          // 默认 220
  autoBlink?: boolean;    // 保留兼容旧调用方，官方素材自带动画，不再使用
  followPointer?: boolean;// 保留兼容旧调用方，同上
  className?: string;
}
```

渲染结构：

```
.kanshan[data-state][data-accent]
  .kanshan-glow   状态色光晕
  .kanshan-ring   装饰环（缓慢旋转）
  img.kanshan-img 官方 GIF / PNG
```

**接口与 v1 完全一致**，所有旧调用方（state / size / followPointer）无需改动。

## 六、降级与无障碍

- prefers-reduced-motion：GIF 无法用 CSS 暂停，因此改用 still/ 静态首帧 PNG。
- 每张图都带 alt="看山主持人 · <官方动作名>"。
- KanshanStage 在角色旁同步展示当前步骤文案，信息不只依赖动画。

## 七、实现要求（当前）

1. **只用官方素材**，不新增任何自绘几何或第三方角色素材。
2. 状态映射集中在 states.ts，组件内不得临时拼。
3. 保持 props 接口稳定，避免影响既有页面。
4. 单实例开销低：GIF 由浏览器解码，React 侧不跑 rAF。
5. prefers-reduced-motion 必须有静态兜底。

## 八、实现状态

- [x] 官方素材解压、ASCII 改名、落地 public/kanshan/
- [x] Kanshan 改为渲染官方素材，保留 props 接口
- [x] states.ts 状态 -> 官方动作映射 + 配色表
- [x] prefers-reduced-motion 静态 PNG 兜底
- [x] 与页面流程接线（FLOW_STATES / flowStateAt）
- [x] 废弃并删除 EYE_PLAYLISTS / HOLD_MS / 自绘弹簧姿态表
- [x] 三视图归档在 public/kanshan/views/，仅作比例参考
