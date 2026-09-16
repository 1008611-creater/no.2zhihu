# 自托管部署（部署到你自己的服务器）

> 最后更新：2026-09-14 ｜ 适用：Ubuntu / Debian 云服务器
> 本文与 [deployment.md](deployment.md)（Vercel 路线）二选一。自托管是**推荐路线**。

## 一、为什么这个项目更适合自托管

| 项目特征 | 自托管 | Vercel 无服务器 |
|---|---|---|
| 热榜 / 直答各仅 **100 次/天**额度，靠进程内缓存省额度 | 常驻单进程，缓存真正共享 | 每个实例各存一份缓存，冷启动即失效，**额度更费** |
| 主流程最长 **60 秒**（`app/api/mirror/route.ts`、`zhida/route.ts`） | 无限制 | 免费版函数上限正好 60 秒，卡在天花板 |
| 知乎接口在国内，评委也在国内 | 同区域延迟低 | 需绕行海外，往返更慢 |
| 长期稳定地址 | 自己掌控 | 免费版会休眠 |

**结论**：自托管在额度、超时、网络三方面都更优。Vercel 的价值是「几分钟就能拿到一个 HTTPS 地址」，适合当**备用**。

## 二、前提条件

- 一台 Ubuntu / Debian 云服务器，**root 权限**（或可 `sudo`）。本项目用 `114.134.185.16`。
- 服务器能访问外网（要拉 GitHub 代码和知乎接口）。
- **强烈建议有域名 + HTTPS**：浏览器只在 HTTPS 或 localhost 下开放剪贴板接口。
  项目已在 `components/mirror/HandoffPanel.tsx` 里做了兜底（剪贴板不可用时自动选中正文 + 传统复制），
  所以**没有域名也能演示**，但用 HTTPS 体验最好。

> `cauai.fun` 已完成备案，因此可以用域名 + HTTPS 正常访问，剪贴板使用浏览器原生接口。
> 若临时用「IP + 80 端口」访问，剪贴板会自动走兜底路径，功能不受影响。

## 三、部署（一条命令）

**本项目已确定使用 `zhihu.cauai.fun` 作为公网地址。**

先在 DNS 里给 `zhihu` 加一条 A 记录，指向服务器公网 IP `114.134.185.16`。
你的域名 DNS 托管在 **Cloudflare**，加记录时注意代理开关（橙色云朵）：

| 代理状态 | 说明 | 对应命令 |
|---|---|---|
| **灰云（DNS only）** | 解析直接指向源站，源站自己申请 Let's Encrypt 证书 | `sudo bash deploy-server.sh --domain zhihu.cauai.fun` |
| **橙云（Proxied）** | 由 Cloudflare 提供 HTTPS 与防护，源站只需 HTTP | `sudo bash deploy-server.sh --domain zhihu.cauai.fun --no-ssl`（并把 Cloudflare 的 SSL 模式设为 **Full**） |

推荐**灰云 + 脚本自动申请证书**，配置最简单、可控性最高。

把代码推送到 GitHub 之后，在服务器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/1008611-creater/no.2zhihu/main/scripts/deploy-server.sh -o deploy-server.sh
sudo bash deploy-server.sh --domain zhihu.cauai.fun
```

脚本会自动完成 8 步：装基础软件 → 装 Node 20 → 建运行用户 → 拉代码 → 配环境变量 →
安装依赖并构建 → 配开机自启 → 配 nginx 反向代理（带 `--domain` 时再申请证书）。

运行到第 5 步时，它会**交互式地问你要 Access Secret**，直接粘贴回车即可（输入不回显）。
密钥只写进服务器上的 `.env.local`，权限 600，只有服务用户可读。

> 也可以先把仓库克隆到服务器，再 `sudo bash scripts/deploy-server.sh`，效果一样。

## 四、部署后验收

1. 打开 `http://<你的服务器IP>/api/health`（有域名则用 `https://<域名>/api/health`），应返回：

   ```json
   { "ok": true, "credentials": true, "cache": { "size": 0, "inflight": 0 } }
   ```

   `credentials: false` 说明密钥没配上，回第三步重配。

2. 打开首页，完整走一遍闭环：提问 → 路由 → 证据 → 多视角回答 → 缺口 → 真人补充 → 搬运。
   正常应 60–90 秒内完成。

3. 确认**凭证不出现在**任何前端响应里。

## 五、日常运维

```bash
systemctl status no2zhihu      # 查看服务状态
journalctl -u no2zhihu -f      # 实时日志
systemctl restart no2zhihu     # 重启

# 更新到最新代码（会丢弃服务器上的本地改动）
sudo bash scripts/deploy-server.sh --update
```

> **不要在服务器上直接改代码**。所有改动走「本地 → GitHub → 服务器」，
> 否则 `--update` 的 `git reset --hard` 会覆盖掉。

### 为什么更新是「原子」的（部署不打断在途会话）

Next.js 的产物默认写在 `.next/`。**如果更新时先删 `.next` 再构建，那 1~3 分钟的构建窗口里，
已经在浏览器里打开页面的用户会直接坏掉** —— 旧 HTML 还在，但它引用的
`/_next/static/chunks/*.js` 已经不在磁盘上了，用户点任何一下都会拿到 404
（实测 `content-type: text/html`），前端抛 `ChunkLoadError`，白屏或卡死。

`--update` 因此**不在原地构建**，而是转交 `scripts/deploy-atomic.sh`：

| 步骤 | 做什么 | 为什么 |
|---|---|---|
| 1 | 用 `NEXT_DIST_DIR=.next.new npm run build` 构建到独立目录 | 线上 `.next` 全程不动，旧页面继续可用 |
| 2 | 体检新产物（`BUILD_ID` / `static/chunks` / `server` / `routes-manifest`） | 切之前先确认新版本是完整的 |
| 3 | `mv .next .next.old && mv .next.new .next` | 同一文件系统内的 rename 是**原子**的，不存在「半个 `.next`」的中间态 |
| 4 | 重启 + 等健康检查；失败就用 `.next.old` 换回去 | 回滚点一直在原地 |
| 5 | 成功后删掉 `.next.old` | 服务器磁盘已用 88%，不宜长期留两份 |

**实测对照**（本机复刻两种流程，构建窗口内轮询那个 chunk 是否还在）：

| 流程 | 构建窗口内「chunk 不可达」占比 | 切换耗时 |
|---|---|---|
| 旧：先删 `.next` 再构建 | **46.5%** | — |
| 新：构建到独立目录再原子切换 | **0.0%** | **45.3 ms** |

> 命名有个硬约束：`distDir` 只能用**固定名字**（`.next.new`），不能用带时间戳的目录。
> Next 14 会把 `<distDir>/types/**/*.ts` **追加**进 `tsconfig.json` 的 `include` ——
> 同名重复构建是幂等的，换名字就多一条，最终会把 `tsconfig.json` 撑爆并弄脏工作区。
> 这条已由 `scripts/check-atomic-deploy.mjs` 守着（含反例）。

本地自查：`npm run check:deploy`

## 六、安全清单

- [ ] 服务器 root 密码足够强，并**已启用 SSH 密钥登录**。
- [ ] 密钥只存在于服务器 `.env.local`（权限 600）与本地 `.env.local`（已 gitignore）。
- [ ] 密钥**不出现在**：代码仓库、前端响应、日志、截图、演示视频、聊天记录。
- [ ] 若密钥曾被贴到聊天/截图等地方，到 <https://developer.zhihu.com/profile> **轮换一次**。
- [ ] 服务器防火墙只放行需要的端口（80 / 443 / 你的 SSH 端口）。
- [ ] 建议加一条自动更新系统安全补丁的任务。

## 七、与 Vercel 路线的关系

- 两条路线**可以同时存在**：自托管当主力，Vercel 当备用地址。
- 若时间紧张，先把 Vercel 部署起来锁住必交项，再慢慢迁移到自托管。
- 提交表单里填**一个**可访问的 Demo 地址即可，建议填自托管的那个。
