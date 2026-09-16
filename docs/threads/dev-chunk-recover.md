# 线程：dev-chunk-recover（部署后旧 chunk 自愈）

- **工作区**：`E:\codex\heikesong3\.tools\b2doc\msrc8`（main 源码包 + 待验改动）
- **分支**：`fix/chunk-reload-recovery` @ 基线 `b65f2bd0`（main tip）
- **正在改**：
  - `lib/domain/chunk-reload.ts`（新增：资产过期的识别与「只自动重载一次」的防死循环，纯函数）
  - `app/error.tsx`（主战场：捕获 `ChunkLoadError` → 自动重载 + 说人话）
  - `app/global-error.tsx`（新增：**最后防线**，兜 `error.tsx` 自身加载不出的情况）
  - `lib/hooks/useSquareLibrary.ts`（第二道防线：加载超时，防永久「正在铺开广场…」）
  - `scripts/check-square-crowd.mjs`（§⑪ 守卫，10 条）
- **状态**：进行中（已提 PR）
- **最后更新**：2026-09-16 16:55
- **对应台账**：`docs/backlog.md` 的 **D1**（部署打断在途会话）

## 与 #81（`fix/atomic-deploy`）的关系：互补，不重复

**#81 修的是「服务端窗口」，我修的是「用户手里的旧页面」。** 两者互不覆盖：

- #81：把「先删后建」改成「构建到 `.next.new` 再原子 mv」→ 消除了**切换瞬间**的窗口
  （实测窗口内不可达占比 46.5% → 0%）。**但它消除不了已经发出去的旧 HTML** ——
  原子切换之后，那批旧 chunk 文件**依然被删掉了**，而线上实测：
  - HTML：`Cache-Control: s-maxage=31536000, stale-while-revalidate`
  - chunk：`Cache-Control: public, max-age=31536000, immutable`

  所以**部署前打开、部署后仍开着的标签页**，手里那份清单一定会指向已不存在的文件。
- 本线程：#81 管不到的那一半 —— 让用户在遇到时看到真话并能一键恢复。

我**没有碰** `next.config.js` / `ci.yml` / `package.json` / `scripts/deploy-*`
（全属 #81），零文件重叠。

## 取证：这个 bug 的真实形态（推翻了我自己的第一版假设）

### 第一版判断错了

我最初把修复放在 `app/global-error.tsx`，理由是「`error.tsx` 自己也是 chunk，可能一起挂」。
**实测证明不是**：从磁盘删掉一个页面级 chunk 后重新打开页面：

| 观测 | 结果 |
|---|---|
| 资源层（捕获阶段 `error` 监听） | `SCRIPT: /_next/static/chunks/app/(explore)/personas/page-*.js` |
| 运行时 | `Uncaught ChunkLoadError: Loading chunk 36 failed`（5 条） |
| **谁捕获的** | **`app/error.tsx`** —— 页面显示「这一步出了点问题」 |
| `global-error.tsx` | **根本没触发** |

所以主战场是 `error.tsx`，`global-error.tsx` 退居最后防线。
**我把这个更正写进了两个文件的注释里**，免得后人再按我错的那一版理解。

### 真正的问题不是「没兜住」，而是「兜住的姿势错了」

`error.tsx` 原本的文案是「这一步出了点问题……**可以重试**」——
而 `reset()` 只是重新渲染，**不会重新下载那个已被部署删掉的 chunk**，用户点几次都一样。

还有一种更糟的时序：页面停在 `app/loading.tsx`（「正在准备内容」）或
`SquareField` 的「正在铺开广场…」，**错误界面始终不出现**，用户看到的是**永久转圈**。

## 修法

判据抽到 `lib/domain/chunk-reload.ts`（纯函数，无 React/DOM），两条路径分开：

```
命中「资产过期」（ChunkLoadError / Loading chunk N failed / 动态 import 失败）
  → 自动 reload 一次（sessionStorage 记时间戳，60 秒内只允许一次 → 防死循环）
  → 文案说明「页面在加载时更新过了」+「你的数据没有丢」+ 手动刷新按钮
其他错误
  → 保留原来的 reset()「重试」（它真的可能管用）
```

`global-error.tsx` 刻意用**原生 `<a href="/">`** 而非 `next/link`：
这一层要在「客户端路由已坏」的假设下工作。

## 怎么验证的

### 1. 真机实测：修复前 vs 修复后（从磁盘删掉真实 chunk）

| | 修复前 | 修复后 |
|---|---|---|
| 用户看到 | 「这一步出了点问题 / 重试」 | **「页面需要刷新 / 这个页面在加载时更新过了」** |
| 成因说明 | 无 | 「我们刚发布了一次更新……」 |
| 数据安抚 | 无 | **「你的数据没有丢」** |
| 行动 | 「重试」（点了没用） | 自动重载过 + 「刷新页面」 |
| 防死循环 | — | 标记已写入（`1789548646335`） |
| 主框架导航次数 | 1 | **4**（自动重载确实被触发） |

### 2. 守卫 §⑪ 10 条，且**发现并修掉了一个假守卫**

第一版判据我写成 `/LOAD_TIMEOUT_MS/.test(hookSrc)` —— 反向验证时把常量改名成
`LOAD_TIMEOUT_MS_REMOVED`（**包含**原串）竟然照样通过 → **恒真的假守卫**。
第二版改成「常量 + setTimeout + 回调切 error」三条文本断言，改名那条仍会漏
（使用处还留着字面量）。第三版改成**抓定时器回调体、看它是否既读 `loading` 又写 `error`**。

反向验证（两次都被精确拦到对应那条）：

```
删掉回调里的 error 分支 → ✗ 超时回调没有检查 loading 状态
删掉常量的声明行        → ✗ useSquareLibrary 没有超时常量
还原                    → 全部通过（0 处问题）
```

### 3. 静态检查

`tsc --noEmit` rc=0｜`npm run check:logic` **143 项全过**（含 §⑪ 10 条）｜`next build` EXIT 0

## 与其它线程的关系

- **#77**（`square-ui`）：它改 `components/square/*` / `lib/domain/{crowd,light,square-layout}.ts`，
  我改 `lib/hooks/useSquareLibrary.ts` —— **不同文件，零重叠**（同属广场功能但边界清楚）。
- **#78**（`persona-page-metadata`）：改 `app/(explore)/personas/*` + `package.json`，零重叠。
- **#81**（`atomic-deploy`）：见上，零文件重叠。
- **#77 / #81 / #78 / #79 均已合并**。本分支因此**基于合并后的 main（`b65f2bd0`）重做**：
  我第一次推送时的基线是 `132223e5`，期间 main 走了 8 个提交，其中
  `scripts/check-square-crowd.mjs` 已被 #79 改成含 §⑩ 的版本 ——
  我**没有沿用旧版覆盖**，而是把改动重做到新版上，节号顺延为 **§⑪**（不与 ⑩ 撞号）。

## 未决（需审计线程 / owner 决定）

本线程只解决「用户遇到时怎么办」。**另一种更彻底的思路**是把旧 chunk 留一段时间
（部署时保留上一代 `static/chunks`，例如保留 2 代后再清理）—— 那样根本不会有 404。
但那属部署流程（#81 的边界），**我不动**，只在此记录这个选项。
