import assert from "node:assert/strict";
import test from "node:test";
import { cancelJob, dueJobs, upsertJob } from "./jobs.js";

const first = { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } };
const second = { endpoint: "https://push.example/b", keys: { p256dh: "p", auth: "a" } };

test("a new schedule replaces the previous one for the same phone", () => {
  const once = upsertJob([], first, 100);
  const twice = upsertJob(once, first, 200);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].endsAt, 200);
  assert.equal(twice[0].sent, false);
});

test("cancel removes only that subscription", () => {
  const jobs = upsertJob(upsertJob([], first, 100), second, 300);
  const left = cancelJob(jobs, first.endpoint);
  assert.deepEqual(left.map((job) => job.subscription.endpoint), [second.endpoint]);
});

test("a full list keeps the newest reminders", () => {
  let jobs = [];
  for (let index = 0; index < 9; index += 1) {
    jobs = upsertJob(jobs, { ...first, endpoint: `https://push.example/${index}` }, index);
  }
  assert.equal(jobs.length, 8);
  assert.equal(jobs[0].endsAt, 1);
  assert.equal(jobs.at(-1).endsAt, 8);
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
