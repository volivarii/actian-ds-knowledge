// Shared per-instance promise memo with TTL — the pattern loadCoverage
// hand-rolled first and loadFreshness needed second. WeakMap keying keeps
// test fakes isolated and drops the cache with the session's client.
//
// Eviction rules:
//   - a REJECTED promise is always evicted (failed probes retry next call)
//   - a RESOLVED value is evicted when `isRetryable(value)` says the result
//     is degraded (empty crawl, half-failed probe) and must not be pinned
//     for the TTL
// The `cache.get(key)?.promise === promise` guard keeps a late settlement
// from evicting a newer entry.

export function memoizeByInstance<K extends object, T>(
  fn: (key: K) => Promise<T>,
  opts: { ttlMs: number; isRetryable?: (value: T) => boolean },
): (key: K) => Promise<T> {
  const cache = new WeakMap<K, { at: number; promise: Promise<T> }>();
  return (key: K) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < opts.ttlMs) return hit.promise;
    const promise = fn(key);
    cache.set(key, { at: Date.now(), promise });
    promise.then(
      (value) => {
        if (opts.isRetryable?.(value) && cache.get(key)?.promise === promise) {
          cache.delete(key);
        }
      },
      () => {
        if (cache.get(key)?.promise === promise) cache.delete(key);
      },
    );
    return promise;
  };
}
