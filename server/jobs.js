export const MAX_JOBS = 8;
export const MAX_PUSH_FAILURES = 5;

export function scheduleJob(jobs, subscription, endsAt, secret, limit = MAX_JOBS) {
  const existing = jobs.find((job) => job.subscription.endpoint === subscription.endpoint);
  if (existing?.secret && existing.secret !== secret) {
    return { ok: false, reason: "forbidden", jobs };
  }
  if (!existing && jobs.length >= limit) {
    return { ok: false, reason: "full", jobs };
  }
  const next = jobs.filter((job) => job.subscription.endpoint !== subscription.endpoint);
  next.push({ subscription, endsAt, secret, failures: 0 });
  return { ok: true, jobs: next };
}

export function cancelJob(jobs, endpoint, secret) {
  return jobs.filter((job) => job.subscription.endpoint !== endpoint || job.secret !== secret);
}

export function dueJobs(jobs, now) {
  return jobs.filter((job) => !job.sent && job.endsAt <= now);
}

export function recordFailure(jobs, endpoint) {
  return jobs.flatMap((job) => {
    if (job.subscription.endpoint !== endpoint) return [job];
    const failures = (job.failures || 0) + 1;
    if (failures >= MAX_PUSH_FAILURES) return [];
    return [{ ...job, failures }];
  });
}
