"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import QuotaBadge from "@/components/ui/QuotaBadge";

/**
 * 说明与审计。
 *
 * 这一页是给评委的「可验证性」入口：把接口实测结果、额度纪律、
 * 以及最关键的一条限制 —— 开放平台没有发布接口 —— 直接摊在页面上。
 * 与其把它藏在文档里，不如让评委当场看到我们没有模拟任何东西。
 */

interface QuotaItem {
  APIID: string;
  APIName: string;
  TotalQuota: number;
  TotalUsed: number;
  RemainingQuota: number;
}

const ENDPOINTS: Array<{ cap: string; path: string; result: string; warn?: boolean }> = [
  { cap: "鉴权", path: "Authorization: Bearer + X-Request-Timestamp", result: "通过" },
  { cap: "额度查询", path: "GET /api/v1/quota", result: "200 · 9 组额度" },
  { cap: "知乎搜索", path: "GET /api/v1/content/zhihu_search?Count=3", result: "200 · 真实问答" },
  { cap: "全网搜索", path: "GET /api/v1/content/global_search?Count=3", result: "200" },
  { cap: "知乎热榜", path: "GET /api/v1/content/hot_list", result: "200 · 30 条" },
  { cap: "问题回答", path: "GET /api/v1/content/question_answers", result: "200 · 回答摘要" },
  { cap: "直答模型", path: "POST /v1/chat/completions", result: "200 · 真实生成" },
  { cap: "问题推荐", path: "GET /api/v1/user/question_recommendations", result: "200" },
  { cap: "账号创作数据", path: "GET /api/v1/user/creator_account_stats", result: "200" },
  { cap: "黑客松故事", path: "GET api.zhihu.com/km-indep-home/hackathon/v2/story/list", result: "401 · 需浏览器登录态", warn: true }
];

const LIMITS: Array<{ name: string; quota: string; budget: string }> = [
  { name: "知乎搜索", quota: "5,000/天", budget: "缓存 5 分钟" },
  { name: "全网搜索", quota: "5,000/天", budget: "缓存 5 分钟" },
  { name: "知乎热榜", quota: "100/天", budget: "缓存 10 分钟，禁止轮询" },
  { name: "问题回答", quota: "100/天", budget: "缓存 10 分钟" },
  { name: "用户数据", quota: "10,000/天", budget: "缓存 30 分钟" },
  { name: "直答 / 创作", quota: "100/天", budget: "缓存 30 分钟，仅关键节点" },
  { name: "知识库", quota: "500/天", budget: "备用" },
  { name: "小工具", quota: "10/天", budget: "不使用" }
];

export default function AboutPage() {
  const [quota, setQuota] = useState<QuotaItem[] | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/zhihu/quota")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) setQuota(d.data);
        else setQuotaError(d.error ?? "额度不可用");
      })
      .catch(() => alive && setQuotaError("额度不可用"));
    return () => { alive = false; };
  }, []);

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">About · audit</p>
        <h1 style={{ maxWidth: "22ch" }}>说明与接口审计</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          这一页解释「二号知乎」为什么这么做，并把我们踩过的坑和平台的真实限制写清楚。
          所有结论都来自对开放平台文档与接口的实测，不是推测。
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>最关键的一条：平台没有发布接口</h2>
        </div>
        <div className="card" style={{ borderColor: "rgba(255,138,76,0.35)" }}>
          <div className="accent-bar a-orange" />
          <p style={{ fontSize: 14.5, color: "var(--text-300)", lineHeight: 1.85 }}>
            我们逐条审计了知乎开放平台的接口文档：<strong style={{ color: "var(--orange-soft)" }}>全部能力都是只读的</strong>，
            不存在把回答或文章写入知乎的接口。<code className="mono">PublishCount</code> 只是统计字段，
            不是发布能力；官方文档也明确写明发布相关字段与 scope 未文档化，不允许猜测实现。
          </p>
          <p style={{ fontSize: 14.5, color: "var(--text-300)", lineHeight: 1.85, marginTop: 12 }}>
            所以我们<strong>没有</strong>做「一键发布到知乎」这种做不到的按钮，也没有用假接口假装发布成功。
            真实路径是：把真人补充后的正文准备好，生成知乎真实编辑器的深链，
            正文复制到剪贴板，由你本人点开、粘贴、点击发布 —— 全程经过知乎，没有经过我们的模拟。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <Link className="btn btn-sm" href="/mirror">去看搬运面板</Link>
            <a className="btn btn-sm btn-ghost" href="https://developer.zhihu.com/docs" target="_blank" rel="noreferrer noopener">
              核对官方文档
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>接口实测结果</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>实测时间 2026-09-14</span>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--ink-850)" }}>
                  <th style={{ textAlign: "left", padding: "11px 16px", color: "var(--text-500)", fontWeight: 700 }}>能力</th>
                  <th style={{ textAlign: "left", padding: "11px 16px", color: "var(--text-500)", fontWeight: 700 }}>接口</th>
                  <th style={{ textAlign: "left", padding: "11px 16px", color: "var(--text-500)", fontWeight: 700 }}>结果</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e, i) => (
                  <motion.tr
                    key={e.path}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.4) }}
                    style={{ borderTop: "1px solid var(--line-soft)" }}
                  >
                    <td style={{ padding: "11px 16px", fontWeight: 700 }}>{e.cap}</td>
                    <td style={{ padding: "11px 16px" }} className="mono dim">{e.path}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span className={e.warn ? "chip chip-orange" : "chip chip-green"}>{e.result}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="notice notice-warn" style={{ marginTop: 12 }}>
          <strong>一条失败的我们也写出来：</strong>官方指南提到的
          <code className="mono"> api.zhihu.com/km-indep-home/hackathon/v2/story/list </code>
          是站内页面接口，实测无论带不带 Access Secret 都返回
          <code className="mono"> 401 ERR_PARSE_LOGIN_TICKET</code>，依赖浏览器登录票据。
          因此它在本作品里是「已接入、当前不可用」的真实状态，我们没有换成别的数据假装它能用。
        </div>
        <p className="dimmer mono" style={{ marginTop: 10 }}>
          注：本机 curl / PowerShell 访问 developer.zhihu.com 时在 TLS 握手失败
          （schannel SEC_E_NO_CREDENTIALS），这是 Windows 证书链问题，不是接口不可用；
          服务端改用 Node 自带 TLS 栈后全部返回 200。
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>额度纪律</h2>
          <div style={{ marginLeft: "auto" }}><QuotaBadge /></div>
        </div>
        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          {LIMITS.map((l) => (
            <div key={l.name} className="card-flat" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <strong style={{ fontSize: 13.5, marginRight: "auto" }}>{l.name}</strong>
              <span className="chip mono">{l.quota}</span>
              <span className="mono dimmer" style={{ fontSize: 11 }}>{l.budget}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <p className="eyebrow">实时剩余额度</p>
          {quotaError && <div className="notice notice-warn">{quotaError}</div>}
          {!quota && !quotaError && <div className="skeleton" style={{ height: 70 }} />}
          {quota && (
            <div style={{ display: "grid", gap: 10 }}>
              {quota.map((q) => {
                const pct = q.TotalQuota > 0 ? Math.max(0, Math.min(1, q.RemainingQuota / q.TotalQuota)) : 0;
                return (
                  <div key={q.APIID}>
                    <div style={{ display: "flex", gap: 10, marginBottom: 5, alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, marginRight: "auto" }}>{q.APIName}</span>
                      <span className="mono dimmer">{q.RemainingQuota} / {q.TotalQuota}</span>
                    </div>
                    <div className="bar"><i style={{ width: (pct * 100).toFixed(1) + "%" }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>产品怎么运作</h2></div>
        <div className="grid grid-3">
          {[
            { t: "Human Router", d: "按问题里的信号词、事实锚点与判断词给 6 个分身打分，选出 3–6 个覆盖不同视角，并展示每个分身被选中的理由。" },
            { t: "真实证据", d: "每个分身带着自己的检索词去知乎搜索接口取回真实回答，回答正文只能引用这些证据，直答不允许引入证据外的事实。" },
            { t: "看山找缺口", d: "某个视角一条来源都没有、所有回答都缺数字、缺少反方、问题涉及当下时点 —— 这四类信号触发缺口。" },
            { t: "精准找真人", d: "候选人不靠画像猜测，直接取证据的作者：这个人确实在知乎写过相关内容，赞同数决定排序。" },
            { t: "真人接管", d: "最小填空只补关键一句，完整编辑可整段改写。提交后回写回答、缺口、Mesh 与贡献值。" },
            { t: "搬运回知乎", d: "生成真实编辑器深链 + 复制正文，由本人发布。开放平台没有写入接口，我们不假装有。" }
          ].map((c, i) => (
            <motion.div
              key={c.t}
              className="card"
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.34, delay: i * 0.05 }}
            >
              <h3 style={{ marginBottom: 8 }}>{c.t}</h3>
              <p className="dim" style={{ fontSize: 13.5 }}>{c.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>合规边界</h2></div>
        <div className="card">
          <ul className="dim" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 2 }}>
            <li>Access Secret 只存在服务端环境变量，不进入前端 bundle、日志、URL 或仓库。</li>
            <li>展示的知乎内容一律保留作者名与原文链接，不把第三方原文当作本作品原创。</li>
            <li>所有展示的知乎内容都来自真实接口响应；接口失败时展示真实错误，不用假数据填充。</li>
            <li>刘看山形象与知乎故事素材仅在比赛授权范围内使用，赛后商用需另行取得授权。</li>
            <li>参考项目 grok-icon-study 只用于学习动效架构（弹簧积分、状态表），其几何与素材归 xAI，本仓库未使用。</li>
          </ul>
        </div>
      </section>
    </>
  );
}
