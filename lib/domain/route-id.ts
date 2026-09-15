/**
 * 路由段 ↔ 领域 id 的还原。
 *
 * ## 为什么需要这一层
 *
 * 本仓库的领域 id 里带冒号：回答是 `ans-persona:<handle>`，分身是
 * `persona:<handle>`（`:` 分隔 kind 与 handle）。把这种 id 放进**路径段**
 * 时，Next.js 交给 `useParams()` 的**不是**原始字符串，而是百分号编码后的
 * 形式 —— 2026-09-15 实测：`/answer/ans-persona:ban-fo-xian-ren` 的 RSC
 * 载荷里，参数值是 `ans-persona%3Aban-fo-xian-ren`。
 * 于是 `a.id === params.id` 恒不成立，「查看详情与追问」100% 落到
 * 「找不到这篇回答」。对照实验：同一个 id 只把冒号换成连字符，页面立刻正常。
 *
 * ## 为什么是「候选集」而不是一次 decodeURIComponent
 *
 * 解码只对「恰好编码一次」成立。而同一个路径在不同到达方式下编码次数并不一致
 * （用户手敲 raw `:`、Next 的 Link 预取、浏览器地址栏回填，实测见过
 * raw / `%3A` / `%253A` 三种形态）。逐个解码并把**全部中间形态**都作为候选，
 * 对这三种都成立，且不依赖「到底是谁编码的」—— 这类 bug 的修法必须与
 * 编码方解耦。
 *
 * 纯函数，无 IO、无 env，所以按目录约定住在 `lib/domain/`，
 * 并可以被 `scripts/check-mirror-shape.mjs` 直接回归。
 */

/**
 * 从一个路由段还原出所有可能的 id 形态（含原样）。
 *
 * 最多解码两次：再多只可能是数据本身含有字面量 `%25`（那不该被继续解码），
 * 继续解会把真实 id 解坏。
 */
export function routeIdCandidates(raw: string): string[] {
  const out = [raw];
  let cur = raw;
  for (let i = 0; i < 2; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      break; // 非法百分号序列：停止解码，用手上这几个候选
    }
    if (next === cur) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/**
 * 在一组 id 里找到与路由段等价的那一条。
 *
 * 返回命中项本身（而不是布尔），因为调用方通常要拿它继续做事 ——
 * 例如 `/answer/[id]` 要拿这条回答去渲染。
 */
export function matchRouteId<T>(items: readonly T[], rawRouteId: string, idOf: (item: T) => string): T | null {
  const wanted = new Set(routeIdCandidates(rawRouteId));
  return items.find((item) => wanted.has(idOf(item))) ?? null;
}
