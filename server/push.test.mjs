import assert from "node:assert/strict";
import test from "node:test";
import { isPushEndpoint, isSchedulableTime, isValidSubscription } from "./push.js";

const keys = {
  p256dh: Buffer.alloc(65, 1).toString("base64url"),
  auth: Buffer.alloc(16, 2).toString("base64url"),
};

test("only browser push services are accepted", () => {
  assert.equal(isPushEndpoint("https://web.push.apple.com/Q"), true);
  assert.equal(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isPushEndpoint("https://wns2-pn1p.notify.windows.com/w/?token=1"), true);
  assert.equal(isPushEndpoint("https://127.0.0.1/secret"), false);
  assert.equal(isPushEndpoint("https://192.168.1.10/"), false);
  assert.equal(isPushEndpoint("https://[::1]/"), false);
  assert.equal(isPushEndpoint("https://evil.example/push"), false);
  assert.equal(isPushEndpoint("https://web.push.apple.com:8443/Q"), false);
  assert.equal(isPushEndpoint("https://user:pass@web.push.apple.com/Q"), false);
  assert.equal(isPushEndpoint("http://web.push.apple.com/Q"), false);
});

test("a subscription needs real key sizes and a push host", () => {
  assert.equal(isValidSubscription({ endpoint: "https://web.push.apple.com/Q", keys }), true);
  assert.equal(isValidSubscription({ endpoint: "https://127.0.0.1/", keys }), false);
  assert.equal(
    isValidSubscription({ endpoint: "https://web.push.apple.com/Q", keys: { p256dh: "aa", auth: "bb" } }),
    false,
  );
});

test("a reminder can only be set a few hours ahead", () => {
  const now = 1_000_000;
  assert.equal(isSchedulableTime(now + 20_000, now), true);
  assert.equal(isSchedulableTime(now + 4 * 60 * 60 * 1000, now), true);
  assert.equal(isSchedulableTime(now - 2 * 60 * 1000, now), false);
  assert.equal(isSchedulableTime(now + 6 * 60 * 60 * 1000, now), false);
});
