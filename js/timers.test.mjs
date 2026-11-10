import assert from "node:assert/strict";
import test from "node:test";
import {
  dayLabel,
  fermentElapsed,
  formatClock,
  pauseFerment,
  splitElapsed,
  proofRemaining,
  resetFerment,
  sanitizeTimers,
  startFerment,
} from "./timers.js";

test("formatClock keeps hours beyond a day", () => {
  assert.equal(formatClock(0), "00:00:00");
  assert.equal(formatClock(3661000), "01:01:01");
  assert.equal(formatClock(26 * 3600 * 1000), "26:00:00");
});

test("ferment clock shows whole days separately", () => {
  assert.equal(dayLabel(0), "0 дней");
  assert.equal(dayLabel(1), "1 день");
  assert.equal(dayLabel(2), "2 дня");
  assert.equal(dayLabel(5), "5 дней");
  assert.equal(dayLabel(11), "11 дней");
  assert.equal(dayLabel(21), "21 день");
  assert.equal(dayLabel(22), "22 дня");
  assert.deepEqual(splitElapsed(0), { daysLabel: "0 дней", clock: "00:00:00" });
  assert.deepEqual(splitElapsed(26 * 3600 * 1000 + 1000), { daysLabel: "1 день", clock: "02:00:01" });
});

test("proof remaining is never negative", () => {
  assert.equal(proofRemaining(null, 1000), null);
  assert.equal(proofRemaining(5000, 1000), 4000);
  assert.equal(proofRemaining(5000, 9000), 0);
});

test("ferment pauses without adding closed time", () => {
  const started = startFerment({ accumulatedMs: 0, startedAt: null, running: false }, 1_000);
  assert.equal(fermentElapsed(started, 11_000), 10_000);
  const paused = pauseFerment(started, 11_000);
  assert.equal(fermentElapsed(paused, 999_000), 10_000);
  const resumed = startFerment(paused, 1_000_000);
  assert.equal(fermentElapsed(resumed, 1_004_000), 14_000);
});

test("reset clears the stopwatch", () => {
  assert.deepEqual(resetFerment(), { accumulatedMs: 0, startedAt: null, running: false });
});

test("sanitize drops a pause that was stored as running", () => {
  const timers = sanitizeTimers({
    proof: { hours: 3, endsAt: 50, notify: "scheduled" },
    ferment: { accumulatedMs: 20, running: true },
  });
  assert.equal(timers.proof.hours, 3);
  assert.equal(timers.ferment.running, false);
  assert.equal(timers.ferment.accumulatedMs, 20);
});
