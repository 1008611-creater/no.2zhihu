# 外部资源索引

> 最后更新：2026-09-14

## 一、官方入口

| 用途 | 地址 | 核验时间 |
|---|---|---|
| 赛事主页（需登录） | https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2 | 2026-09-14 |
| 参赛者开发流程文档 | https://pcnsiq9mmnww.feishu.cn/wiki/Pd1UwIIBriW0DBk8qlIczBAVnJc | 2026-09-14 |
| 开发者手册与提交清单 | https://my.feishu.cn/docx/Mc80dR5XvoPaYDxcTasc04POnjd | 2026-09-14 |
| 技术指南 | https://rcnmkynuc7as.feishu.cn/wiki/WAmmw2SqXiNlOQkdeRGcGesenCd | 2026-09-14 |
| 提额申请 | https://my.feishu.cn/wiki/PNKtwTHW6iQhnNk9c78ctfR9nye | 2026-09-14 |
| 开放平台文档中心 | https://developer.zhihu.com/docs | 2026-09-14 |
| Access Secret 申请 | https://developer.zhihu.com/profile | 2026-09-14 |

## 二、官方 Skill

**当前版本：0.7.2-beta.20260911131715**（2026-09-12 发布，新增 OAuth 示例）

```
https://developer-cdn.zhihu.com/zhihu-cli/releases/beta/skill/0.7.2-beta.20260911131715/zhihu-cli-skill-0.7.2-beta.20260911131715.zip
```

本地位置（已解包，`.official/` 已 gitignore）：
- `.official/zhihu-skill-0.7.2/zhihu/SKILL.md` — 入口
- `references/hackathon.md` — 赛程、流程、交付清单
- `references/hackathon-content-api.md` — 无鉴权内容接口
- `references/hackathon-oauth.md` — 黑客松 OAuth 接入
- `references/hackathon-user-profile-api.md` — 授权用户基础信息
- `references/creator.md` — 本人创作能力
- `references/http-api.md` — 完整 HTTP 契约
- `references/open-platform.md` — 额度与术语
- `scripts/setup.ps1` / `run.ps1` — 安装与状态检查

> 历史版本 `0.5.3-beta` 仍保留在 `.official/zhihu-skill/`，作为对照。

## 三、参考项目

| 项目 | 用途 | 边界 |
|---|---|---|
| https://github.com/blessonism/grok-icon-study | 学习弹簧驱动角色引擎的**架构** | 几何与素材归 xAI，**禁止复用** |

本地：`.refs/grok-icon-study/`（已 gitignore）。审计结论见 [character-engine.md](character-engine.md)。

## 四、比赛素材（仅比赛期间授权）

| 素材 | 大小 | 状态 |
|---|---|---|
| 看山三视图.zip | 74.32 KB | **未下载**（飞书附件下载被浏览器拦截，见 roadmap.md） |
| 刘看山动态.zip | 5.37 MB | **未下载** |

下载入口：参赛者开发流程文档内的附件。

## 五、内容接口（无鉴权，仅比赛期间有效）

```
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/list
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/{work_id}
GET https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list
GET https://api.zhihu.com/km-indep-home/hackathon/v2/story/{work_id}   ← 知识详情共用此路径
```

> 知识详情与故事详情**共用** `story/{work_id}`，不要改成 `knowledge/{work_id}`。

## 六、本地留存

| 路径 | 内容 |
|---|---|
| `.official/知乎黑客松三赛道制作指南.md` | 三赛道要求、评审权重、提交清单（整理稿） |
| `.official/zhihu_readings.json` | 接口实测留档 |
| `docs/api-audit.md` | 接口审计结论（实测） |
