export const MAX_PROOF_MS = 5 * 60 * 60 * 1000;
export const CLOCK_SKEW_MS = 60 * 1000;

const EXACT_HOSTS = new Set([
  "web.push.apple.com",
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.samsungosp.com",
]);

export function isDeviceSecret(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isSchedulableTime(endsAt, now) {
  return Number.isFinite(endsAt) && endsAt >= now - CLOCK_SKEW_MS && endsAt <= now + MAX_PROOF_MS;
}

export function isPushEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (EXACT_HOSTS.has(host)) return true;
  return host.endsWith(".notify.windows.com") || host.endsWith(".push.services.mozilla.com");
}

function keyBytes(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return 0;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").length;
}

export function isValidSubscription(subscription) {
  return (
    isPushEndpoint(subscription?.endpoint) &&
    keyBytes(subscription?.keys?.p256dh) === 65 &&
    keyBytes(subscription?.keys?.auth) === 16
  );
}
