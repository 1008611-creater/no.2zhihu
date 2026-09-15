# 上线部署提示词 · PR #8 动效 token 体系 + 品牌标识动效

> **这份文档是给「唯一上线线程」的操作指令。** 直接整份复制给它即可。
> 产出线程（motion）**没有、也不会**碰线上服务器。

---

## 0. 一句话

把 `feat/motion-design-system` 合进 `main` 并部署。
**改动是纯增量 + 等价替换，0 删除文件**，但涉及 27 个文件与一次全站构建。

---

## 1. 目标与来源

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/1008611-creater/no.2zhihu` |
| **PR** | **#8** — https://github.com/1008611-creater/no.2zhihu/pull/8 |
| 分支 | `feat/motion-design-system` |
| **提交** | `047dcce892e8237660f35a86382e9d57f57e2549` |
| 父提交（= 当次 `main`） | `078ff57` |
| 规模 | 27 文件，**+865 / −76**，**0 删除** |
| 合并性 | `MERGEABLE`（GitHub 判定可自动合并） |

**已验证**：父提交恰好等于当时的 `origin/main`，因此**无需 rebase**。
若合并时 `main` 已前进，见 §6。

---

## 2. 这个 PR 做了什么（给验收做参照）

1. **动效 token 体系** —— 把 16 种硬编码时长 / 4 条重复缓动曲线 / 3 套打架的 spring 参数，
   收敛为 `lib/motion/tokens.ts`（JS）+ `app/globals.css :root`（CSS）**双份对齐的唯一来源**。
2. **品牌标识「分身分离」动效** —— 新组件 `components/ui/LogoMark.tsx`，
   顶栏 logo 在两个侧影间做出「分身离开本体再归位」的动作。
3. **两个真 bug 修复** —— 顶栏「影子知乎」与「Agent」文字粘连；LogoMark 图层错位。

---

## 3. 新增文件（6 个，必须随代码一起上线）

```
components/ui/LogoMark.tsx          动效 logo 组件
public/logo-layers/shadow.png       分身（蓝）图层 5.6KB
public/logo-layers/human.png        真人（黑）图层 5.5KB
public/logo-layers/meta.json        裁切框记录（渲染层坐标依据）
scripts/split-logo-layers.py        拆层脚本（构建时不需要，仅留档）
scripts/unify-motion.py             参数收敛脚本（一次性，留档）
```

> ⚠️ **`public/logo-layers/` 三个文件缺一不可。**
> 缺了 `*.png` 顶栏 logo 会变成空框；缺了 `meta.json` 不影响运行但会丢失坐标依据。
> 这三个文件是**二进制 + JSON**，用 `git checkout` 或正常合并都会带过去，
> **但如果用 patch / 手工拷贝的方式上线，务必单独确认它们落地了。**

---

## 4. 部署步骤

### 4.1 前置：先确认没有并发构建（本仓库的惯例铁律）

```bash
# 服务器上有别的会话正在构建的话，会抢同一个 .next 目录并报 EACCES
ps aux | grep 'next build' | grep -v grep
```
**有输出 → 停手等对方结束**，不要抢。对方构建的就是同一工作区。

```bash
cd /opt/no2zhihu
git config --global --add safe.directory /opt/no2zhihu   # 不加会报 dubious ownership
git status --porcelain                                   # 有未提交改动先搞清楚是谁的
```

### 4.2 合并 PR 并部署

```bash
cd /opt/no2zhihu

# 存档回滚资产（强烈建议，上次的坑就是这么兜住的）
cp -r .next /opt/no2zhihu-next-prev 2>/dev/null || true
git rev-parse HEAD > /root/no2zhihu-rollback-commit.txt
git log --oneline -1

# 拉到目标提交
git fetch origin
git reset --hard 047dcce892e8237660f35a86382e9d57f57e2549
# 注：若已把 PR 合进 main，则改为 git reset --hard origin/main

# 依赖
npm ci     # 本 PR 未改 package.json，通常可跳过；但若 package-lock 有差异则必须跑
```

### 4.3 构建

> ⚠️ **构建前必须 `chown`，且不要在 `chown` 前 `mkdir .next`**（会让目录归 root，之后必报 EACCES）。

```bash
rm -rf /opt/no2zhihu/.next
chown -R no2zhihu:no2zhihu /opt/no2zhihu

su - no2zhihu -s /bin/bash -c 'cd /opt/no2zhihu && npm run build'
echo "BUILD_EXIT=$?"
```

`BUILD_EXIT=0` 才继续。**若非 0，停下回滚，别硬上。**

### 4.4 起服务

```bash
systemctl restart no2zhihu
systemctl status no2zhihu --no-pager | head -12
```

---

## 5. 验收清单

### 5.1 路由与资源（必须全 200）

```bash
for p in / /mirror /mesh /square /fill; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://zhihu.cauai.fun$p"
done

for f in /logo.png /logo-layers/shadow.png /logo-layers/human.png /icon.svg /apple-icon.png; do
  echo -n "$f -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://zhihu.cauai.fun$f"
done
```

**`/logo-layers/*` 两个 PNG 必须 200。** 这是本次新增资源，404 说明新增文件没上线。

### 5.2 文案验证不要用 curl（重要，能省一次无效排查）

`/` `/mirror` `/square` `/mesh` 都是 `○ (Static)` 页面，**HTML 里只有 shell**，
交互内容全在客户端 JS 里。`curl | grep 文案` 返回 0 命中**属正常**，不代表没生效。

**正确验法**（在服务器上查编译产物）：

```bash
cd /opt/no2zhihu/.next
grep -rl 'brand-text\|logo-layers' server static | head -10
```

### 5.3 浏览器人工确认（3 分钟）

打开 https://zhihu.cauai.fun ：

- [ ] **顶栏 logo 是双侧影形象**（黑头 + 蓝头 + 中间白色圆洞），不是渐变色块
- [ ] **顶栏文字分两行**：「影子知乎」在上、「Agent 可调用的人类知识网络」在下，**不粘连**
- [ ] **鼠标悬停顶栏品牌区** → logo 的蓝头**向侧后方分离**、白色圆洞张开，整块轻微放大
- [ ] 移开鼠标 → 归位（弹簧手感，不是线性）
- [ ] 键盘 `Tab` 到 logo 链接 → 同样触发分离（`:focus-within`）
- [ ] **系统开启「减少动态效果」后刷新** → logo 变成完全静止的静态图，无任何动画
- [ ] **手机宽度（<720px）** → 副标题自动隐藏，只剩「影子知乎」，汉堡菜单正常
- [ ] 其余 4 个页面（`/mirror` `/mesh` `/square` `/fill`）无白屏、无样式错乱

### 5.4 敏感项复查

```bash
cd /opt/no2zhihu
git check-ignore -v .env.local        # 必须有输出（.env.local 仍被忽略）
rg "ZHIHU_ACCESS_SECRET|Bearer " --glob '!node_modules' -l | head
# 命中位置应仅限 lib/zhihu/*、scripts/*、docs/* 等合法服务端位置
```

---

## 6. 并发注意事项（本仓库特有，务必读）

> **`/opt/no2zhihu` 是多个会话共用的工作区。**

1. **合并前先看 `main` 是否已前进**
   ```bash
   git fetch origin && git log --oneline -1 origin/main
   ```
   若 `origin/main` 已不是 `078ff57`：
   - 本 PR 的 `MERGEABLE` 是相对旧基线算的，**需要重新确认**；
   - 用 `git merge-base --is-ancestor 078ff57 origin/main` 确认父提交仍在主干上；
   - 重叠的 5 个文件（`app/globals.css`、`app/(flow)/page.tsx`、`app/(flow)/mirror/page.tsx`、
     `app/(explore)/mesh/page.tsx`、`docs/design-system.md`）要重点看冲突。

2. **构建前确认工作区干净** —— Next 构建会打包工作区里的**未提交**文件。
   若 `git status --porcelain` 有别人正在写的代码，先确认是否该一起上线。

3. **不要清理服务器工作区** —— 同一工作区可能有别人未提交的改动。

4. **合并后必跑删除检查**
   ```bash
   git diff --diff-filter=D --name-only origin/main HEAD
   ```
   **输出必须是空。** 本 PR 声明 0 删除；若出现删除，说明合并基不对，**停下排查**。

---

## 7. 回滚

```bash
cd /opt/no2zhihu
git reset --hard "$(cat /root/no2zhihu-rollback-commit.txt)"
rm -rf .next && mv /opt/no2zhihu-next-prev .next   # 恢复上次构建产物
chown -R no2zhihu:no2zhihu /opt/no2zhihu
systemctl restart no2zhihu
```

**回滚判据**：任一页面白屏 / 顶栏 logo 变空框 / 构建非 0 退出 / 其他线程反馈功能被回退。

---

## 8. 如果出问题

| 症状 | 真因 | 处置 |
|---|---|---|
| `EACCES ... .next/trace` | ①有并发构建 ②`.next` 属主是 root | ①`ps aux \| grep 'next build'` 有输出就停手等 ②`rm -rf .next` → `chown -R` → 重 build（**rm 后别先 mkdir**）|
| 顶栏 logo 是空框 | `public/logo-layers/*.png` 没上线 | 确认两个 PNG 在服务器上存在且 HTTP 200 |
| logo 两层错位 / 交叠圆散开 | 图层用了非原生坐标系 | 确认 `LogoMark.tsx` 是 `viewBox="0 0 785 695"` + 图层 `x="0" y="0"` |
| `fatal: detected dubious ownership` | root 操作仓库 | `git config --global --add safe.directory /opt/no2zhihu` |
| 构建报类型错误 | 与别人改动真实冲突 | **停下**，把错误贴回给 motion 线程，不要自行改代码 |

---

## 9. 一句话交付

> 合并 PR #8（`feat/motion-design-system` @ `047dcce`）到 `main`，按 §4 构建部署，
> 按 §5 验收，重点确认 `/logo-layers/*` 两个 PNG 上线且顶栏 logo 是双侧影形象。
> **合并前后各跑一次 `git diff --diff-filter=D --name-only origin/main HEAD`，输出必须为空。**
