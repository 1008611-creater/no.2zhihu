"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BroadcastPanel from "@/components/square/BroadcastPanel";
import SquareCanvas from "@/components/square/SquareCanvas";
import SquareStrip from "@/components/square/SquareStrip";
import { useMirror } from "@/lib/store/mirror-store";
import { crowdLayout } from "@/lib/domain/crowd";
import { speechOf, type Speech } from "@/lib/domain/speech";
import { hydrateLibraryEntry, statsOf } from "@/lib/domain/library";
import {
  sourceFromLibrary,
  sourceFromMirror,
  toBroadcastItems,
  type BroadcastSource,
} from "@/lib/domain/broadcast";
import { PERSONA_BY_HANDLE } from "@/lib/domain/personas";
import {
  SCOPE_LABELS,
  layoutSquare,
  matchesScope,
  type SquareLayout,
  type SquareScope,
  type TopicInput,
  type TopicNode,
} from "@/lib/domain/square-layout";
import { useSquareLibrary } from "@/lib/hooks/useSquareLibrary";

/**
 * 虚拟广场 · 数据接入层。
 *
 * 职责分工（保持边界清晰）：
 *   · SquareCanvas / CrowdCluster / BroadcastPanel —— 只管画与交互
 *   · square-layout.ts —— 空间布局（纯函数，确定性）
 *   · crowd.ts         —— 人群几何（纯函数，确定性）
 *   · broadcast.ts     —— 右栏条目（纯函数）
 *   · library.ts       —— 库文件的读取与还原（纯函数）
 *   · 本文件           —— 把真实数据喂给上面这些，并持有「聚焦哪一场」这类页面状态
 *
 * 数据来源（不新增任何上游调用）：
 *   · `/square-library.json` —— 22 个已完成的讨论组，构建时生成，**不消耗知乎额度**
 *   · 本地会话 history      —— 用户自己刚生成的讨论（「我这场」）
 *
 * ## 2026-09-15 第二轮改造：从「卡片广场」到「人群广场 + 现场广播」
 *
 * 页面结构变成左广场（约 75%）+ 右现场广播（约 25%），两块**各自滚动、
 * 互不控制**。左广场的浏览位置（视口）与右栏的浏览位置（scrollTop）
 * 完全独立 —— 这不是没做联动，是产品说明明确要求不联动。
 *
 * ## 数据诚实性：广场上站着谁，只由真实计数决定
 *
 * 见 `crowd.ts` 文件头。一句话：实心人形 = 真实分身，空心橙色人形 = 未补缺口，
 * 除此之外没有人形。概念图里的「263 人在讨论」是示意，不落地。
 */

/** 一条讨论的两种表示：喂给布局的计数，与喂给右栏的条目。同源，不会对不上。 */
interface SquareItem {
  input: TopicInput;
  source: BroadcastSource;
}

export default function SquareField() {
  const { history, setMirror } = useMirror();
  const lib = useSquareLibrary();
  const library = lib.status === "ready" ? lib.entries : null;

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [scope, setScope] = useState<SquareScope>("all");

  /**
   * 窄屏时换成横向滑动的话题街区。
   *
   * 为什么在 JS 层分叉而不是纯 CSS：390×780 的手机上，22 个话题铺开的广场
   * 即使全景也只有 18%，人形缩成点、标题糊成灰线，而且 390px 宽里做精确拖拽
   * 根本不现实。硬留画布等于让手机上的人看一堆方块。
   *
   * 窄屏**不渲染右栏现场广播**：横向街区本身就是「可点的纵向列表」的等价物，
   * 同一批讨论再列一遍是冗余。而且窄屏形态下没有拖拽导航，
   * 所以「拖拽必须有替代路径」这条要求在这里天然满足（见 BroadcastPanel 注释）。
   */
  const narrow = useIsNarrow(640);

  /**
   * 当前筛选。
   *
   * 界面上**没有常驻的筛选入口** —— 产品说明与概念图都没有这一行，而一排 chip
   * 会让广场看起来像后台的筛选列表。但 `?filter=mine` 这类深链仍然有效
   * （其它页面可能链过来），生效时由画布显示一枚可关闭的说明条。
   *
   * 为什么初值给 "all" 而不是同步读 window.location：服务端没有 window，
   * 同步读会让首屏 HTML 与客户端不一致（hydration 报错）。
   */
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "mine" || f === "live" || f === "waiting") setScope(f as SquareScope);
  }, []);

  /**
   * 让广场页吃掉探索区的固定 chrome（面包屑 + explore 间距）。
   *
   * .sq-page 的作用见 frontend-v2.css：不加它的话，画布会被头顶那行
   * 「首页 / 探索 Human Mesh」顶下去约 64px，而 body 已锁滚动 ——
   * 底部那 64px 就永远看不见了（实测踩过）。
   */
  useEffect(() => {
    document.body.classList.add("sq-page");
    return () => document.body.classList.remove("sq-page");
  }, []);

  /**
   * 禁止页面上下滚动（规格硬要求：「不进行传统的上下滚动」）。
   *
   * 只在**画布形态**下锁：横向街区形态必须保留纵向滚动 —— 详情展开后内容会
   * 超出视口，锁了 body 就再也看不到底部那两个按钮了。
   *
   * 为什么要给 body 加 class 而不是只靠画布的 touch-action：画布之外的页面
   * 仍然有滚动条（导航栏、布局容器），滚轮在画布上虽然被 preventDefault 了，
   * 但一旦指针滑出画布，页面又开始滚 —— 用户就会觉得「说是无限画布，结果还是会滚」。
   * 挂载期间锁住 body，卸载时**必须**还原，否则离开这个页面后全站都滚不动了。
   */
  useEffect(() => {
    if (narrow) return;
    document.body.classList.add("sq-locked");
    return () => document.body.classList.remove("sq-locked");
  }, [narrow]);

  /**
   * 把顶栏的**真实**高度写进 `--sq-chrome`。
   *
   * 为什么不能只靠 CSS 里的 73px：那是 1440 宽、默认字号下的实测值。
   * 窄屏时 TopBar 收成抽屉、用户调大浏览器默认字号、或系统字号放大，
   * 都会让它变高 —— 写死的值会让画布底部被顶栏切掉一块，
   * 而 body 已锁滚动，被切掉的部分就永远看不到了。
   *
   * 为什么写到 `document.documentElement` 而不是 `.sq-root`：
   * 分栏之后 `.sq-stage` 才是那个按 `--sq-chrome` 算高度的元素，而它是
   * `.sq-root` 的**祖先** —— CSS 变量只向下继承，写在 `.sq-root` 上
   * `.sq-stage` 根本看不见。写到根元素上，谁需要谁都能取到。
   *
   * 为什么这个 effect 在「还在加载、页面只有骨架」时也要跑：
   * 它写的是根元素上的变量，与当前渲染出哪个分支无关；等 `.sq-stage`
   * 挂载时变量已经就位，不会出现一帧的高度跳变。
   */
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!bar) return;
    const root = document.documentElement;
    const sync = () => {
      const h = Math.round(bar.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty("--sq-chrome", h + "px");
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      // 离开广场页必须还原，否则全站都按广场的顶栏高度留白。
      root.style.removeProperty("--sq-chrome");
    };
  }, []);

  /**
   * 把库条目与本地会话统一成「计数 + 广播条目」，再按当前筛选收窄。
   *
   * 为什么计数与广播条目**一起**造：两边要显示同一组数字。分开造的话，
   * 迟早出现「广场画了 3 个人、右栏写着 5 位分身」——这种矛盾一旦出现在
   * 演示现场，评委立刻会怀疑整页数据都是编的。
   */
  const { items, topics, totalCount } = useMemo(() => {
    const libraryIds = new Set((library ?? []).map((e) => e.id));

    const fromLibrary: SquareItem[] = (library ?? []).map((e) => {
      const st = statsOf(e);
      return {
        input: {
          id: e.id,
          title: e.title,
          answerCount: st.answerCount,
          personaCount: st.personaCount,
          openGapCount: st.openGapCount,
          hasReplies: st.hasReplies,
          mine: false,
        },
        source: sourceFromLibrary(e),
      };
    });

    const fromMine: SquareItem[] = history
      .filter((m) => !libraryIds.has(m.id))
      .map((m) => {
        const source = sourceFromMirror(m);
        return {
          input: {
            id: m.id,
            title: m.title,
            answerCount: source.answerCount,
            personaCount: source.personaCount,
            openGapCount: source.openGapCount,
            hasReplies: source.hasReplies,
            mine: true,
          },
          source,
        };
      });

    // 我的讨论排前面：布局按热度取中央，而 mine 有热度加成 ——
    // 于是「我刚问的那场」大概率就在广场中央，符合直觉。
    const all = [...fromMine, ...fromLibrary];

    // 筛选放在**布局之前**：布局要为「这一屏实际有几场」重新分配空间，
    // 而不是先按 22 场排好再隐藏掉一半 —— 那样筛完会留下大片空洞。
    const kept = scope === "all" ? all : all.filter((it) => matchesScope(it.input, scope));

    return {
      items: kept.map((it) => it.source),
      topics: kept.map((it) => it.input),
      totalCount: all.length,
    };
  }, [library, history, scope]);

  // 筛选变化后，原先聚焦的那场可能已经不在集合里了 —— 必须清掉，
  // 否则画布会「聚焦到一个不存在的节点」，镜头停在空白处。
  useEffect(() => {
    setFocusedId((cur) => (cur && topics.some((t) => t.id === cur) ? cur : null));
  }, [topics]);

  /** handle → 显示名，供详情面板的头像显示。 */
  const avatarLookup = useCallback((handle: string) => {
    return PERSONA_BY_HANDLE.get(handle)?.displayName;
  }, []);

  /**
   * 取某一场讨论的回答列表 —— **会话优先，库兜底**。
   *
   * ## 为什么要单独抽出来（这是一个已经踩过的坑）
   *
   * `library` 在加载完成前是 `null`（`lib.status === "ready" ? entries : null`），
   * 而 `history` 来自 localStorage、**同步就可用**。所以「先会话后库」
   * 不只是优先级问题，还是「首屏有没有数据」的问题。
   *
   * 原先这个取法散在两处：`avatarSource` 写了一遍、`previewOf` 又内联了一遍。
   * 我加对话气泡时写了第三遍、**只查了库** —— 结果首屏真名出得来、
   * 气泡一个都没有（`library` 还是 null）。
   *
   * 抽成一个函数，三处走同一条路。**平行实现迟早会漂移，这次漂了。**
   */
  const answersOf = useCallback(
    (id: string): ReadonlyArray<{ skillName?: string; body?: string }> => {
      const local = history.find((m) => m.id === id);
      if (local?.answers?.length) return local.answers;
      return (library ?? []).find((e) => e.id === id)?.answers ?? [];
    },
    [history, library],
  );

  /**
   * 每场讨论的参与答主 handle 列表（取前 3 个做头像）。
   *
   * 为什么先查会话、再查库：同一个 id 可能同时在两边（库是构建时快照，
   * 会话是用户本地生成的）。以会话为准 —— 它包含最新的邀请结果。
   */
  const avatarSource = useCallback(
    (id: string): string[] => {
      const local = history.find((m) => m.id === id);
      if (local) {
        return local.skills
          .map((s) => s.persona?.handle)
          .filter((h): h is string => !!h)
          .slice(0, 3);
      }
      const entry = (library ?? []).find((e) => e.id === id);
      if (entry) {
        return (entry.skills ?? [])
          .map((s) => s.persona?.handle)
          .filter((h): h is string => !!h)
          .slice(0, 3);
      }
      return [];
    },
    [history, library],
  );

  /** 一句回答预览：取该场第一条非空回答的前 64 字（详情面板用）。 */
  const previewOf = useCallback(
    (id: string): string | undefined => {
      const body = answersOf(id).find((a) => a.body?.trim())?.body;
      if (!body) return undefined;
      const clean = body.replace(/\s+/g, " ").trim();
      return clean.length > 64 ? clean.slice(0, 64) + "…" : clean;
    },
    [answersOf],
  );

  const layout: SquareLayout = useMemo(() => {
    const base = layoutSquare(topics, avatarLookup, avatarSource);
    // 预览是展示层信息，布局层不关心它 —— 在这里补上，保持布局纯函数的职责单一。
    return {
      ...base,
      nodes: base.nodes.map((n) => ({ ...n, preview: previewOf(n.id) })),
    };
  }, [topics, avatarLookup, avatarSource, previewOf]);

  /** 人群几何。与 layout.nodes 顺序一一对应，画布按索引取用。 */
  const clusters = useMemo(() => crowdLayout(layout.nodes), [layout.nodes]);

  /**
   * 每个话题的「对话安排」—— **全部是答主原话的摘录**。
   *
   * ## 为什么不在这里编台词
   *
   * 半佛仙人没说过的话，不能由我们替他写在广场上（本项目的诚实性铁律）。
   * 好在数据完全支持不编：66 条真实回答里每一条都有可以直接摘出来当
   * 「一句话」的句子（实测中位 27 字、67% 在 34 字以内），
   * 而且这些话本身就极有辨识度 ——「这事我劝你别想太多，先算个账。」
   *
   * ## 人形怎么对上答主（这里有个隐式契约）
   *
   * `crowd.ts` 给人形的 key 是 `node.id + "#" + i`，而 `i` 与
   * `node.avatarHandles` 同序；`avatarHandles[i]` 又严格等于
   * `answers[i].skillName`（`_diag-speaker-map.mjs` 实测 22/22 场一致）。
   *
   * ⚠️ 这条契约**不是类型保证的**，改动 `avatarSource` 就可能失效，
   * 而失效的后果是**把话安到错的人头上**（等于伪造署名）。
   * 所以这里不直接信索引：从 key 取出 i → 拿到名字 →
   * 再用 `skillName` 反查那条回答。**双保险**。
   * 另外 `check-square-relic.mjs` 有一条断言专门守这个契约。
   */
  const speeches = useMemo(() => {
    const map = new Map<string, { lines: Speech[]; cycle: number; phase: number }>();
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i];
      const cluster = clusters[i];
      if (!cluster) continue;
      // ⚠️ 必须走 answersOf（会话优先、库兜底）——
      //    只查 library 的话首屏一个气泡都不会有（踩过）。
      const answers = answersOf(node.id);
      if (answers.length === 0) continue;

      const speakers: Array<{ figureKey: string; speaker: string; body: string }> = [];
      for (const f of cluster.figures) {
        if (f.kind !== "persona") continue;
        // key = node.id#i → 取 i → 拿名字
        const hash = f.key.lastIndexOf("#");
        const idx = hash >= 0 ? Number(f.key.slice(hash + 1)) : NaN;
        if (!Number.isInteger(idx)) continue;
        const name = node.avatarNames[idx];
        if (!name) continue;
        // 双保险：再用署名反查回答（真正的出处）
        const ans = answers.find(
          (a) => a.skillName === name && String(a.body ?? "").trim().length > 0,
        );
        if (!ans) continue;
        speakers.push({ figureKey: f.key, speaker: name, body: String(ans.body) });
      }

      const s = speechOf(node.id, speakers);
      // 一句话都摘不出来的簇不安排对话 —— 宁可少一个气泡，也不给他编一句
      if (s.lines.length > 0) map.set(node.id, s);
    }
    return map;
  }, [layout.nodes, clusters, answersOf]);

  /** 右栏条目。 */
  const broadcast = useMemo(() => toBroadcastItems(items), [items]);

  /**
   * 进入某场讨论。
   *
   * 广场点人群、右栏点条目**走的是同一个函数** —— 这是「两处进入同一场讨论」
   * 的实现方式：同一个 id、同一份数据、同一个落点。
   */
  const openTopic = useCallback(
    (node: TopicNode) => {
      const local = history.find((m) => m.id === node.id);
      if (local) {
        setMirror(local);
        window.location.href = "/mirror?view=result#answers";
        return;
      }
      const entry = (library ?? []).find((e) => e.id === node.id);
      if (entry) {
        setMirror(hydrateLibraryEntry(entry));
        window.location.href = "/mirror?view=result#answers";
      }
    },
    [history, library, setMirror],
  );

  /** 右栏只拿得到 id（列表里没有 TopicNode），这里统一解析一次再走同一条路。 */
  const openById = useCallback(
    (id: string) => {
      const node = layout.nodes.find((n) => n.id === id);
      if (node) openTopic(node);
    },
    [layout.nodes, openTopic],
  );

  /** 键盘：Esc 关闭详情，方向键在话题间移动。
   *
   * 这不只是便利 —— WCAG 2.2 要求拖拽操作必须保留键盘路径，方向键就是广场的
   * 键盘路径（另一个是右栏列表）。 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusedId) {
        setFocusedId(null);
        return;
      }
      if (!focusedId) return;
      if (
        e.key !== "ArrowRight" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown"
      ) {
        return;
      }
      const nodes = layout.nodes;
      const i = nodes.findIndex((n) => n.id === focusedId);
      if (i < 0) return;
      const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : i - 1;
      if (next >= 0 && next < nodes.length) {
        e.preventDefault();
        setFocusedId(nodes[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, layout.nodes]);

  /* ------------------------------ 三种页面状态 ------------------------------ */

  if (lib.status === "loading") {
    return (
      <Boot>
        <div className="sq-boot-text">正在铺开广场…</div>
      </Boot>
    );
  }

  /**
   * 加载失败必须和「广场是空的」分开说。
   *
   * 改造前这里把失败 catch 成空数组，于是文件 404 / 部署漏传 / 断网，
   * 用户看到的都是「广场上还没有讨论」—— 那是一句**假话**：
   * 广场上本来有 22 场，只是这次没读到。
   */
  if (lib.status === "error") {
    return (
      <Boot>
        <div className="sq-boot-text">
          广场的数据没能加载出来（{lib.message}）。
          <br />
          这不代表广场是空的 —— 它上面本来有讨论，只是这一次没读到。
        </div>
        <button className="btn btn-primary" onClick={lib.reload} style={{ marginTop: 16 }}>
          重试
        </button>
      </Boot>
    );
  }

  // 筛完为空 ≠ 广场是空的。这两种情况必须分开说：
  //   · 广场真的没有讨论 → 引导去提问
  //   · 只是当前筛选没命中 → 说明还有多少场，并把切换入口留在屏幕上
  // 合并成一句话会让用户以为内容丢了（这是诚实性要求的一部分）。
  if (layout.nodes.length === 0) {
    const label = SCOPE_LABELS.find((s) => s.key === scope)?.label ?? "";
    return (
      <Boot>
        <div className="sq-boot-text">
          {totalCount === 0
            ? "广场上还没有讨论。回首页问一个问题，它就会出现在这里。"
            : scope === "live"
              ? "现在没有正在进行的讨论 —— 分身都答完了，剩下的缺口在等真人。你可以现在开一场。"
              : scope === "mine"
                ? "你还没有提问过。广场上另有 " + totalCount + " 场别人的讨论，可以先去逛逛。"
                : "没有符合「" + label + "」的讨论。广场上共有 " + totalCount + " 场，换一个筛选看看。"}
        </div>
        {/* 空态必须把切换入口留在屏幕上 —— 否则用户没有路切回去。
            这是「筛空」与「真空白」在交互上的关键差别。 */}
        <div className="sq-boot-filters" role="tablist" aria-label="广场筛选">
          {SCOPE_LABELS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={scope === s.key}
              className={"sq-filter" + (scope === s.key ? " sq-filter-on" : "")}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {totalCount === 0 && (
          <Link className="btn btn-primary" href="/" style={{ marginTop: 16 }}>
            去提问 →
          </Link>
        )}
      </Boot>
    );
  }

  return (
    <div className="sq-bleed">
      {narrow ? (
        <SquareStrip
          layout={layout}
          focusedId={focusedId}
          onFocus={(n) => setFocusedId(n?.id ?? null)}
          onOpen={openTopic}
          renderDetail={(node) => <DetailBody node={node} />}
          scope={scope}
          onScope={setScope}
          totalCount={totalCount}
        />
      ) : (
        /* 左广场 + 右现场广播。
           两块**各自滚动、互不控制**：广场锁的是 body 滚动、自己管 transform；
           右栏管自己的 scrollTop。两者不共享任何滚动或高亮状态。 */
        <div className="sq-stage">
          <div className="sq-plaza">
            <SquareCanvas
              layout={layout}
              speeches={speeches}
              clusters={clusters}
              focusedId={focusedId}
              onFocus={(n) => setFocusedId(n?.id ?? null)}
              onOpen={openTopic}
              renderDetail={(node) => <DetailBody node={node} />}
              scope={scope}
              onScope={setScope}
              totalCount={totalCount}
            />
          </div>
          <BroadcastPanel items={broadcast} onOpen={openById} />
        </div>
      )}
    </div>
  );
}

/** 页面级状态（加载 / 出错 / 空）共用的居中容器。 */
function Boot({ children }: { children: React.ReactNode }) {
  return (
    <div className="sq-bleed">
      <div className="sq-boot">{children}</div>
    </div>
  );
}

/**
 * 窄屏探测。
 *
 * 为什么不用 CSS media query 单独做：这不是「样式不同」，是**结构不同** ——
 * 一边是画布 + 拖拽 + 缩放，一边是横向滚动列表。结构性的差异必须在 JS 层解，
 * CSS 只能换皮。
 *
 * 初值用 `false`（先按桌面渲染）而不是同步读 matchMedia：服务端没有 window，
 * 同步读会让首屏 HTML 与客户端不一致（hydration 报错）。挂载后立刻校正，
 * 且此时数据通常还没到、页面还在骨架屏，所以用户看不到「先桌面后移动」的跳变。
 */
function useIsNarrow(px: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [px]);
  return narrow;
}

/**
 * 详情面板的内容。
 *
 * 为什么详情里只给这些：说明要求人群本身「不要塞入完整说明文字」，
 * 完整内容留在 /mirror（用户点「载入工作台」才过去）。
 * 这里给的是「值不值得点进去」所需的判断依据 —— 谁在参与、还缺什么、
 * 一句预览、以及缺口详情。
 *
 * 「在场分身」与「未补缺口」分开列，不合并成「共 N 人」：缺口里的那个人
 * 还没到场，把未来和现在加在一起说就是在替产品吹规模。
 */
function DetailBody({ node }: { node: TopicNode }) {
  const { history } = useMirror();
  const local = history.find((m) => m.id === node.id);

  return (
    <div className="sq-detail-info">
      <div className="sq-detail-grid">
        <div>
          <div className="sq-detail-k">在场分身</div>
          <div className="sq-detail-v">{node.personaCount} 位</div>
        </div>
        <div>
          <div className="sq-detail-k">未补缺口</div>
          <div className="sq-detail-v">{node.openGapCount} 个</div>
        </div>
        <div>
          <div className="sq-detail-k">所属街区</div>
          <div className="sq-detail-v">{node.theme.label}</div>
        </div>
      </div>

      {node.preview && (
        <div className="sq-detail-preview">
          <span className="dim">其中一段是这样的 ——</span>
          <p>{node.preview}</p>
        </div>
      )}

      {local && local.gaps.length > 0 && (
        <div className="sq-detail-gaps dim">
          看山在这一场里发现了 {local.gaps.length} 个缺口 —— 有
          {local.gaps.filter((g) => !g.filledBy).length} 个还等着真人来补。
        </div>
      )}
    </div>
  );
}
