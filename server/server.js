import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { cancelJob, dueJobs, recordFailure, scheduleJob } from "./jobs.js";
import { isDeviceSecret, isPushEndpoint, isSchedulableTime, isValidSubscription } from "./push.js";
import { createRateLimit } from "./rate-limit.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(serverDir, "..");
const dataDir = process.env.DATA_DIR || path.join(serverDir, "data");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const contact = process.env.VAPID_CONTACT || "mailto:testo@localhost";
const jobsFile = path.join(dataDir, "jobs.json");
const vapidFile = path.join(dataDir, "vapid.json");

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; worker-src 'self'; manifest-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

const allowSchedule = createRateLimit({ limit: 15, windowMs: 10 * 60 * 1000 });
const allowCancel = createRateLimit({ limit: 15, windowMs: 10 * 60 * 1000 });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadVapid() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
  if (fs.existsSync(vapidFile)) {
    return JSON.parse(fs.readFileSync(vapidFile, "utf8"));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidFile, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
  return keys;
}

const vapid = loadVapid();
webpush.setVapidDetails(contact, vapid.publicKey, vapid.privateKey);

function loadJobs() {
  try {
    const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
  const temporary = `${jobsFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(jobs, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, jobsFile);
  fs.chmodSync(jobsFile, 0o600);
}

function clientAddress(request) {
  return request.socket.remoteAddress || "unknown";
}

function reply(response, status, body, headers = {}) {
  response.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  if (body === undefined) response.end();
  else response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : null);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  reply(response, status, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8" });
}

async function dispatchDue() {
  const now = Date.now();
  const jobs = loadJobs();
  const ready = dueJobs(jobs, now);
  if (ready.length === 0) return;

  const sentEndpoints = new Set();
  const failedEndpoints = new Set();
  for (const job of ready) {
    const endpoint = job.subscription.endpoint;
    if (!isPushEndpoint(endpoint)) {
      sentEndpoints.add(endpoint);
      continue;
    }
    try {
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({
          title: "Тесто",
          body: "Расстойка закончилась. Тесто можно убирать в холодильник.",
        }),
      );
      sentEndpoints.add(endpoint);
    } catch (error) {
      const status = error.statusCode;
      if (status === 404 || status === 410) {
        sentEndpoints.add(endpoint);
      } else {
        failedEndpoints.add(endpoint);
        console.error("push failed", status || error.message);
      }
    }
  }

  if (sentEndpoints.size === 0 && failedEndpoints.size === 0) return;
  let remaining = loadJobs().filter((job) => !sentEndpoints.has(job.subscription.endpoint));
  for (const endpoint of failedEndpoints) remaining = recordFailure(remaining, endpoint);
  saveJobs(remaining);
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes("\0") || pathname === "/server" || pathname.startsWith("/server/")) {
    reply(response, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(staticRoot, `.${pathname}`);
  const serverResolved = path.resolve(serverDir);
  const insideSite = file === staticRoot || file.startsWith(`${staticRoot}${path.sep}`);
  const insideServer = file === serverResolved || file.startsWith(`${serverResolved}${path.sep}`);
  if (!insideSite || insideServer) {
    reply(response, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      reply(response, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
      return;
    }
    const headers = {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    };
    if (request.method === "HEAD") {
      reply(response, 200, undefined, headers);
      return;
    }
    reply(response, 200, data, headers);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  if (url.pathname === "/api/vapid-public-key" && request.method === "GET") {
    sendJson(response, 200, { publicKey: vapid.publicKey });
    return;
  }

  if (url.pathname === "/api/schedule" && request.method === "POST") {
    if (!allowSchedule(clientAddress(request))) {
      reply(response, 429, "Too many requests", { "content-type": "text/plain; charset=utf-8" });
      return;
    }
    try {
      const body = await readBody(request);
      const endsAt = Number(body?.endsAt);
      if (!isValidSubscription(body?.subscription) || !isDeviceSecret(body?.secret) || !isSchedulableTime(endsAt, Date.now())) {
        reply(response, 400, "Bad request", { "content-type": "text/plain; charset=utf-8" });
        return;
      }
      const result = scheduleJob(loadJobs(), body.subscription, endsAt, body.secret);
      if (!result.ok) {
        const status = result.reason === "full" ? 429 : 403;
        reply(response, status, result.reason === "full" ? "Too many requests" : "Forbidden", {
          "content-type": "text/plain; charset=utf-8",
        });
        return;
      }
      saveJobs(result.jobs);
      reply(response, 204);
      dispatchDue().catch((error) => console.error(error));
    } catch {
      reply(response, 400, "Bad request", { "content-type": "text/plain; charset=utf-8" });
    }
    return;
  }

  if (url.pathname === "/api/cancel" && request.method === "POST") {
    if (!allowCancel(clientAddress(request))) {
      reply(response, 429, "Too many requests", { "content-type": "text/plain; charset=utf-8" });
      return;
    }
    try {
      const body = await readBody(request);
      const endpoint = body?.endpoint || body?.subscription?.endpoint;
      if (!isPushEndpoint(endpoint) || !isDeviceSecret(body?.secret)) {
        reply(response, 400, "Bad request", { "content-type": "text/plain; charset=utf-8" });
        return;
      }
      saveJobs(cancelJob(loadJobs(), endpoint, body.secret));
      reply(response, 204);
    } catch {
      reply(response, 400, "Bad request", { "content-type": "text/plain; charset=utf-8" });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  reply(response, 405, "Method not allowed", { "content-type": "text/plain; charset=utf-8" });
});

setInterval(() => {
  dispatchDue().catch((error) => console.error(error));
}, 15_000);

server.listen(port, host, () => {
  console.log(`testo listening on http://${host}:${port}`);
});
