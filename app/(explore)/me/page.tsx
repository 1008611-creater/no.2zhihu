"use client";

import { useEffect, useState } from "react";
import { useMirror } from "@/lib/store/mirror-store";
import { useSession } from "@/lib/hooks/useSession";
import IdentityCard from "@/components/me/IdentityCard";
import MyPersonasPanel from "@/components/me/MyPersonasPanel";
import MyMeshPanel from "@/components/me/MyMeshPanel";

/**
 * 「我的」—— 一个入口，两个视图。
 *
 *   · 我的分身 —— 我请过的分身各自答过哪些问题（记录）
 *   · 我的 Mesh —— 我提过的问题与它们所属的领域长成的那张网（结构）
 *
 * 为什么把这两件事收在同一个 tab 下：它们回答的是同一个问题「我在这儿留下了
 * 什么」，只是一个按人看、一个按领域看。分成两个顶级 tab 会让顶部导航膨胀到
 * 五项，而且用户要在两个地方分别确认「这是我的」。收进来之后，顶部导航保持
 * 四项，各自职责一句话说得清。
 *
 * 会话状态在这里 hook 一次，往下传 —— 身份区和「我的 Mesh」里的知乎数据面板
 * 都要用，各自 hook 会重复请求 /api/auth/session。
 */

type Tab = "personas" | "mesh";

const TABS: Array<{ k: Tab; label: string }> = [
  { k: "personas", label: "我的分身" },
  { k: "mesh", label: "我的 Mesh" },
];

export default function MePage() {
  const { history, ready } = useMirror();
  const session = useSession();
  const [tab, setTab] = useState<Tab>("personas");
  const [authNotice, setAuthNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);

    // 深链：/me?tab=mesh 直接落在「我的 Mesh」（/mesh 会重定向到这里）。
    if (sp.get("tab") === "mesh") setTab("mesh");

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
    } else if (err) {
      setAuthNotice({ kind: "err", text: err });
    }
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

  if (!ready) return <div className="skeleton" style={{ height: 380, marginTop: 44 }} />;

  return (
    <>
      <section style={{ paddingTop: 44 }}>
        <p className="eyebrow">My · 我的</p>
        <h1 className="no-tail" style={{ maxWidth: "20ch" }}>我的</h1>
        <IdentityCard notice={authNotice} session={session} />
      </section>

      <nav
        aria-label="我的视图"
        role="tablist"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 30 }}
      >
        {TABS.map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            className="chip"
            style={{
              cursor: "pointer",
              ...(tab === t.k ? { borderColor: "var(--blue)", color: "var(--blue-soft)" } : {}),
            }}
            onClick={() => setTab(t.k)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "personas" ? (
        <MyPersonasPanel history={history} />
      ) : (
        <MyMeshPanel history={history} user={session.user} />
      )}
    </>
  );
}
