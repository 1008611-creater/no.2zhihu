"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import MeshGraph from "@/components/mesh/MeshGraph";
import MineHandoffPanel from "@/components/mesh/MineHandoffPanel";
import UserZhihuPanel from "@/components/mesh/UserZhihuPanel";
import { useMirror } from "@/lib/store/mirror-store";
import { useSession } from "@/lib/hooks/useSession";
import { buildMesh } from "@/lib/domain/mesh";
import { PERSONAS } from "@/lib/domain/personas";
import type { MirrorQuestion } from "@/lib/domain/types";
import CountUp from '@/components/ui/CountUp';
import { DUR, EASE } from "@/lib/motion/tokens";

/**
 * 我的 Mesh。
 *
 * 登录账号之后看到的是「自己的」那张网：你邀请过哪些答主的分身、他们答过
 * 哪些问题、哪些真人补过缺口，以及已经拥有分身的答主各自的网络。
 *
 * 登录走知乎 OAuth（lib/zhihu/oauth.ts）。三态必须分清楚：
 *   · 已登录 —— 显示真实授权的 @昵称 与头像；
 *   · 已开通未登录 —— 显示登录按钮；
 *   · 未开通 —— 如实说明凭证未申请，同时保留本机昵称这条退路，不让页面残废。
 */

const ME_KEY = "no2zhihu:me";

/** 广场演示用的已完成镜像问题库（服务端构建产物，见 scripts/build-library.mjs）。 */
type LibraryEntry = { id: string; title: string; skills: { name: string }[] };

export default function MeshPage() {
  const { mirror, history, ready } = useMirror();
  const { user, available, stateVerified, loading: sessionLoading, login, logout } = useSession();
  const focus = useSearchParams().get("q");

  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  /** 每位答主被借去答过几次 —— 用来筛出「已经有分身的答主」。 */
  const [borrowed, setBorrowed] = useState<Record<string, number>>({});
  /** OAuth 回调带回的提示，只用于当次展示。 */
  const [authNotice, setAuthNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  /** 未登录时的本机昵称 —— 数据本来就全在本机，不必强制登录。 */
  const [fallbackName, setFallbackName] = useState("");

  useEffect(() => {
    setFallbackName(window.localStorage.getItem(ME_KEY) ?? "");

    const sp = new URLSearchParams(window.location.search);
    const ok = sp.get("auth");
    const err = sp.get("authError");
    const profileMissing = sp.get("authNoteProfile") === "1";
    if (ok) {
      // 资料没读到时如实说明：登录是成功的，只是昵称头像这一步没拿到。
      setAuthNotice({
        kind: "ok",
        text: profileMissing
          ? `已登录（@${ok}）· 昵称头像这次没读到，不影响你的分身与搬运功能`
          : `已用知乎账号 @${ok} 登录`,
      });
    } else if (err) setAuthNotice({ kind: "err", text: err });
    if (ok || err) {
      // 清掉 URL 上的提示参数，刷新不会重复弹。
      sp.delete("auth");
      sp.delete("authError");
      sp.delete("authNote");
      sp.delete("authNoteProfile");
      const qs = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }
  }, []);

  useEffect(() => {
    const counts: Record<string, number> = {};
    history.forEach((m) => {
      m.skills.forEach((s) => {
        const handle = s.persona?.handle;
        if (handle) counts[handle] = (counts[handle] ?? 0) + 1;
      });
    });
    setBorrowed({ ...counts });

    fetch("/square-library.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { entries?: LibraryEntry[] } | LibraryEntry[]) =>
        setLibrary(Array.isArray(data) ? data : data?.entries ?? []))
      .catch(() => setLibrary([]));
  }, [history]);

  /** 这张网的主人：登录优先，否则用本机昵称。 */
  const me = user?.name ?? fallbackName;

  const saveFallbackName = (v: string) => {
    setFallbackName(v);
    window.localStorage.setItem(ME_KEY, v);
  };

  const graphs = useMemo(
    () => history.map((m) => ({ mirror: m, graph: buildMesh(m) })),
    [history]
  );

  /** 我的分身答过哪些问题（按 handle 聚合本机全部镜像问题）。 */
  const myPersonas = useMemo(() => {
    const map = new Map<string, { handle: string; name: string; accent: string; questions: string[] }>();
    history.forEach((m) => {
      m.skills.forEach((s) => {
        const handle = s.persona?.handle ?? s.id;
        const entry =
          map.get(handle) ?? {
            handle,
            name: s.persona?.displayName ?? s.name,
            accent: s.accent ?? "blue",
            questions: [],
          };
        if (!entry.questions.includes(m.title)) entry.questions.push(m.title);
        map.set(handle, entry);
      });
    });
    return [...map.values()].sort((a, b) => b.questions.length - a.questions.length);
  }, [history]);

  /** 广场库里每位答主被借去答过哪些问题。 */
  const libraryByPersona = useMemo(() => {
    const map = new Map<string, string[]>();
    PERSONAS.forEach((p) => {
      const qs = library
        .filter((e) => (e.skills ?? []).some((s) => s.name === p.displayName))
        .map((e) => e.title);
      if (qs.length) map.set(p.handle, qs);
    });
    return map;
  }, [library]);

  const personasWithMirror = useMemo(
    () =>
      PERSONAS.filter((p) => (borrowed[p.handle] ?? 0) > 0 || libraryByPersona.has(p.handle)).sort(
        (a, b) =>
          (libraryByPersona.get(b.handle)?.length ?? 0) + (borrowed[b.handle] ?? 0) -
          ((libraryByPersona.get(a.handle)?.length ?? 0) + (borrowed[a.handle] ?? 0))
      ),
    [borrowed, libraryByPersona]
  );

  if (!ready) return <div className="skeleton" style={{ height: 380, marginTop: 44 }} />;

  /* ------------------------------ 身份区 ------------------------------ */

  const identityBlock = (
    <>
      {authNotice && (
        <div
          className={"notice " + (authNotice.kind === "ok" ? "notice-info" : "notice-warn")}
          style={{ marginTop: 22 }}
        >
          {authNotice.text}
        </div>
      )}

      <div
        className="card"
        style={{ marginTop: authNotice ? 12 : 24, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
      >
        {sessionLoading ? (
          <div className="skeleton" style={{ height: 48, flex: 1, minWidth: 240 }} />
        ) : user ? (
          <>
            <span className="avatar" aria-hidden>
              {user.avatarUrl ? (
                // 知乎头像域名不固定，用原生 img 避免 next/image 的域名白名单问题。
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" width={44} height={44} />
              ) : (
                <span className="avatar-fallback">{user.name.slice(0, 1)}</span>
              )}
            </span>
            <div style={{ marginRight: "auto", minWidth: 200 }}>
              <p className="eyebrow" style={{ marginBottom: 5 }}>已用知乎账号登录</p>
              <div style={{ fontWeight: 700, fontSize: 17 }}>@{user.name}</div>
              {user.headline && (
                <div className="dim" style={{ fontSize: 12.5, marginTop: 3 }}>{user.headline}</div>
              )}
            </div>
            {user.url && (
              <a className="link mono" href={user.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12 }}>
                知乎主页
              </a>
            )}
            <button className="btn btn-ghost" onClick={logout}>退出登录</button>
          </>
        ) : (
          <>
            <div style={{ marginRight: "auto", minWidth: 220 }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>我的身份</p>
              <div className="dim" style={{ fontSize: 12.5 }}>
                {available ? "用知乎账号登录，这张网就挂在你的名字下" : "填一个昵称，这张网就归你了"}
              </div>
            </div>
            {available ? (
              <button className="btn btn-primary" onClick={login}>用知乎账号登录 →</button>
            ) : (
              <input
                className="field"
                style={{ maxWidth: 240, padding: "10px 12px", minHeight: 0, width: "auto" }}
                value={fallbackName}
                onChange={(e) => saveFallbackName(e.target.value)}
                placeholder="你的昵称"
                aria-label="你的昵称"
              />
            )}
          </>
        )}
      </div>

      {!sessionLoading && !available && (
        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
          知乎 OAuth 登录尚未开通：需先向 openplatform@zhihu.com 申请 app_id / app_key。
          当前身份只保存在本机浏览器，不假装已登录。
        </p>
      )}

      {/* 登录成功但平台没回传 state —— 这是知乎的现状，如实标注，不谎称安全。 */}
      {!sessionLoading && user && !stateVerified && (
        <p className="dimmer mono" style={{ fontSize: 11.5, marginTop: 8 }}>
          知乎授权回调当前不回传 state 参数，因此本次登录未完成标准的 CSRF 校验。
          如实标注，不把它当作「生产级安全登录」。
        </p>
      )}
    </>
  );

  /* ------------------------------ 答主的网络 ------------------------------ */

  const peopleSection = (
    <section className="section">
      <div className="section-head">
        <h2>已经有分身的答主</h2>
        <span className="mono dimmer" style={{ marginLeft: "auto" }}>
          {personasWithMirror.length} / {PERSONAS.length} 位
        </span>
      </div>
      <div className="grid grid-3">
        {personasWithMirror.map((p, i) => {
          const qs = libraryByPersona.get(p.handle) ?? [];
          const mine = borrowed[p.handle] ?? 0;
          return (
            <motion.div
              key={p.handle}
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.04, 0.4) }}
            >
              <div className={"accent-bar a-" + p.accent} />
              <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{p.displayName}</h3>
                <span className="persona-mono">@{p.handle}</span>
              </div>
              <div className="dimmer mono" style={{ fontSize: 11, marginTop: 8 }}>
                {qs.length + mine} 个问题里出现过{mine > 0 ? ` · 其中 ${mine} 个是你提的` : ""}
              </div>
              {qs.length > 0 && (
                <div style={{ display: "grid", gap: 5, marginTop: 10 }}>
                  {qs.slice(0, 3).map((q) => (
                    <div key={q} className="dim" style={{ fontSize: 12.5 }}>· {q}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <Link className="link mono" style={{ fontSize: 11.5 }} href={"/?persona=" + p.handle}>
                  带他答新问题 →
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );

  /* ------------------------------ 空态 ------------------------------ */

  if (!mirror || graphs.length === 0) {
    return (
      <>
        <section style={{ paddingTop: 52 }}>
          <p className="eyebrow">My mesh</p>
          <h1 className="no-tail" style={{ maxWidth: "20ch" }}>
            {me ? `@${me} 的 Mesh` : "这里会长出你的 Mesh"}
          </h1>

          {identityBlock}

          {user && <UserZhihuPanel userId={user.id || user.name} />}

          <div className="notice" style={{ marginTop: 20 }}>
            还没有关系数据。先去提一个问题，你的分身网络会从这里长出来。
          </div>
          <Link className="btn btn-primary" href="/" style={{ marginTop: 18 }}>
            去提一个问题
          </Link>
        </section>
        {/*
          空态也保留搬运面板：history 里可能已经攒了上一批问题的分身回答，
          而当前 mirror 恰好为空（例如刚清过当前会话）。若这里不渲染，
          用户就没法处理那批积压产出 —— 面板自己处理 items.length === 0。
        */}
        <MineHandoffPanel history={history} />
        {peopleSection}
      </>
    );
  }

  /* ------------------------------ 有数据 ------------------------------ */

  const focused = focus ? graphs.find((g) => g.mirror.id === focus) ?? graphs[0] : graphs[0];
  const totals = graphs.reduce(
    (acc, g) => ({
      nodes: acc.nodes + g.graph.nodes.length,
      edges: acc.edges + g.graph.edges.length,
      humans: acc.humans + g.graph.nodes.filter((n) => n.type === "human").length,
      answers: acc.answers + g.graph.nodes.filter((n) => n.type === "answer").length
    }),
    { nodes: 0, edges: 0, humans: 0, answers: 0 }
  );

  const humans = focused.graph.nodes.filter((n) => n.type === "human");

  /** 还没搬回知乎的分身回答篇数 —— 用作搬运入口的可见提示。 */
  const pendingHandoff = history.reduce(
    (n, m) =>
      n +
      (m.handoff?.status === "confirmed"
        ? 0
        : m.answers.filter((a) => a.status !== "human" && a.status !== "handed-off").length),
    0
  );

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">My mesh</p>
        <h1 className="no-tail" style={{ maxWidth: "20ch" }}>
          {me ? `@${me} 的 Mesh` : "我的分身网络"}
        </h1>

        {identityBlock}

        {user && <UserZhihuPanel userId={user.id || user.name} />}

        <div className="grid grid-4" style={{ marginTop: 26 }}>
          {[
            { n: totals.nodes, l: "节点" },
            { n: totals.edges, l: "关系边" },
            { n: totals.answers, l: "分身回答" },
            { n: totals.humans, l: "真实作者" }
          ].map((s) => (
            <div key={s.l} className="stat">
              <div className="stat-n"><CountUp value={s.n} /></div>
              <div className="stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {pendingHandoff > 0 && (
          <a
            className="card-flat"
            href="#handoff-mine"
            style={{
              display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
              marginTop: 16, textDecoration: "none", color: "inherit",
              borderColor: "rgba(77,124,255,0.34)"
            }}
          >
            <span className="chip chip-blue">待搬运</span>
            <strong style={{ fontSize: 14, marginRight: "auto" }}>
              {pendingHandoff} 篇分身回答还没搬回知乎
            </strong>
            <span className="link mono" style={{ fontSize: 12 }}>去一键发布 →</span>
          </a>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{focused.mirror.title}</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>
            {focused.graph.nodes.length} 节点 · {focused.graph.edges.length} 关系
          </span>
        </div>
        <MeshGraph graph={focused.graph} height={520} />
      </section>

      {/*
        搬运是「回头处理产出」的动作，因此和「我的分身答过哪些问题」合成同一块叙事：
        上面说分身答过什么，下面就能把任一场一键搬回知乎。
        传 history 而不是单场 —— 用户在自己 Mesh 里要处理的是**全部**积压产出。
      */}
      <MineHandoffPanel history={history} />

      <section className="section">
        <div className="section-head">
          <h2>我的分身，答过哪些问题</h2>
          <span className="mono dimmer" style={{ marginLeft: "auto" }}>
            {myPersonas.length} 位分身 · {history.length} 个问题
          </span>
        </div>

        <div className="grid grid-3">
          {myPersonas.map((p, i) => (
            <motion.div
              key={p.handle}
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.05, 0.4) }}
            >
              <div className={"accent-bar a-" + p.accent} />
              <div className="row-between" style={{ alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{p.name}</h3>
                <span className="persona-mono">@{p.handle}</span>
              </div>
              <div className="lbl" style={{ marginTop: 12 }}>
                答过 {p.questions.length} 个问题
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {p.questions.map((q) => (
                  <div key={q} className="dim" style={{ fontSize: 12.5 }}>· {q}</div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <Link className="link mono" style={{ fontSize: 11.5 }} href={"/?persona=" + p.handle}>
                  带他答新问题 →
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {humans.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>连进这张网的真实作者</h2>
            <span className="mono dimmer" style={{ marginLeft: "auto" }}>{humans.length} 位</span>
          </div>
          <div className="grid grid-3">
            {humans.map((h, i) => (
              <motion.div
                key={h.id}
                className="card-flat"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DUR.slow, ease: EASE.out, delay: i * 0.05 }}
              >
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <span className="chip chip-green">真人</span>
                  <strong style={{ fontSize: 14 }}>{h.label}</strong>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {graphs.length > 1 && (
        <section className="section">
          <div className="section-head"><h2>我的其他镜像问题</h2></div>
          <div style={{ display: "grid", gap: 12 }}>
            {graphs
              .filter((g) => g.mirror.id !== focused.mirror.id)
              .map((g) => (
                <Link
                  key={g.mirror.id}
                  href={"/mesh?q=" + g.mirror.id}
                  className="card-flat"
                  style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", textDecoration: "none", color: "inherit" }}
                >
                  <span className="chip chip-blue">{g.mirror.routing.intent}</span>
                  <strong style={{ fontSize: 14, marginRight: "auto" }}>{g.mirror.title}</strong>
                  <span className="mono dimmer">{g.graph.nodes.length} 节点</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {peopleSection}
    </>
  );
}
