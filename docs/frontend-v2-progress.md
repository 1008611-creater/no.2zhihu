# 前端 v2 实施记录

状态：部分实现，生产构建已通过；尚未完成完整视觉验收、分阶段提交、PR 或部署。

## 已落地

- app/(flow)：首页、mirror、fill、answer/[id]，共享回答流程导航。
- app/(explore)：mesh、square、feed、about、personas，共享探索导航。公开 URL 不变。
- 本地 Space Grotesk / JetBrains Mono 接入 next/font/local；字体公开发布前仍需补齐许可文件。
- frontend-v2.css：Reference19 暗色基础皮肤、知乎蓝操作色、橙色缺口、统一圆角与字体变量。既有身份色保留。
- MotionProvider：统一减少动态效果策略；Lenis 随系统偏好创建/销毁。
- tokens.ts：260/26 卡片弹簧、180/18 缺口弹簧、60ms 错峰、400ms 缺口留白已接入卡片。
- 首页逐字标题与滚动位移；GSAP 同站链接出场 200ms、入场 320ms；导航共享指示条。
- loading/error/not-found，跳到正文链接。
- fill 接受 answerId；不存在的目标不自动换成其他回答；详情页接管链接带 ID；修复空补充提交与切换回答沿用旧草稿。
- InviteDrawer：Portal、键盘循环、Escape、焦点恢复、滚动锁定、dialog 语义；首页和 mirror 使用 invite=1 URL 状态。
- MeshGraph：固定初始位置的 d3-force 布局，d3-scale 节点尺寸，拖拽/背景平移、缩放、选择详情与键盘访问。
- 工作台：严重度仪表、分身证据覆盖雷达图、真实来源时间轴、统计计数动效。时间轴使用真实 editTime，明确不是发布时间。
- 正常 npm install 已写入 package.json 和 package-lock.json。

## 验证证据

- 最新 npm run build：退出码 0，页面编译、类型检查与静态生成成功。
- 浏览器本地预览：http://127.0.0.1:3102 。首页截图检查通过；从流程导航点击 /fill 后可见真实空状态。
- git check-ignore -v .env.local：命中 .gitignore。
- 未触发生成接口消耗知乎额度。尚未执行有数据情况下的全部交互、移动断点、减少动态效果真机与线上闭环验证。

## 未完成，不能标成已验收

- 全站 inline style 清理、全站主操作唯一性检查、长页面侧栏/锚点与滚动进度。
- 按页 marquee、about 阅读填充、磁吸按钮与指针边框光晕、完整微交互编排。
- 官方 GIF 转 WebP/AVIF、三视图校准和素材许可归档。
- 前进/后退滚动恢复及抽屉前进/后退完整验证。
- 图表指标的产品验收；当前雷达是证据覆盖，并非虚构的人格能力评分。
- 构建时 npm 提示 2 high / 1 critical 依赖漏洞，尚未完成定向审计与修复。
- 六阶段提交、PR、CI、部署与线上 /api/health 验收。

## 协作阻塞

开始时成功创建并切到 feat/frontend-v2；结束检查时 HEAD 已变为 feat/public-figure-skills。
同时 lib/server、lib/domain 等出现其他会话的新修改。这说明共享工作目录仍有并发写入。
本轮没有 commit/push，避免混入另一会话的工作。后续必须先建立独立 worktree 并迁移经核对的前端改动，再继续提交。

## Skill 应用

- ui-ux-pro-max：实际查询 keyboard focus modal，应用可见焦点、焦点不被覆盖与触控尺寸建议。
- silk-design：统一 reveal、字体/token 基础、Lenis、标题与页面过渡的实现依据。
- genjutsu framer-motion / motion-principles：保留 motion/react，使用项目弹簧参数与降级原则；未修改看山状态集。
- 未制作视频、未生成外部付费素材。
