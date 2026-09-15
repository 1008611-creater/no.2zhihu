"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { DUR, EASE } from "@/lib/motion/tokens";

/**
 * 登录后：把这位用户自己的知乎数据接进 Mesh。
 *
 * 这块是本页「登录之后」的全部意义 —— 不登录看到的是本地生成的镜像问题，
 * 登录后多出来的是**真实存在于他知乎账号里的东西**：创作、关注、收藏。
 *
 * 三条产品原则：
 *   · 空数据不算失败。新账号没有收藏夹是正常的，如实写「没有」而不是报错。
 *   · 失败要说清是哪一环失败（未登录 / 上游拒绝 / 配额），不糊成「加载失败」。
 *   · 绝不展示 access_token，也不在前端留任何 token 痕迹。
 */

type Status = "success" | "empty" | "error" | "loading";

interface SnapshotItem {
  id: string;
  name: string;
  status: Exclude<Status, "loading">;
  message: string | null;
  item: Record<string, unknown> | null;
}

/** 接口原始字段名是 PascalCase，这里统一读出来做展示。 */
function pick(o: Record<string, unknown> | null, ...keys: string[]): string {
  if (!o) return "";
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

/** 每条接口挑最该露出来的那一个字段，而不是把原始 JSON 摊给用户看。 */
function headlineOf(id: string, item: Record<string, unknown> | null): string {
  switch (id) {
    case "contents":
      return pick(item, "Title", "title");
    case "followees":
      return pick(item, "Fullname", "fullname", "Name");
    case "favlists":
      return pick(item, "Title", "title");
    case "collections":
      return pick(item, "Title", "title");
    default:
      return "";
  }
}

function sublineOf(id: string, item: Record<string, unknown> | null): string {
  switch (id) {
    case "contents": {
      const like = pick(item, "LikeCount");
      const type = pick(item, "ContentType");
      const parts: string[] = [];
      if (type) parts.push(type);
      if (like) parts.push(`${like} 赞`);
      return parts.join(" · ");
    }
    case "followees": {
      const h = pick(item, "Headline");
      const f = pick(item, "FollowerCount");
      return [h, f ? `${f} 关注者` : ""].filter(Boolean).join(" · ");
    }
    case "favlists":
      return pick(item, "Description");
    case "collections": {
      const fav = pick(item, "FavTime");
      const list = Array.isArray(item?.Favlists)
        ? (item!.Favlists as Array<Record<string, unknown>>).map((x) => pick(x, "Title")).filter(Boolean)[0]
        : "";
      return [list ? `收藏于「${list}」` : "", fav ? `收藏时间 ${new Date(Number(fav) * 1000).toLocaleDateString("zh-CN")}` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    default:
      return "";
  }
}

function urlOf(id: string, item: Record<string, unknown> | null): string {
  if (id === "followees") return pick(item, "Url");
  return pick(item, "Url");
}

export default function UserZhihuPanel({ userId }: { userId: string }) {
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/user-data", { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) {
        setError(data?.error ?? "读取失败");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("网络连接失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, userId]);

  if (loading) {
    return (
      <section className="section">
        <div className="section-head">
          <h2 className="no-tail">你知乎账号里的东西</h2>
        </div>
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 104 }} />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section">
        <div className="section-head">
          <h2 className="no-tail">你知乎账号里的东西</h2>
        </div>
        <div className="notice notice-warn">
          {error}
          <button className="link mono" style={{ marginLeft: 10 }} onClick={load}>
            重试
          </button>
        </div>
      </section>
    );
  }

  const okCount = items.filter((i) => i.status === "success").length;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="no-tail">你知乎账号里的东西</h2>
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {okCount} / {items.length} 项读到数据
        </span>
      </div>

      <div className="grid grid-2">
        {items.map((it, i) => (
          <motion.div
            key={it.id}
            className="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.05, 0.3) }}
          >
            <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
              <span className="eyebrow" style={{ marginBottom: 0 }}>{it.name}</span>
              <span
                className={
                  "chip " +
                  (it.status === "success"
                    ? "chip-green"
                    : it.status === "empty"
                      ? ""
                      : "chip-orange")
                }
              >
                {it.status === "success" ? "已读到" : it.status === "empty" ? "空数据" : "失败"}
              </span>
            </div>

            {it.status === "success" ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.4 }}>
                  {headlineOf(it.id, it.item) || "（无标题）"}
                </div>
                {sublineOf(it.id, it.item) && (
                  <div className="dim" style={{ fontSize: 12.5, marginTop: 5 }}>
                    {sublineOf(it.id, it.item)}
                  </div>
                )}
                {urlOf(it.id, it.item) && (
                  <a
                    className="link mono"
                    style={{ fontSize: 11.5, display: "inline-block", marginTop: 9 }}
                    href={urlOf(it.id, it.item)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    在知乎打开 →
                  </a>
                )}
              </div>
            ) : (
              <div className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>
                {it.status === "empty"
                  ? it.message ?? "接口成功，但这个账号里没有这一类公开数据。"
                  : it.message ?? "接口调用失败。"}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 12 }}>
        这些是你在知乎公开范围内的数据，通过你的授权读取。授权令牌只留在服务端内存，
        不进浏览器、不落盘、不写日志。
      </p>
    </section>
  );
}
