/**
 * 来源（证据）相关的纯函数。
 *
 * 为什么单独一个文件：这三件事过去散落在两层，且各自有各的判断：
 *   · 可信度公式在 `lib/server/mirror.ts`（服务端编排层）
 *   · 链接清洗与「能不能展示」在 `lib/domain/library.ts`（广场读取层）
 * 结果就是同一条来源在**回答页**、**镜像页证据时间轴**、**广场库**三处
 * 分别被判断一次，很容易漂移成「一处能点、一处点不动」。
 *
 * 放在 `lib/domain`：这一层是纯函数，不碰网络、不读 env、不引 React。
 * `lib/server`（mirror.ts）与 `scripts/build-library.mjs` 都往下依赖它 ——
 * 方向单向，不会形成 domain → server 的反向引用。
 */

/**
 * 可信度：**只由「拿到几条真实来源」决定**，不引入任何模型自评分。
 *
 * 为什么强调这一点：让模型给自己打可信度，等于请它自证——
 * 实测模型的自评分与来源质量几乎无关，恒定偏高。
 * 所以这里是一个确定性的阶梯函数，可以被自检复现。
 *
 * 原实现（2026-09-15 之前）在 `lib/server/mirror.ts`；移到 domain 是为了
 * 让广场库还原出来的来源能算出**同一个**数字 —— 镜像页的「证据覆盖」问的是
 * 「本次回答覆盖了多少可核对证据」，就该用本次检索到的来源数来算，
 * 而不是拿人格语料派生出来的那个数（那衡量的是人格蒸馏质量，不是这一次的覆盖）。
 */
export function confidenceOf(sources: readonly { title: string }[]): number {
  if (sources.length === 0) return 0;
  return Number(Math.min(0.35 + sources.length * 0.22, 0.95).toFixed(2));
}

/**
 * 去掉开放平台附加的渠道统计参数
 *（`?utm_medium=openapi_platform&utm_source=cf621feb3f2d`）。
 *
 * 为什么值得专门做：广场库里近 200 条链接，每条多约 50 字符（约 10KB），
 * 而这些参数对用户毫无意义、只会让演示时贴在屏幕上的链接显得脏。
 * 链接主体不变，仍是真实来源地址；只删 `utm_*`，其余 query 原样保留。
 */
export function cleanSourceUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
    }
    const rest = parsed.searchParams.toString();
    parsed.search = rest ? "?" + rest : "";
    return parsed.toString();
  } catch {
    // 不是合法 URL 就原样返回 —— 清洗是锦上添花，不该因此丢掉一条来源。
    return url;
  }
}

/**
 * 把上游返回的作者名规整成可展示的值。
 *
 * ⚠️ 为什么不能沿用 `item.AuthorName ?? "匿名用户"`：
 * 开放平台对**同一条内容**可能一次返回作者名、一次返回空串
 *（实测：`question/482967753/answer/2096000577` 两次请求分别得到
 * "Jackie Lee" 与 ""）。`??` 只在 `null/undefined` 时兜底，
 * 空串会原样穿过去 → 渲染成一个空白胶囊。
 * 但也不能因此改成「空串就写匿名用户」—— 那条内容并不是匿名回答，
 * 作者是 Jackie Lee。把实名作者标成匿名是编造（铁律 2）。
 * 所以这里**如实保留为空**，由 `isDisplayableSource()` 决定不展示。
 */
export function normalizeAuthorName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * 「可展示」的判据，直接对应 AGENTS.md §1 铁律 3：
 * 展示知乎内容必须带 `AuthorName` 与 `Url`。
 *
 * 为什么需要它：消费端过去无条件渲染 `<a href={e.url}>{e.author}</a>`，
 * 缺字段时会出现**空链接 + 空署名胶囊** —— 既点不动，又看起来像坏了，
 * 而且「N 条真实知乎来源」这句话本身变成了假话。
 * 与其渲染一个假来源，不如不渲染，并把条数如实报出来。
 */
export function isDisplayableSource(s: { title?: string; author?: string; url?: string }): boolean {
  return Boolean(s.title?.trim() && s.author?.trim() && s.url?.trim());
}

/**
 * 把来源分成「可展示」与「未归属」两组。
 *
 * 抽成函数是为了让两处消费端（回答页 / 证据时间轴）用**同一条判据**，
 * 否则迟早出现「回答页说 3 条、时间轴列了 5 条」这种自相矛盾。
 */
export function splitSources<T extends { title?: string; author?: string; url?: string }>(
  sources: readonly T[] | undefined,
): { displayable: T[]; unattributed: number } {
  const list = Array.from(sources ?? []);
  const displayable = list.filter(isDisplayableSource);
  return { displayable, unattributed: list.length - displayable.length };
}
