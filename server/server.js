import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { cancelJob, dueJobs, upsertJob } from "./jobs.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(serverDir, "..");
const dataDir = process.env.DATA_DIR || path.join(serverDir, "data");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const contact = process.env.VAPID_CONTACT || "mailto:testo@localhost";
const jobsFile = path.join(dataDir, "jobs.json");
const vapidFile = path.join(dataDir, "vapid.json");

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
  fs.mkdirSync(dataDir, { recursive: true });
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
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${jobsFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(jobs, null, 2)}\n`);
  fs.renameSync(temporary, jobsFile);
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

function keyBytes(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return 0;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").length;
}

function isValidSubscription(subscription) {
  return (
    subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    subscription.endpoint.length <= 2048 &&
    keyBytes(subscription.keys?.p256dh) === 65 &&
    keyBytes(subscription.keys?.auth) === 16
  );
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function dispatchDue() {
  const now = Date.now();
  const jobs = loadJobs();
  const ready = dueJobs(jobs, now);
  if (ready.length === 0) return;

  const sentEndpoints = new Set();
  for (const job of ready) {
    try {
      await webpush.sendNotification(
        job.subscription,
        JSON.stringify({
          title: "Тесто",
          body: "Расстойка закончилась. Тесто можно убирать в холодильник.",
        }),
      );
      sentEndpoints.add(job.subscription.endpoint);
    } catch (error) {
      const status = error.statusCode;
      if (status === 404 || status === 410) {
        sentEndpoints.add(job.subscription.endpoint);
      } else {
        console.error("push failed", status || error.message);
      }
    }
  }

  if (sentEndpoints.size === 0) return;
  saveJobs(loadJobs().filter((job) => !sentEndpoints.has(job.subscription.endpoint)));
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.includes("\0") || pathname === "/server" || pathname.startsWith("/server/")) {
    response.writeHead(404).end("Not found");
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(staticRoot, `.${pathname}`);
  const serverResolved = path.resolve(serverDir);
  const insideSite = file === staticRoot || file.startsWith(`${staticRoot}${path.sep}`);
  const insideServer = file === serverResolved || file.startsWith(`${serverResolved}${path.sep}`);
  if (!insideSite || insideServer) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    if (request.method === "HEAD") {
      response.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  if (url.pathname === "/api/vapid-public-key" && request.method === "GET") {
    sendJson(response, 200, { publicKey: vapid.publicKey });
    return;
  }

  if (url.pathname === "/api/schedule" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const endsAt = Number(body?.endsAt);
      const latest = Date.now() + 48 * 60 * 60 * 1000;
      if (!isValidSubscription(body?.subscription) || !Number.isFinite(endsAt) || endsAt > latest) {
        response.writeHead(400).end("Bad request");
        return;
      }
      saveJobs(upsertJob(loadJobs(), body.subscription, endsAt));
      response.writeHead(204).end();
      dispatchDue().catch((error) => console.error(error));
    } catch {
      response.writeHead(400).end("Bad request");
    }
    return;
  }

  if (url.pathname === "/api/cancel" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const endpoint = body?.endpoint || body?.subscription?.endpoint;
      if (typeof endpoint !== "string") {
        response.writeHead(400).end("Bad request");
        return;
      }
      saveJobs(cancelJob(loadJobs(), endpoint));
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end("Bad request");
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405).end("Method not allowed");
});

setInterval(() => {
  dispatchDue().catch((error) => console.error(error));
}, 15_000);

server.listen(port, host, () => {
  console.log(`testo listening on http://${host}:${port}`);
});
