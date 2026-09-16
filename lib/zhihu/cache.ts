import "server-only";

// 进程内 TTL 缓存 + 同请求去重。
// 热榜 100/天、直答 100/天量级很低，必须缓存，禁止轮询。

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export interface CacheOptions<T = unknown> {
  /**
   * 缓存毫秒数；0 表示不缓存。
   * 传函数时按本次结果动态决定 —— 用于「降级结果只短暂缓存，成功结果长期缓存」。
   */
  ttlMs?: number | ((value: T) => number);
  /** 同一 key 的并发请求合并为一次上游调用。 */
  dedupe?: boolean;
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  opts: CacheOptions<T> = {},
): Promise<T> {
  const { ttlMs = 0, dedupe = true } = opts;

  /** 动态 TTL：拿到结果后再决定缓存多久。 */
  const ttlFor = (value: T): number => (typeof ttlMs === "function" ? ttlMs(value) : ttlMs);

  // 只有 ttl > 0 的结果才会写进 store，所以命中判断不需要再比较配置值。
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  if (hit) store.delete(key);

  if (dedupe) {
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const task = (async () => {
    const value = await fn();
    const ttl = ttlFor(value);
    if (ttl > 0) store.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  })();

  if (dedupe) {
    inflight.set(key, task);
    task.finally(() => inflight.delete(key)).catch(() => {});
  }

  return task;
}

export function clearCache(prefix?: string): void {
  if (!prefix) return store.clear();
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

/** 供健康检查与调试使用。 */
export function cacheStats(): { size: number; inflight: number } {
  return { size: store.size, inflight: inflight.size };
}
