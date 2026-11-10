export const PROOF_HOURS = [1, 2, 3, 4];

export function defaultTimers() {
  return {
    proof: { hours: 2, endsAt: null, notify: "off" },
    ferment: { accumulatedMs: 0, startedAt: null, running: false },
  };
}

export function formatClock(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function dayLabel(days) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return `${days} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${days} дня`;
  return `${days} дней`;
}

export function splitElapsed(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  return {
    daysLabel: dayLabel(days),
    clock: formatClock((total % 86400) * 1000),
  };
}

export function proofRemaining(endsAt, now) {
  if (endsAt == null) return null;
  return Math.max(0, endsAt - now);
}

export function fermentElapsed(timer, now) {
  const base = timer.accumulatedMs || 0;
  if (!timer.running || timer.startedAt == null) return base;
  return base + Math.max(0, now - timer.startedAt);
}

export function startFerment(timer, now) {
  if (timer.running) return timer;
  return {
    accumulatedMs: timer.accumulatedMs || 0,
    startedAt: now,
    running: true,
  };
}

export function pauseFerment(timer, now) {
  return {
    accumulatedMs: fermentElapsed(timer, now),
    startedAt: null,
    running: false,
  };
}

export function resetFerment() {
  return { accumulatedMs: 0, startedAt: null, running: false };
}

export function sanitizeTimers(raw) {
  const fallback = defaultTimers();
  const hours = PROOF_HOURS.includes(raw?.proof?.hours) ? raw.proof.hours : fallback.proof.hours;
  const endsAt = Number.isFinite(raw?.proof?.endsAt) ? raw.proof.endsAt : null;
  const notify = raw?.proof?.notify === "scheduled" || raw?.proof?.notify === "failed" ? raw.proof.notify : "off";
  const accumulatedMs =
    Number.isFinite(raw?.ferment?.accumulatedMs) && raw.ferment.accumulatedMs >= 0
      ? raw.ferment.accumulatedMs
      : 0;
  const running = raw?.ferment?.running === true && Number.isFinite(raw?.ferment?.startedAt);
  return {
    proof: { hours, endsAt, notify },
    ferment: {
      accumulatedMs,
      startedAt: running ? raw.ferment.startedAt : null,
      running,
    },
  };
}
