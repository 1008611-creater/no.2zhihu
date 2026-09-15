# 上线线程提示词 —— PR5+（问题 6 / 7）

> 复制下面整段给负责上线的线程即可。

---

## 给上线线程的提示词（直接复制）

```
请把分支 feat-handoff-to-mesh-and-voice-v2 合入 main 并部署到线上，并做验收。

【背景】
- 仓库：https://github.com/1008611-creater/no.2zhihu
- 线上：https://zhihu.cauai.fun
- 服务器：114.134.185.16（fleet 别名 ans-portal），root，密钥 C:\Users\lsb\.ssh\ans_portal_ed25519
- 部署形态：代码 /opt/no2zhihu（运行用户 no2zhihu）→ systemd no2zhihu.service → Node :3000 → nginx sites-available/no2zhihu
- 该机器是多站点共用机，同机还有 ans.cauai.fun / sub2api / omniroute，动 nginx 与 systemd 时不要波及其他站。

【本次改动（25 文件，+822/−166）】
两个问题：
1. 问题 6「把我的分身搬回知乎」入口错位 —— 从 /mirror 工作台末尾迁到 /mesh 我的 Mesh，
   并升级为跨全部历史问题的一键发布清单。/mirror 只留一条跳转链接。
2. 问题 7 文风像 GPT 直答 —— 给 16 位答主补齐「语言指纹」四字段（opening / punctuation /
   avoid / exemplars），在 system prompt + user prompt 末尾 + 辩论 prompt 三处钉住，
   加末尾套话剥离兜底，加运行时守卫防回归。

【Git 操作】
- 分支：feat-handoff-to-mesh-and-voice-v2
- 基线：fd2667b（含另一线程的 auth 修复 + 首屏去黑话）
- 该分支**不含** lib/zhihu/oauth.ts 与 app/api/auth/callback/route.ts 的改动（那是另一线程的），
  合并时不要误带。
- 注意：本机 WorkBuddy 沙箱下 `git checkout -b` 带斜杠的分支名会静默失败（refs 目录写不进），
  已用扁平名 feat-handoff-to-mesh-and-voice-v2。若你那边分支不存在，说明 push 未成功。

【部署前必须做的三件事】
1. 先查服务器 HEAD 是否领先 origin/main：
   cd /opt/no2zhihu && git log --oneline -5
   git merge-base --is-ancestor origin/main HEAD && echo SAFE || echo "⚠️ 服务器领先远端，先存档！"
   （该工作区是多会话共用，直接 reset --hard 会打掉别人未 push 的提交）
2. 查工作区是否干净：git status --porcelain
   有未跟踪新文件要先搞清楚是谁的（Next 构建会打包工作区文件，不管有没有提交）。
3. root 操作 /opt/no2zhihu 前先：
   git config --global --add safe.directory /opt/no2zhihu
   （否则任何 git 命令报 dubious ownership）

【部署步骤】
1. 服务器拉取并切到该分支（或合并到 main 后拉 main）：
   su - no2zhihu -s /bin/bash -c 'cd /opt/no2zhihu && git fetch origin && git checkout <分支/commit>'
2. 安装依赖（如有变动）：npm ci
3. 构建：
   su - no2zhihu -s /bin/bash -c 'cd /opt/no2zhihu && npm run build'
   若报 EACCES .next/trace：
   - 先 ps aux | grep 'next build'，有并发构建 → 停手等对方，别抢；
   - 无并发但 .next 属主是 root → 备份后 rm -rf .next 再 chown -R no2zhihu:no2zhihu /opt/no2zhihu，
     然后重建。rm 后不要先 mkdir .next。
4. 重启：systemctl restart no2zhihu
5. 确认：systemctl status no2zhihu；curl -sS -o /dev/null -w '%{http_code}' https://zhihu.cauai.fun/

【验收判据】
A. 问题 6（信息架构）
   1. /mirror 工作台页面**底部不再有**搬运面板；只有一条「去我的 Mesh 一键搬回知乎 →」跳转链接。
   2. /mesh 页面统计区出现「N 篇分身回答还没搬回知乎 → 去一键发布」锚点卡片，点击跳到 #handoff-mine。
   3. /mesh 的搬运清单里，每个跑过的问题各一张卡，标注状态 / 篇数 / 字数 / 来源归属数 / 答主名。
   4. 三个动作可用：只复制正文 / 一键发布（复制并打开知乎问题页）/ 我已在知乎发布。
   5. 手输的问题（没有知乎链接）只复制正文，并有如实说明，不猜地址。
   6. 空态（history 为空）也要能看到面板，因为可能已攒了上一批问题的回答。

B. 问题 7（文风）
   1. 打开 /personas/<handle>（任一答主），能看到三个新区块：
      「语言指纹」（开头习惯 / 标点与分段）、「语感范例」、「他不会写的句子」。
   2. 抽查 3 位答主生成同一问题的回答，肉眼核对：
      - 开头第一句是否各不一样、符合该答主的 opening；
      - 段落数与长度是否符合该答主的 punctuation 描述；
      - 结尾**没有**「总之 / 综上 / 希望以上… / 以上就是我… / 仅供参考」这类套话。
   3. 辩论模式：双方语气、句长、标点应明显不同，且不出现「我理解你的观点，但是…」礼貌辩论腔。

C. 铁律自检（AGENTS.md §1）
   1. 无凭证泄漏：在服务器上
      grep -rl 'ZHIHU_ACCESS_SECRET\|Bearer ' /opt/no2zhihu/.next/static
      应为 0 命中（.next/server 与 webpack cache 命中属合法服务端，不算违规）。
   2. .env.local 仍被忽略：git check-ignore -v .env.local 必须有输出。
   3. 额度没被滥用：新代码没有新增轮询或循环内调用，缓存 TTL 未改动。

D. 浏览器实测
   注意：标了 ○ (Static) 的页面（/ /mirror /square /mesh）curl 只返回 shell，
   交互内容全在客户端 JS 里。curl 不到某段文案属正常，**不要**据此判定回退。
   正确验法：用浏览器真机打开，或按关键词查编译产物：
   cd /opt/no2zhihu/.next && grep -rl '<文案>' server static

【风险与回滚】
- 本次**不改** nginx、不改 systemd unit、不改 .env.local，纯前端与提示词改动，风险低。
- 回滚：git checkout 回上一版 commit → npm run build → systemctl restart no2zhihu
  已存在的回滚资产：/opt/no2zhihu-next-prev（上次构建产物）、/root/no2zhihu-rollback-commit.txt
- 部署前建议再备一次：cp -r /opt/no2zhihu /root/no2zhihu-backup-$(date +%Y%m%d-%H%M%S)

【完成后回报】
- 线上 URL 与 HTTP 状态码
- A/B/C 三组验收的实际结果（哪几条通过、哪几条不通过及现象）
- 若未通过，给出复现步骤与截图
```

---

## 附：本 PR 的技术摘要（给上线线程参考，不必复制）

### 问题 6 文件级改动

| 文件 | 改动 |
|---|---|
| `app/(flow)/mirror/page.tsx` | 删除 `MineHandoffPanel` 的 import 与使用；底部链接改为「去我的 Mesh 一键搬回知乎 →」 |
| `components/mesh/MineHandoffPanel.tsx` | 全量重写：单场面板 → 跨全部历史问题的一键发布清单 |
| `lib/store/mirror-store.tsx` | 新增 `markHandoffOpenedFor(id, url)` / `confirmHandoffFor(id)` / `commitById()` |
| `components/mirror/HandoffPanel.tsx` | 改用 id 版方法 |
| `app/(explore)/mesh/page.tsx` | 挂载 `MineHandoffPanel history={history}`（有数据态 + 空态）；新增 `pendingHandoff` 统计与 `#handoff-mine` 锚点卡 |

### 问题 7 文件级改动

| 文件 | 改动 |
|---|---|
| `lib/domain/types.ts` | `PersonaVoice` 新增 `opening` / `punctuation` / `avoid` / `exemplars` |
| `lib/domain/personas/*.ts`（16 位） | 全部补齐四字段（每位 avoid 4 条、exemplars 3 条） |
| `lib/domain/personas/index.ts` | 新增 `VOICE_FINGERPRINT_FIELDS` + `missingVoiceFingerprint()`，模块加载自检 |
| `lib/server/mirror.ts` | 提示词三处强化 + `CLOSING_PATTERNS` / `stripClosing` 兜底 + `debateVoiceLine` |
| `app/(explore)/personas/[handle]/page.tsx` | 新增「语言指纹」「语感范例」「他不会写的句子」三区块 |

### 本地已验证

- `tsc --noEmit` → 0 errors
- `next build` → 需上线线程复核（本地构建日志见构建产出）
- 16/16 答主指纹完整（`total missing: 0`）
- 客户端产物凭证扫描 0 命中
