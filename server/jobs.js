export const MAX_JOBS = 8;

export function upsertJob(jobs, subscription, endsAt, limit = MAX_JOBS) {
  const next = jobs.filter((job) => job.subscription.endpoint !== subscription.endpoint);
  next.push({ subscription, endsAt, sent: false });
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function cancelJob(jobs, endpoint) {
  return jobs.filter((job) => job.subscription.endpoint !== endpoint);
}

export function dueJobs(jobs, now) {
  return jobs.filter((job) => !job.sent && job.endsAt <= now);
}
