export function createRateLimit({ limit, windowMs }) {
  const hits = new Map();

  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
