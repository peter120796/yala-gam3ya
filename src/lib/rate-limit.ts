/**
 * Small sliding-window rate limiter (per server instance). It blunts abuse of
 * server actions; Firebase Auth applies its own limits to sign-in, reset and
 * OTP endpoints. For multi-instance strictness, swap the store for Redis
 * (e.g. Upstash) — the call sites don't change.
 */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimit(key: string, maxPerMinute: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= maxPerMinute) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}
