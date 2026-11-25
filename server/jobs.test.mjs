import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PUSH_FAILURES, cancelJob, dueJobs, recordFailure, scheduleJob } from "./jobs.js";

const secret = "a".repeat(43);
const other = "b".repeat(43);
const first = { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } };
const second = { endpoint: "https://push.example/b", keys: { p256dh: "p", auth: "a" } };

function accept(jobs, subscription, endsAt, phoneSecret = secret) {
  const result = scheduleJob(jobs, subscription, endsAt, phoneSecret);
  assert.equal(result.ok, true);
  return result.jobs;
}

test("a new schedule replaces the previous one for the same phone", () => {
  const once = accept([], first, 100);
  const twice = accept(once, first, 200);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].endsAt, 200);
  assert.equal(twice[0].failures, 0);
});

test("another phone cannot replace or cancel a reminder", () => {
  const jobs = accept([], first, 100);
  const replaced = scheduleJob(jobs, first, 200, other);
  assert.equal(replaced.ok, false);
  assert.equal(replaced.reason, "forbidden");
  assert.equal(cancelJob(jobs, first.endpoint, other).length, 1);
  assert.equal(cancelJob(jobs, first.endpoint, secret).length, 0);
});

test("cancel removes only that subscription", () => {
  const jobs = accept(accept([], first, 100), second, 300);
  const left = cancelJob(jobs, first.endpoint, secret);
  assert.deepEqual(left.map((job) => job.subscription.endpoint), [second.endpoint]);
});

test("a full list keeps existing reminders", () => {
  let jobs = [];
  for (let index = 0; index < 8; index += 1) {
    jobs = accept(jobs, { ...first, endpoint: `https://push.example/${index}` }, index);
  }
  const extra = scheduleJob(jobs, { ...first, endpoint: "https://push.example/new" }, 9, secret);
  assert.equal(extra.ok, false);
  assert.equal(extra.reason, "full");
  assert.equal(extra.jobs.length, 8);
  assert.equal(extra.jobs[0].endsAt, 0);
  const refreshed = scheduleJob(jobs, jobs[0].subscription, 40, secret);
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.jobs.length, 8);
});

test("a reminder is dropped after repeated delivery failures", () => {
  let jobs = accept([], first, 100);
  for (let attempt = 1; attempt < MAX_PUSH_FAILURES; attempt += 1) {
    jobs = recordFailure(jobs, first.endpoint);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].failures, attempt);
  }
  assert.equal(recordFailure(jobs, first.endpoint).length, 0);
});

test("due jobs are the ones whose time has come", () => {
  const jobs = [
    { subscription: first, endsAt: 100, sent: false },
    { subscription: second, endsAt: 500, sent: false },
    { subscription: { ...first, endpoint: "https://push.example/c" }, endsAt: 50, sent: true },
  ];
  assert.deepEqual(
    dueJobs(jobs, 200).map((job) => job.endsAt),
    [100],
  );
});
