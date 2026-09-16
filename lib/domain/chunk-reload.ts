/**
 * 「资产过期」的识别与自愈 —— 纯函数，无 React、无 DOM 依赖。
 *
 * ## 它解决的是什么
 *
 * 本项目自托管 + push 到 main 自动构建部署（见 `docs/self-hosting.md`）。
 * 每次部署都会替换 `.next/static/chunks/*`，且线上实测：
 *
 *   · HTML：`Cache-Control: s-maxage=31536000, stale-while-revalidate`
 *   · chunk：`Cache-Control: public, max-age=31536000, immutable`
 *
 * 于是**部署前打开、部署后仍开着的那个标签页**，手里握着一份过期的 chunk 名单。
 * 它下一次客户端跳转就会去取一个**已经不在磁盘上**的文件。
 *
 * ## 实测（2026-09-16，本机 `next start` + 从磁盘删掉一个页面级 chunk）
 *
 *   1. 资源层：`window.addEventListener("error", ..., true)` 能收到
 *      `SCRIPT: /_next/static/chunks/app/(explore)/personas/page-*.js`
 *   2. 运行时：抛 `Uncaught ChunkLoadError: Loading chunk 36 failed`
 *   3. 界面：**`app/error.tsx` 会捕获它**，但文案是「这一步出了点问题……可以重试」——
 *      而 `reset()` 只是重新渲染，**不会**重新下载那个已经消失的 chunk，
 *      用户点几次都一样。
 *   4. 更糟的一种时序：页面停在 `app/loading.tsx`（「正在准备内容」）
 *      或 `SquareField` 的「正在铺开广场…」，**错误界面始终不出现**，
 *      用户看到的是永久转圈。
 *
 * 所以既有 UI 的问题是「**提示与行动不匹配**」：它把「资产过期」讲成了
 * 「页面出了点问题，重试一下」。前者唯一的正解是**带着新清单重新进来**（等价于 F5）。
 *
 * ## 为什么「自动重载一次」是对的，不是作弊
 *
 * 这个错误不是用户操作导致、也不是代码 bug —— 是「我手里的资产地址过期了」。
 * 刷新一次就会拿到与服务端当前构建匹配的清单。但必须**防死循环**：
 * 用 sessionStorage 记时间戳，同一标签页 60 秒内只自动重载一次；
 * 第二次仍失败就停下来，把控制权交还用户（显示手动刷新按钮）。
 */

/** 同一标签页内自动重载的最小间隔；也用于「刚重载过就别再自动重载」。 */
export const RELOAD_GUARD_MS = 60_000;

const RELOAD_KEY = "no.2zhihu:chunk-reload-at";

/**
 * 这是不是「资产加载失败」这一类错误？
 *
 * 刻意只认这一类：把所有运行时错误都当成「刷新一下就好」会掩盖真实 bug。
 * 判据来自实测（本文件头部记录的那次复现）与 webpack / Next 的已知形态。
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string; digest?: string };
  const s = `${e.name ?? ""} ${e.message ?? ""}`;
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk \d+ failed/i.test(s) ||
    /Loading CSS chunk/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s) ||
    // webpack 在某些打包形态下只留下这句
    /Cannot read properties of undefined \(reading 'call'\)/i.test(s)
  );
}

/**
 * 现在可以自动重载吗？会**写入**时间戳（即调用一次就算用掉这次机会）。
 *
 * 用 sessionStorage 而不是 localStorage：只在本标签页生效，
 * 用户开两个标签页时互不影响。
 *
 * 拿不到 sessionStorage 时（隐私模式等）返回 false —— 保守处理：
 * 宁可不自动重载、只显示手动按钮，也不要冒「刷新风暴」的风险。
 */
export function markAutoReload(now: number = Date.now()): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** 用户手动刷新成功后不必清标记 —— 60 秒后自然过期，逻辑更简单。 */
export function lastAutoReloadAt(): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}
