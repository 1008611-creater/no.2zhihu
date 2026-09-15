
# .skills — 项目内置顶级 Skill 工程（总纲）

> 最后更新：2026-09-14
> **权威顺序：`AGENTS.md` 铁律 > 本文件路由 > 各 skill 自身的建议。**
> 一句话：本文件是「什么时候必须读哪个 skill」的唯一权威。**命中才读，不命中不读，读完就停。**
> 配套：入口在 [AGENTS.md](../AGENTS.md) 第 4 节；文档总索引在 [INDEX.md](INDEX.md)。

---

## 0. 三十秒用法

任何线程、任何 Agent，动手前只做三个动作：

| 步骤 | 做什么 | 在哪 |
|---|---|---|
| 1 | 把「我要做的事」在路由表里找一行 | **§3**（唯一主入口） |
| 2 | 命中 → 打开该行的「入口」，按 **§4** 的读法只读指定部分 | §4 + 具体 `SKILL.md` |
| 3 | 不命中 → 用普通能力，**不要打开 `.skills/`** | — |

三条铁律式约束：

- **不要整目录扫描 `.skills/`。** 它是 68MB 的第三方素材库，扫描会瞬间吃掉上下文且拿不到有用信息。
- **一次只读一个 skill 的入口。** 需要第二个时，是「上一阶段已结束、进入下一阶段」的信号，不是「同时读两个」的理由。
- **读完就停。** 拿到方法就回去干活；不要为了「读全」而读完整个 skill 目录树。

---

## 1. 分层模型

本工程用四层「渐进加载」结构，保证**该用的时候能用到，不用的时候不占上下文**：

| 层 | 名称 | 内容 | 何时读 | 体积 |
|---|---|---|---|---|
| **L0** | 铁律层 | [AGENTS.md](../AGENTS.md) §1 不可违反（6 条）+ §2 目录约定 | **每轮必读**（很短，不可省） | ~1 页 |
| **L1** | 路由层 | 本文件 §3 路由表 | **每轮查一次**（不读全文，只查表） | ~1 屏 |
| **L2** | 执行层 | `.skills/<name>/SKILL.md` 及其按需子文件 | **仅命中时读**，且按 §4 只读指定部分 | 0.5–8k 行 |
| **L3** | 证据层 | [AGENTS.md](../AGENTS.md) §5 提交前自检 + 本文件 §6 验收判据 | **仅收尾时读** | ~半页 |

**分层的关键约束：**

1. **L0 永远赢。** 任何 skill 的建议与铁律冲突时，铁律胜，且不需要讨论。典型冲突点：skill 让你装 Tailwind、让你复制参考项目的几何素材、让你把凭证放进客户端。
2. **同一时刻上下文中最多一个 L2。** 这是「不填满上下文」的硬保证。
3. **L2 不是文档，是作业指导书。** 读它是为了动手，不是为了学习。任务结束即释放。
4. **L3 不能跳过。** 用了 skill 不等于做完了；交付判据在 L3，不在 skill 里。

**与全局路由的关系：** 本机另有全局路由 `codex-skill-router`（选 skill 的总纲，归档在 `C:\Users\lsb\.codex\skills\codex-skill-router\`）。分工是：**全局路由决定「要不要用 skill」；本文件决定「本项目的哪块工作必须用哪个内置 skill」。** 两者不冲突——本项目已把选定结果固化在这里，所以常规任务**不需要**再走一遍全局路由，直接查 §3 即可。只有在「要做一件 §3 完全没覆盖的新类型工作」时，才回到全局路由。

---

## 2. 索引（内置清单）

2026-09-15 增补：第 8 个 owner 为 [nuwa-skill](https://github.com/alchaincyf/nuwa-skill)，项目入口 [女娲适配](skills/nuwa/SKILL.md)，规范 [公共人物模块](public-figure-skills.md)。本机已有全局安装；恢复脚本已登记。上游许可与固定版本尚待核验，禁止把当前全局包当作可公开再分发资产。以下原 7 项的统计保留为历史快照。

2026-09-15 二次增补：第 9 个 owner 为 [humanizer](https://github.com/blader/humanizer)，负责**答主文风真实度**（去 AI 味 / 消除「GPT 直答感」）。此前 8 个 owner 无一覆盖文风，属 §3 路由表的真实缺口（门槛 ① 满足；与现有 8 个不重叠）。入口 `.skills/humanizer-main/SKILL.md`，读法与边界见 §4.8。

7 个 skill，全部于 **2026-09-14** 从各仓库 `main` 分支拉取快照，落地在 `.skills/`。

| # | 环节 | Skill | 上游仓库 | ★ | 许可 | commit | 体积 | 入口文件 |
|---|---|---|---|---|---|---|---|---|
| 1 | 代码审查 | code-review-skill | [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill) | 1.9k | MIT | `4850184dfd` | 0.8 MB | `.skills/code-review-skill-main/SKILL.md` |
| 2 | UI/UX 设计智能 | ui-ux-pro-max | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 127k | MIT | `7f69fed6a2` | 19.5 MB | `.skills/ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max/SKILL.md` |
| 3 | 网页动效工艺 | silk-design | [bendrape1-byte/silk-design](https://github.com/bendrape1-byte/silk-design) | 132 | MIT | `0f530f001e` | 0.2 MB | `.skills/silk-design-main/SKILL.md` |
| 4 | 动效 / 创意编码 | genjutsu | [AThevon/genjutsu](https://github.com/AThevon/genjutsu) | 348 | MIT（含第三方声明） | `94a260a20c` | 3.1 MB | `.skills/genjutsu-main/skills/cast/SKILL.md` |
| 5 | 演示视频 | video-talkcraft | [Vincentwei1021/video-talkcraft](https://github.com/Vincentwei1021/video-talkcraft) | 1.0k | PolyForm Noncommercial | `8829ca31fb` | 34.3 MB | `.skills/video-talkcraft-main/SKILL.md` |
| 6 | 图像资产 | banana-claude | [AgriciDaniel/banana-claude](https://github.com/AgriciDaniel/banana-claude) | 1.0k | MIT | `6a2b1b51fd` | 7.5 MB | `.skills/banana-claude-main/skills/banana/SKILL.md` |
| 7 | 多模态生成 | Generative-Media-Skills | [SamurAIGPT/Generative-Media-Skills](https://github.com/SamurAIGPT/Generative-Media-Skills) | 4.3k | MIT | `5519622e88` | 2.6 MB | `.skills/Generative-Media-Skills-main/core/media/SKILL.md` |
| 9 | 答主文风真实度 | humanizer | [blader/humanizer](https://github.com/blader/humanizer) | 48.2k | MIT | `9862685f57` | 0.1 MB | `.skills/humanizer-main/SKILL.md` |

**许可提醒（重要）：**

- **video-talkcraft 是 PolyForm Noncommercial**，非商业使用免费，商业用途需作者事先授权。本作品为比赛参赛作品（非商业），符合许可范围；**若日后商业化，必须重新评估或替换**。
- genjutsu 主体 MIT，但其内部 `skills/_jutsu/ui-ux-pro-max/` 内嵌了 ui-ux-pro-max 的 MIT 数据集，声明已在其 `LICENSE` 尾部注明。
- 其余 5 个均为标准 MIT。
- **humanizer 本体 MIT，但判据来源是 Wikipedia 的 [Signs of AI writing](https://en.wikipedia.org/wiki/Signs_of_AI_writing)（CC BY-SA）**。本项目只使用其**条目编号与判据描述**，不复制维基正文；`.skills/` 不入 git，故不构成再分发。

---

## 3. 路由表（主入口）

按**项目实际工作**分解，不按 skill 罗列。判定列只有三种值。

| # | 我要做的事 | 判定 | Owner | 入口 | 读什么 |
|---|---|---|---|---|---|
| 1 | 提交前代码审查 / 找 bug / 安全审计 | **必须** | code-review-skill | `.skills/code-review-skill-main/SKILL.md` | 入口 → 按语言读 `reference/typescript.md`、`reference/react.md`；跨模块时加 `reference/architecture-review-guide.md` |
| 2 | 改页面视觉 / 配色 / 排版 / 组件 / 响应式 | **必须** | ui-ux-pro-max | `.skills/ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max/SKILL.md` | 入口 → 用 `scripts/search.py` 查命中的 `data/*.csv` 行，**不要读整个 CSV** |
| 3 | 加动效 / 微交互 / 滚动效果 / 页面过渡 | **必须** | silk-design | `.skills/silk-design-main/SKILL.md` | 入口 → 需要现成件时读 `assets/<组件>.tsx`；原理查 `references/effects.md` |
| 4 | 看山角色引擎的动效（弹簧 / 时序 / 性能） | **必须**（仅运动参数） | genjutsu | `.skills/genjutsu-main/skills/cast/SKILL.md` | 入口 → `skills/_jutsu/framer-motion/SKILL.md` + `skills/_jutsu/motion-principles/SKILL.md` |
| 5 | 录演示视频 / 讲解视频 / 动效片段 | **必须**（若做视频） | video-talkcraft | `.skills/video-talkcraft-main/SKILL.md` | 入口 → 按流程读 `references/shot-design.md`、`references/cinematography.md`、`references/design-language.md` |
| 6 | 生成 icon / 封面图 / 品牌图形 | **必须** | banana-claude | `.skills/banana-claude-main/skills/banana/SKILL.md` | 入口 → `references/prompt-engineering.md` + `references/presets.md` |
| 7 | 图像编辑 / 视频生成 / 音乐音频 / 批量多模态 | **条件** | Generative-Media-Skills | `.skills/Generative-Media-Skills-main/core/media/SKILL.md` | 入口 → `core/edit/SKILL.md`（编辑）、`core/platform/SKILL.md`（配置与查结果） |
| 8 | 知乎接口 / 数据流 / 缓存 / 额度改造 | **不要用** | 项目文档 | [zhihu-api/INDEX.md](zhihu-api/INDEX.md) + [architecture.md](architecture.md) | 先查索引，只读命中的一份 |
| 9 | 看山造型与几何设计 | **不要用** | 项目文档 | [character-engine.md](character-engine.md) + `components/kanshan/states.ts` | — |
| 10 | 部署 Vercel / 推送 GitHub | **不要用** | 普通能力 + **外部写授权** | [runbook.md](runbook.md) | — |
| 11 | 产品说明 / 计划书 / 提交材料 | **不要用这些 skill** | 项目文档 | [submission.md](submission.md) | 已是事实来源骨架，直接改，不要重写 |
| 12 | 浏览器真机验收（核心闭环） | **不要用这些 skill** | Browser 工具 | — | HTTP 200 不是验收，必须看到闭环跑通 |
| 13 | 跨线程项目状态 / 交接 | **不要用这些 skill** | `AGENTS.md` + [INDEX.md](INDEX.md) + 本文件 | — | 见 §7 |
| 14 | 新增 / 更新公共人物思维能力、来源审核、人格辨识度验证 | **必须** | nuwa-skill | [项目适配入口](skills/nuwa/SKILL.md) | 上游入口 → 当前人物；提炼读 extraction-framework，构建读 skill-template |
| 15 | 线上邀请公共人物 / 实现人物能力检索 | **不要启动蒸馏** | 项目规范 | [公共人物模块](public-figure-skills.md) | 只加载已审核的能力数据；实现阶段按原 UI/代码审查路由切换 owner |
| 16 | 提升答主文风真实度 / 去 AI 味 / 消除「GPT 直答感」 | **必须** | humanizer | `.skills/humanizer-main/SKILL.md` | 入口 → §1–§5（最强痕迹，一次命中即可改）；词表查 §12 与 §13；`Voice` 一节决定如何用语料样本校准 |

**判定的含义：**

- **必须** —— 不读就动手属于流程违规。这些环节的产出质量直接取决于 skill 的方法论，跳过等于自降效果。
- **条件** —— 出现明确触发信号时才用（例如 #7 只在真的要生成/编辑媒体资产时）。
- **不要用** —— 明确禁止加载。原因见 §7，多数是「skill 会把你带偏」而不是「skill 不好」。

---

## 4. 每个 skill 的读法与边界

这一节回答「命中之后具体怎么读、读到哪里停、产出什么」。**不要通读整个 skill 目录。**

### 4.1 code-review-skill（代码审查）

- **读法**：读入口 `SKILL.md` 拿到审查框架 → 按本项目的语言栈读 `reference/typescript.md` 与 `reference/react.md` → 涉及跨模块依赖时读 `reference/architecture-review-guide.md`。`reference/common-bugs-checklist.md` 是收尾扫盲用，不是必读。
- **不要读**：`index.html` / `index.en.html`（营销页）、其他语言分册（c/cpp/java/php…）与本项目无关。
- **边界**：它是**判据**，不是自动修复器。本项目踩过的真实坑（HTTP 200 掩盖的参数被忽略、注释与实现矛盾）正是它 `common-bugs-checklist` 覆盖的类型。
- **产出**：一份按严重度排序的问题清单，每条给证据（文件 + 行为），不是风格意见。

### 4.2 ui-ux-pro-max（视觉与 UX）

- **读法**：读入口 `SKILL.md` 拿到优先级 1→10 的类别表 → **用 `scripts/search.py` 做定向查询**（风格 / 配色 / 字体 / UX 准则），拿到命中的行再决定。数据集有 79 风格 + 192 配色 + 74 字体配对 + 119 UX 准则 + 105 图标，**直接读 CSV 会爆上下文**。
- **不要读**：`projects/`、`docs/`（上游的示例与宣传）。
- **边界**：本项目视觉已定档为 **Motion Graphic × 文字几何**，四色 token 体系已成型（见 [design-system.md](design-system.md)）。所以它在这里的角色是**打磨与校验**（对比度、触控尺寸、无障碍、一致性），**不是重做风格**。它给的风格库只作为「反面对照」用——凡是把它拉向插画/拟物/渐变堆叠的建议一律拒绝。
- **产出**：具体的 token / 尺寸 / 对比度修正，不是「换一套设计」。

### 4.3 silk-design（网页动效工艺）

- **读法**：读入口 `SKILL.md` 拿到「四件基础」原则 → 需要现成实现时从 `assets/` 取单个组件文件（`ScrollReveal.tsx`、`TextAnimation.tsx`、`BorderGlow.tsx` 等）→ 原理细节查 `references/effects.md` / `references/composition.md`。
- **不要读**：`templates/Reference1..23/`（23 套整站模板，体积大且会诱导你照搬）。
- **边界（关键）**：它默认假设 **React + Vite + Tailwind v4 + motion + GSAP + Lenis**。本项目**禁用 Tailwind**、不装 GSAP、不装 Lenis。所以**只取它的原理与 `assets/*.tsx` 里的 motion 用法**，样式一律改写为项目手写 CSS + token。**不得引入 Tailwind，不得因为 skill 提到就新增依赖。**
- **产出**：用项目既有 token 实现的动效代码，无新增依赖。

### 4.4 genjutsu（动效 / 创意编码）

- **读法**：入口是 `skills/cast/SKILL.md`（流程编排），但本项目的实际内容在子技能 `skills/_jutsu/framer-motion/SKILL.md` 与 `skills/_jutsu/motion-principles/SKILL.md` —— 这两个才是弹簧参数、缓动、时序、性能规则的来源。
- **不要读**：`_jutsu/` 里的 `swiftui-*`、`compose-*`、`threejs-r3f`、`gsap`（本项目不用）。`_jutsu/ui-ux-pro-max/` 是内嵌的 ui-ux 数据，**与 §2 的 #2 重复，不要从这里读**。
- **边界（关键）**：genjutsu 的 `Iron Rules` 明确要求「不许替换既有动画库」「不许未经询问新增依赖」。本项目已用 `motion@^11.11.17`，**保持不动**。另外它对看山的作用**仅限运动参数与节奏**，造型、几何、状态集一律以 `components/kanshan/states.ts`（10 状态）与 [character-engine.md](character-engine.md) 为准。
- **产出**：弹簧参数（stiffness / damping / mass）、状态切换时序、性能修正；不改造型。

### 4.5 video-talkcraft（演示视频）

- **读法**：读入口 `SKILL.md` 拿全流程（文案 → 配音与字级时间戳 → SHOTBOOK 层矩阵 → 实现 → 渲染 → 三重验收）→ 需要镜头语言读 `references/shot-design.md` 与 `references/cinematography.md` → 需要风格档读 `references/design-language.md`。`references/cards/` 是 108 张动效配方卡，**按镜取卡，不要全读**。
- **不要读**：`gallery/`、`demos/`、`workbench/`（演示与工具台）。
- **边界**：① 它的产物是 **Remotion** 工程，本项目主栈是 Next.js，需要单独的工作目录，**不要往主仓库里塞 Remotion 依赖**。② 许可为 **PolyForm Noncommercial**，仅限本次非商业参赛使用。③ 时间只剩约 1 天，视频是 P1 加分项，**不得挤占 P0**。
- **产出**：一条 2–3 分钟的成片 + 可复现的工程目录。

### 4.6 banana-claude（图像资产）

- **读法**：读入口 `skills/banana/SKILL.md` 拿到「冻结视觉简报 → 编译 prompt → 展示计划 → 获授权 → 执行 → 逐像素验收」的流程 → 写 prompt 读 `references/prompt-engineering.md`，选风格读 `references/presets.md`，成本预估读 `references/cost-tracking.md`。
- **不要读**：`tests/`、`tools/`、`docs/`。
- **边界（关键）**：它调用 **Google Gemini 付费接口**。其自身规则要求**每次付费调用前展示确切计划并取得明确授权**，且**重试/续跑都算新的一次付费调用**。这与 `AGENTS.md` 的「外部生成需当轮授权」完全一致 —— **两边的授权要求都要满足，不得静默重试**。需要 `GEMINI_API_KEY`，凭证规则同铁律 1。
- **产出**：icon（1024²）、封面图（1600×900）等静态资产，逐张人工过目后再入仓。

### 4.7 Generative-Media-Skills（多模态生成）

- **读法**：`core/media/SKILL.md` 是生成入口（图/视频/音乐/音频，100+ 模型）→ 需要编辑读 `core/edit/SKILL.md` → 需要配置凭证或查异步结果读 `core/platform/SKILL.md`。
- **不要读**：`.opencode/skills/` 下的 13 个平台化子技能（`muapi-instagram-post`、`muapi-youtube-shorts`、`muapi-ad-creative` 等）——它们是社媒/广告投放场景，**与本项目无关**。
- **边界**：与 banana-claude 功能**高度重叠**。二者**不得同时用于同一任务**（违反 §5 组合纪律）。分工是：**单张创意资产 → banana-claude（质量与审校更强）；批量/多类型媒体管线 → Generative-Media-Skills**。同样需要 `MUAPI_KEY` 与当轮授权。
- **产出**：媒体文件或编辑后的变体，逐件验收。

---

### 4.8 humanizer（答主文风真实度）

- **读法**：读入口 `SKILL.md`。**§1–§5 是「一次命中即可改」的最强痕迹**（not-X-but-Y 对照、单句收尾、格言化、铺垫式开场、与不存在的对手辩论），先读这五节；词表只有两处 —— §12（AI 高频词）与 §13（夸大表述），按需查；**`Voice` 一节是接入关键**：有语料样本时以样本为准，样本覆盖全部规则。
- **不要读**：`.claude-plugin/`、`.github/`、`agents/`、`scripts/`（包校验脚本）、`README.md` 的安装与版本历史（其 25 条速查表可当索引）。
- **边界（关键）**：它是**改写器**，不是生成器，也不做事实核查。本项目**不得把它当作「直接改写线上回答」的工具** —— 那会同时踩铁律 2（不编造）与铁律 3（保留来源）。正确用法是**把它的判据编译成生成侧约束与生成后校验**：① 词表 → `lib/server/mirror.ts` 的负向提示词；② 结构性痕迹 → `lib/domain/voice.ts` 的 `checkVoice()` 检测项；③ `Voice` 样本机制 → 项目已有的 `PersonaVoice.exemplars`。
- **产出**：可枚举、可检测的中文痕迹清单 + 落到 `voice.ts` 的校验项，不是「把这段文字改一改」。

---

## 5. 组合纪律

女娲是离线人物生产 owner，不替代 UI 或代码审查。一个人物完整框架可产出多个能力，但线上每次只选择一个相关能力；完整研究不会自动进入模型上下文。原先仅在用户点名时使用人物视角的排除结论已由本次明确需求更新。

- **一个阶段一个 owner。** 例：「改首页视觉」= ui-ux-pro-max；要顺带加动效，**先做完视觉，再进 silk-design**，不要同时读两个。
- **一个任务最多 2–3 个 skill，按阶段顺序。** 典型合法链：`ui-ux-pro-max（视觉）→ silk-design（动效）→ code-review-skill（审查）`。
- **禁止重叠叠加。** banana-claude 与 Generative-Media-Skills 是同一能力的两个实现，二选一。
- **命中「必须」才读。** 没有命中就用普通能力，**不要为了满足路由规则而加载 skill**。
- **共享关键词不构成叠加理由。** 「看山动效」同时命中 silk-design 与 genjutsu，但 owner 只有一个（genjutsu，因为它管 motion 参数）。
- **skill 的产出仍受 L0 与 L3 约束。** 用了 skill 不等于可以跳过自检。

---

## 6. 与项目约束的对接

| 项目约束（L0） | 对 skill 使用的影响 |
|---|---|
| 铁律 1：凭证永不出服务端 | banana-claude（`GEMINI_API_KEY`）与 Generative-Media-Skills（`MUAPI_KEY`）的密钥同样只能留在服务端/本机环境，禁止进客户端、URL、日志、截图 |
| 铁律 6：`grok-icon-study` 仅学架构，禁复制几何 | 动效 skill 只提供**弹簧参数、时序、过渡节奏**；看山造型与几何必须原创，**不得从任何 skill 或参考项目搬运造型** |
| 禁用 Tailwind（手写 CSS + token） | silk-design 默认假设 Tailwind v4，**只取原理与 motion 用法**，样式改写为项目 token；不得引入 Tailwind |
| 看山状态集以代码为准（10 状态） | 动效 skill 的通用状态表仅供参考，**以 `components/kanshan/states.ts` 为准** |
| 依赖方向严格单向（`app → components → lib/domain`） | skill 生成的代码同样受约束，不得让 `lib/domain` import `lib/zhihu` |
| 不滥用额度 / 新接口默认走缓存 | 外部生成属付费动作，**当轮授权 + 记录成本**；skill 不得静默重试 |
| 不使用未授权素材 | video-talkcraft 的成片素材需自有或已授权；banana-claude 上传素材前需明确权利声明 |

---

## 7. 明确**不要**用 skill 的地方

| 工作 | 为什么不用 |
|---|---|
| 看山造型与几何 | 原创性声明要求；通用 skill 会把它拉回模板化，反而破坏原创叙事 |
| 知乎接口 / 数据流 / 缓存 / 额度 | 属 [zhihu-api/INDEX.md](zhihu-api/INDEX.md) + [architecture.md](architecture.md) 领域，按索引查即可 |
| 部署 Vercel / 推送 GitHub | 普通能力 + **明确的外部写授权**；skill 帮不上且会绕远 |
| 报名状态确认 | 人与平台的流程，不涉及 skill |
| 产品说明 / 计划书 | [submission.md](submission.md) 已是事实来源骨架，**直接改，不要重写** |
| 浏览器真机验收 | 用当前 Browser 工具；**HTTP 200 不是验收** |
| 后端逻辑 / 纯性能 / 非视觉脚本 | ui-ux-pro-max 自身明确说明跳过此类任务 |
| 跨线程状态与交接 | 见下方「同文件夹其他线程怎么用」 |

**同文件夹其他线程怎么用（跨线程约定）：**

- **动手前**：读 [AGENTS.md](../AGENTS.md)（铁律）→ [INDEX.md](INDEX.md)（找文档）→ **本文件 §3 路由表**（决定要不要 skill）。
- **命中「必须」**：读该行 owner 的入口 `SKILL.md`，按 §4 的读法执行，一个阶段一个 owner。
- **没命中**：用普通能力，不要加载 skill 来凑规则。
- **收尾**：在 PR/提交说明里记「工作块 / 阶段 / 主 skill / 验证方式 / 授权边界 / 证据」，新发现补回本文件 §9。

---

## 8. 审计记录：为什么是这 7 个

**审计判据**（按优先级）：① 是否直接服务本项目的交付物 ② 是否与既有约束冲突 ③ 是否引入不可接受的依赖或许可风险 ④ 维护活跃度（star / 最近提交）⑤ 体积与上下文成本。

### 8.1 入选理由

| Skill | 入选的硬理由 |
|---|---|
| code-review-skill | 21k 行、覆盖架构/性能/安全/常见 bug，且**有 TypeScript 与 React 分册**，与本项目栈精确对齐。本项目已出现过「HTTP 200 掩盖真实 bug」的案例，正需要它的 `common-bugs-checklist` |
| ui-ux-pro-max | 127k★、数据集可**脚本定向查询**（不爆上下文），且**自带 UI 实现规则**。设计感占初审 10%，这是唯一能把「打磨」变成有依据动作的工具 |
| silk-design | 体积仅 0.2MB，`assets/` 里是**可直接复用的 motion 组件**，正好补「加动效」环节，成本极低 |
| genjutsu | 唯一提供 **Framer Motion 专项**（弹簧参数/时序/性能）的 skill，直接服务看山引擎这一核心创新点 |
| video-talkcraft | 1.0k★、**中文口播视频全流程**，含 108 张动效配方卡与七层镜头模型。演示视频是选交加分项里最值钱的一项 |
| banana-claude | 1.0k★、**有完整审批与逐像素验收纪律**的图像生成流程，与本项目「外部生成需授权」的铁律天然一致 |
| Generative-Media-Skills | 4.3k★、schema 驱动的多模型媒体生成，作为**批量/多类型**通道补齐 banana-claude 的单张定位 |
| humanizer | **48.2k★（本清单最高）**，判据来自 Wikipedia *Signs of AI writing*（WikiProject AI Cleanup 维护）；25 条痕迹**按强度编号**且**每条带 Watch for 词表与改前改后对照**，可直接编译成代码里的检测项；其 `Voice` 样本校准机制与项目既有的 `PersonaVoice.exemplars` 天然对齐。文风是评委点名的失分项（「仍像 GPT 直答」），此前无 owner |

### 8.2 排除的候选与理由

| 候选 | 排除理由 |
|---|---|
| 各类 Figma 系列（`figma*`） | 本项目**无 Figma 设计稿环节**，视觉直接在代码里做 |
| `deepseek-vision` | 其全局强制图片门与本项目无关，用原生图像能力或窄任务路由即可 |
| `nuwa-skill` 人格视角系列 | 2026-09-15 已改为入选：公共人物离线蒸馏 owner；已有 perspective 包逐个人审核，禁止默认全部加载 |
| 短剧/剧本类（`mx-shortdrama-*`、`audit-master-thread`） | 经实测为**短剧生产专用**（剧本→资产→分镜→视频→剪辑），本项目不适用 |
| 平台发布类（抖音/快手/小红书/X） | 本项目发布到知乎，且**知乎开放平台无发布接口**（见 [publish-path.md](publish-path.md)） |
| SEO / 营销 / CRO 类 | 本作品是比赛 Demo，无增长目标 |
| 其他 UI 风格库（`frontend-design`、`hallmark`、`impeccable` 等） | 与 ui-ux-pro-max **能力重叠**；重叠即排除，避免路由歧义（§5） |
| `ikun-image2` | 已淘汰的不可用路由，不得静默替换 |
| 浏览器验收类 skill | GitHub 上同类 star 普遍偏低，且**当前 Browser 工具已覆盖**，无需引入 |
| 中文去 AI 味同类（`MrGeDiao/shuorenhua` 1.7k★、`orange2ai/renwei-writing` 1.1k★、`larashero3-dotcom/lieflat-less-ai-tone` 0.7k★ 等） | 与 humanizer **能力重叠**（§5 禁止重叠叠加）。且其定位是**保守编辑**（保留句段结构、最小改动），与「打散三段式、重建节奏」的目标部分冲突；它们的长处（中文保真边界：保事实、保情态强度、保责任归属）已由 humanizer 工作流第 3 步的 draft check 覆盖 |

### 8.3 已排除的替代方案（同环节二选一）

- **动效**：silk-design（网页动效工艺）vs genjutsu（创意编码）→ **两个都留但职责切开**：silk-design 管页面级动效，genjutsu 管 motion 参数。若只留一个会缺另一半。
- **图像**：banana-claude（单张、强审校）vs Generative-Media-Skills（批量、多类型）→ 保留两者但**禁止同任务叠加**。
- **代码审查**：code-review-skill 的 TypeScript/React 分册覆盖度高于同类，无替代必要。

---

## 9. 未闭环事项（审计发现的真实缺口）

> 这些不是 skill 的问题，但会直接决定交付成败。审计的价值一半在这里。

| # | 事项 | 状态 | 说明 |
|---|---|---|---|
| 1 | **报名状态未确认** | ⚠️ **待确认** | **唯一会让全部工作归零的项**，优先于任何 skill 路由与代码修复 |
| 2 | 无 `.git` 仓库 | ⚠️ 待本机执行 | 本会话禁止子进程；`scripts/push-to-github.ps1` 已备好 |
| 3 | 构建未验证 | ⚠️ 待本机执行 | 类型检查已过；`next build` 需子进程，沙箱内跑不了 |
| 4 | 媒体素材不齐 | 🟡 部分完成 | 已有 `app/icon.svg` 与 `app/manifest.ts`；**封面图与演示视频仍缺** |
| 5 | 演示视频 | ⬜ 待办 | P1 加分项；若做，走 §4.5 流程 |
| 6 | 快照兜底（`.snapshots/`） | ⬜ 待办 | 保证 Demo 演示不依赖实时额度 |

**已修复并复核通过（2026-09-14）：**

| 缺陷 | 证据 |
|---|---|
| 搜索参数 `Limit` → `Count` | `lib/zhihu/client.ts` 已改用 `Count`，实测生效 |
| 直答注释与实现矛盾 | `lib/server/mirror.ts` 注释已改为「默认开启」 |
| 搬运文案暗示「预填」 | `mirror.ts` 与 `submission.md` 已删除该表述，与 `HANDOFF_NOTE` 口径一致 |
| 目录约定 `components/character/` | 已统一为 `components/kanshan/` |
| 看山状态集 7 对 10 不一致 | [character-engine.md](character-engine.md) 已改为 10 状态 |
| API 目录结构不符 | [architecture.md](architecture.md) 已列全 5 个路由 |
| 双状态源可能打架 | 新增 `flowStateAt()` 作为唯一状态源 |
| 路线图状态未更新 | [roadmap.md](roadmap.md) P0 多项已标完成 |

---

## 10. 维护方式

- **恢复/重建**：`.skills/` 体积约 68MB 且属第三方作品，**不纳入 git**（见 `.gitignore`）。新克隆的仓库运行 `node scripts/fetch-skills.mjs` 恢复全部快照（当前 9 个），保证任何线程拿到同一组 skill。
- **脚本与本文件同步**：`scripts/fetch-skills.mjs` 里的仓库列表必须与 §2 索引表一致。**改一处必须改另一处。**
- **更新流程**：重拉对应仓库快照 → 替换目录 → 更新 §2 的 ★ / commit / 体积 → 若入口路径变了，同步改 §3 与 §4 → 在 §8 记录变更理由。
- **新增 skill 的门槛**：必须同时满足 ① 有 §3 路由表里**没有 owner** 的工作块 ② 不与现有 7 个重叠 ③ 许可允许本次使用。**不满足就不加**——加一个重叠 skill 会让路由歧义，比没有更糟。
- **移除 skill 的门槛**：其 owner 工作块被其他 skill 完全覆盖，或许可风险不可接受。
- **本文件是唯一权威。** 其他文档若描述 skill 路由，一律以本文件为准；发现不一致时**改别的文档，不改这里**（除非本文件本身过期）。

---

## 附：一句话总结

**9 个 owner，按任务命中才读。女娲负责离线生产，产品运行时只读相关能力；humanizer 管文风，铁律优先，自检不能省。**
