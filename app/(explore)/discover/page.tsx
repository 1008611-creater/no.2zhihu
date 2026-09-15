import Link from "next/link";
import PersonaRoster from "@/components/discover/PersonaRoster";
import { PERSONAS } from "@/lib/domain/personas";

/**
 * 分身发现 —— 第二条主线。
 *
 * 主线一「提问」解决「我想问一件事」：`/` 输入问题 → 选答主 → `/mirror` 看结果。
 * 主线二「分身发现」解决「这里到底住着谁」：先逛人，再决定带谁去提问。
 *
 * 两条主线在导航上是并列的两个 Tab，页面之间只通过明确的动作互相跳转
 * （「带他去提问 →」回到 `/`，「去提一个问题 →」从 `/mirror` 空态回去），
 * 不再像之前那样把名册塞进提问流程的中间。
 *
 * 版式遵循 req 10：大字后面不挂解释性小字（`no-tail`），说明放进区块内的卡片。
 */
export default function DiscoverPage() {
  return (
    <section style={{ paddingTop: 32 }}>
      <p className="eyebrow">Discover · 分身发现</p>
      <h1 className="no-tail" style={{ fontSize: "clamp(24px, 3.2vw, 36px)", maxWidth: "26ch" }}>
        这里住着 {PERSONAS.length} 位知乎答主
        <br />
        和若干位公共人物的分身
      </h1>

      <PersonaRoster />

      <div className="card" style={{ marginTop: 30, borderColor: "rgba(77,124,255,0.35)" }}>
        <p className="eyebrow">Next · 挑好了就去问</p>
        <h3 style={{ marginBottom: 10 }}>带一位分身，去回答你的问题</h3>
        <p className="dim" style={{ fontSize: 13.5 }}>
          提问是另一条主线：你提一个问题，选中的分身各自取证据、各自作答，
          看山会把他们的分歧和缺口一并标出来。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <Link className="btn btn-primary" href="/">
            去提一个问题 →
          </Link>
          <Link className="btn btn-ghost" href="/square">
            先看看已经讨论过的事
          </Link>
        </div>
      </div>
    </section>
  );
}
