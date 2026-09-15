# 上线提示词 —— 两条主线重构（提问 / 分身发现）

> 面向**上线线程**。本文件由改动作者（`feat/discover-split-two-tracks`）编写，
> 只描述「上线这件事本身」需要知道的东西：合并顺序、冲突处理、部署步骤、验收判据、回滚。
> 不需要通读代码。

---

## 0. 一句话

把「分身发现」从提问流程里摘出来做成独立的 `/discover` Tab，提问流程收敛为
`/` → `/mirror` →（子页面）`/fill`，并顺手修掉两个 404 断链。**只动前端路由与组件，
不涉及接口、环境变量、额度、nginx。**

---

## 1. 变更清单

### 新增
| 路径 | 说明 |
|---|---|
| `app/(explore)/discover/page.tsx` | 「分身发现」Tab 页面（静态预渲染） |
| `components/discover/PersonaRoster.tsx` | 答主名册 + 四要素说明 + 公共人物（自 `/mirror` 迁出） |
| `components/ui/Breadcrumb.tsx` | 探索区面包屑，按路由给出当前区名 |
| `docs/deploy-prompt-flow-split.md` | 本文件 |

### 修改
| 路径 | 改了什么 |
|---|---|
| `app/(flow)/mirror/page.tsx` | 删掉顶部的 `DiscoverSection`；空态改为「去提问 / 去分身发现」两条出口 |
| `app/(flow)/page.tsx` | 首页只留提问主线：移除与 `/square` 重复的广场信息流，换成「两条主线」说明 + 争议题快填 |
| `app/(flow)/fill/page.tsx` | 明确标注为提问流程子页面（顶部回程链接）；`/feed` 断链改指 `/square` |
| `app/(explore)/personas/[handle]/page.tsx` | 3 处 `/personas` 断链改指 `/discover` |
| `app/(explore)/layout.tsx` | 面包屑换成随路由变化的 `Breadcrumb` |
| `components/ui/TopBar.tsx` | 主导航改为「提问 / 分身发现 / 虚拟广场 / 我的 Mesh」，`/mirror` `/fill` `/answer` 高亮归到「提问」 |
| `components/ui/JourneyNav.tsx` | 流程条只保留 `01 提问 → 02 查看回答`；「真人补充」降为 `↳` 子级面包屑 |
| `components/square/FeedStream.tsx` | 仅注释同步（这条流现在只服务 `/square`） |
| `app/sitemap.ts` | 去掉不存在的 `/feed` `/about`，加入 `/discover` |
| `scripts/build-library.mjs` | 仅注释同步 |

### 路由结果

```
提问主线   /  →  /mirror  →  /fill（子页面）  →  /answer/[id]（子页面）
发现主线   /discover  →  /personas/[handle]  →（带他去提问）→ /
支撑       /square（虚拟广场）   /mesh（我的 Mesh）
```

---

## 2. 合并顺序与冲突处理（**先看这节**）

### 2.0 ⚠️ 先做一次取舍：本 PR 与 #9 目标重叠，**只能合一个**

仓库里还有 **#9 `feat-ia-flow-split`**（另一条线），做的是**同一件事**：拆分「分身发现」、
把「真人补充」降为子页面、修 `/personas` 与 `/feed` 两个 404。两个 PR 改同一批文件
（`mirror/page.tsx`、`fill/page.tsx`、`page.tsx`、`FeedStream.tsx`、`JourneyNav.tsx`、
`TopBar.tsx`、`build-library.mjs`），**不能都合**。

| | 本 PR（#12） | PR #9 |
|---|---|---|
| 规模 | 14 文件 +618/−208 | 18 文件 +1226/−749 |
| 状态 | **CLEAN**，CI `build` 已通过 | **CONFLICTING**，需先解冲突 |
| 范围 | 只做被要求的那件事 | 额外加 `/me` tab、广场筛选、语料 Mesh、FeedStream 单入口 |
| 分身发现路由 | `/discover` | `/personas` |
| 我的 Mesh | 保留 `/mesh` 原样 | `/mesh` → 重定向到 `/me?tab=mesh` |

**上线线程请先确认采用哪一个再动手**：

- 采用 **#9** → 关闭本 PR，按 #9 自己的说明上线（需先 rebase 解决冲突）。
- 采用 **本 PR** → 按下面 2.1 / 2.2 走；#9 的额外能力建议作为后续独立 PR 重做。
- 若最终决定用 `/personas` 这个路由名而不是 `/discover`，本 PR 只需改 1 个目录名
  + 3 处链接 + TopBar/面包屑各 1 处，改动量极小。

### 2.1 合并顺序（采用本 PR 时）

1. **先合 PR #7**（`feat/remove-persona-disclaimers`，「人格卡片移除自我否定标签」）。
   它 base 落后于当前 main，需要先 `git rebase origin/main` 再合。
2. **再合本 PR**（`feat/discover-split-two-tracks`）。

> 本 PR 的分支已与 main 同步（branch protection 的 `strict: true` 要求），
> CI `build` 已通过，PR 页面显示 **CLEAN**。

### 2.2 若 PR #7 先合，本 PR 只需处理 1 个冲突

- **`app/(flow)/mirror/page.tsx`** —— PR #7 改的那 11 行在 `DiscoverSection` 内部，
  而本 PR 把整个 `DiscoverSection` 迁到了 `components/discover/PersonaRoster.tsx`。
  **解决方式：以本 PR 为准**（保留删除）。PR #7 的意图（未抓取语料时不显示任何依据标签）
  已经在新文件里用 `{p.corpus.real && ...}` 实现，不会回退。
- `app/(explore)/personas/[handle]/page.tsx`：两边改的是不同区域（PR #7 改 302–304 行的
  来源 chip，本 PR 改 40/76/357 行的 href），**正常情况下自动合并，无冲突**。

### 若本 PR 先合

PR #7 需要 rebase；冲突同样只有上面那一个文件，同样以「保留删除」解决。

### 与已合并的 PR #8（动效 token）的关系

本 PR 已基于含 PR #8 的 main（`38db18c`）开发，新组件直接使用 `DUR` / `EASE` / `SHIFT`
（`lib/motion/tokens.ts`），不存在动效 token 的二次改造。

---

## 3. 部署步骤

站点形态（不变）：`/opt/no2zhihu`（用户 `no2zhihu`）→ `no2zhihu.service` → Node `:3000`
→ nginx `sites-available/no2zhihu` → Let's Encrypt。**同机还有 ans.cauai.fun / sub2api /
omniroute，不要动它们的 nginx 与 systemd。**

```bash
# 0) 先确认没有别人正在构建（有输出就等对方跑完，别抢）
ps aux | grep 'next build' | grep -v grep

# 1) 拉最新 main（本 PR 合入后）
cd /opt/no2zhihu
git config --global --add safe.directory /opt/no2zhihu   # 否则 dubious ownership
git fetch origin && git status --short                   # 工作区不干净先问清楚再动
git log --oneline -1 origin/main

# 2) 确认 HEAD 没有领先 origin/main（本机有别人的未提交改动时别 reset）
git merge-base --is-ancestor origin/main HEAD && echo SAFE || echo '!! 先存档再动'

git reset --hard origin/main

# 3) 构建（必须用 no2zhihu 身份，sudo -u 会带回 root 属主）
su - no2zhihu -s /bin/bash -c 'cd /opt/no2zhihu && npm run build'
# 判成败看输出里的 `✓ Compiled successfully`，别只看 exit code

# 4) 重启
systemctl restart no2zhihu
systemctl is-active no2zhihu && systemctl show no2zhihu -p NRestarts
```

若 `.next` 报 `EACCES`：
- `ps aux | grep 'next build'` 有输出 → **有并发构建，停手等对方**，它 exit 0 后只需 `systemctl restart no2zhihu`；
- 无并发但 `ls -ld .next` 属主是 `root root` → `cp -a .next .next.bak` → `rm -rf .next` →
  `chown -R no2zhihu:no2zhihu /opt/no2zhihu` → 重新 build（**rm 之后不要先 mkdir**）。

---

## 4. 验收判据（逐条打勾）

### 4.1 路由可达（`curl -o /dev/null -w '%{http_code}'`）

| 路径 | 期望 |
|---|---|
| `/` | 200 |
| `/discover` | **200（新增）** |
| `/mirror` | 200 |
| `/fill` | 200 |
| `/square` | 200 |
| `/mesh` | 200 |
| `/personas/da-meng` | 200 |
| `/personas` | **404（本来就该 404，已无任何内部链接指向）** |
| `/feed` | **404（同上）** |
| `/sitemap.xml` | 200，且含 `/discover`、**不含** `/feed` `/about` |

### 4.2 产物级验证（客户端文案不在 HTML 里，**别用 curl | grep 文案**）

```bash
cd /opt/no2zhihu/.next
# 名册已迁出 /mirror
grep -rl '这里住着' server static      # 命中应全部在 discover 相关文件里，mirror 相关 0 条
grep -rl '每个人格都拆成这四件事' server static
# 新路由存在
ls server/app/discover.html server/app/discover.rsc
# 首页已不再铺广场流
grep -rl '这座虚拟知乎里已经讨论过的事' server static   # 应 0 命中
```

### 4.3 人工点检（浏览器，建议手机宽度也看一遍）

1. 顶部导航是 **提问 / 分身发现 / 虚拟广场 / 我的 Mesh** 四项；
   在 `/mirror`、`/fill`、`/answer/xxx` 上「提问」保持高亮，在 `/personas/xxx` 上「分身发现」保持高亮。
2. `/` 只有提问主线：hero + 输入框 + 「两条主线」两张卡片 + 争议题快填；
   **不再有整条广场信息流**。
3. 首页提一个问题 → 选答主 → 自动跳 `/mirror#answers`；
   `/mirror` 顶部**不再出现全量答主名册**。
4. 直接打开 `/mirror`（无本场会话）→ 空态是「去提一个问题 / 先看看有哪些分身」两条出口。
5. 进 `/fill` → 顶部有「← 回本场回答」，流程条显示 `01 提问  02 查看回答  ↳ 真人补充`。
6. `/discover` → 名册可点进档案；档案页按钮是「回分身发现 / 看看别的分身」，**不再 404**。
7. `/fill` 提交成功页第三个按钮是「虚拟广场」，**不再是 404 的「分身动态」**。

---

## 5. 回滚

```bash
# 回滚代码
cd /opt/no2zhihu && git reset --hard <上一个 main sha> && su - no2zhihu -s /bin/bash -c 'cd /opt/no2zhihu && npm run build' && systemctl restart no2zhihu
# 或直接用既有回滚资产
ls /opt/no2zhihu-next-prev /root/no2zhihu-rollback-commit.txt
```

本 PR **没有数据迁移、没有环境变量变更、没有接口契约变更**，回滚只需回代码 + 重启。
本地会话数据在浏览器 `localStorage`，不受影响。

---

## 6. 注意事项

- **不需要**改 nginx、不需要新证书、不需要加环境变量：`/discover` 是同一进程内的新路由。
- **不消耗知乎额度**：没有任何新增上游调用。
- 部署完**不要清理服务器工作区**：那里可能有别的会话正在写的未提交改动。
- 本 PR 的 `docs/` 目录在本机工作区显示为「已删除」——那是**另一条线在途的删除操作**，
  与本 PR 无关；本 PR 只新增 `docs/deploy-prompt-flow-split.md`，不还原、不动其它 docs 文件。
- **`node scripts/verify-merge.mjs` 会报 2 处禁用词命中**（`依据公开资料撰写`、`语料待补充`
  出现在 `.next/server/chunks/651.js` 与 `.next/static/chunks/502-*.js`）。这是**合并前就存在**的：
  字符串来自 `lib/domain/personas/index.ts` 的 `corpusLabel()`，以及
  `app/(explore)/personas/[handle]/page.tsx` 直接渲染它。**本 PR 没有新增任何渲染路径** ——
  新迁出的名册用 `{p.corpus.real && ...}` 守卫，未抓取语料时整块不渲染。
  这 2 处由 **PR #7** 修掉（`corpusLabel()` 改为未抓取时返回空串），与本 PR 不冲突。
- 本 PR 的分支与 main 同步、CI 绿。若合并前 main 又有新提交，用 PR 页面的
  **「Update branch」** 即可（本机沙箱写不了 git refs，本地 rebase 不可靠，见
  `docs/collaboration.md` §八）。
