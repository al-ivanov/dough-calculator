import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimit } from "./rate-limit.js";

test("requests past the limit wait for the window", () => {
  const allow = createRateLimit({ limit: 2, windowMs: 1_000 });
  assert.equal(allow("phone", 0), true);
  assert.equal(allow("phone", 10), true);
  assert.equal(allow("phone", 20), false);
  assert.equal(allow("other", 20), true);
  assert.equal(allow("phone", 1_100), true);
});
