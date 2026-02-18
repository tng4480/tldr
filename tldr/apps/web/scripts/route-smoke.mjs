#!/usr/bin/env node

import assert from "node:assert/strict";

const baseUrl = process.env.WEB_BASE_URL?.replace(/\/+$/, "");
const token = process.env.EXTENSION_BEARER_TOKEN;

if (!baseUrl) {
  console.error("WEB_BASE_URL is required. Example: https://app.example.com");
  process.exit(1);
}

if (!token) {
  console.error("EXTENSION_BEARER_TOKEN is required.");
  process.exit(1);
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function runSimplifySmoke() {
  const request = {
    text: "The committee hereby confirms the meeting on March 12, 2026 at 2 PM.",
    readingLevel: "plain",
    tone: "preserve",
  };

  const first = await postJson("/api/simplify", request);
  assert.equal(first.response.ok, true, `simplify first call failed: ${JSON.stringify(first.payload)}`);
  assert.equal(typeof first.payload.cached, "boolean", "simplify response missing cached");
  assert.equal(first.payload.charged, true, "simplify response must include charged=true");

  const second = await postJson("/api/simplify", request);
  assert.equal(second.response.ok, true, `simplify second call failed: ${JSON.stringify(second.payload)}`);
  assert.equal(second.payload.charged, true, "simplify cache hit must still be charged");
}

async function runWholeTextSmoke() {
  const request = {
    text: "Submit the draft by April 2, 2026. Review meeting on April 5, 2026 at 10:00 UTC.",
    mode: "key_info",
  };

  const first = await postJson("/api/whole-text", request);
  assert.equal(first.response.ok, true, `whole-text first call failed: ${JSON.stringify(first.payload)}`);
  assert.equal(typeof first.payload.cached, "boolean", "whole-text response missing cached");
  assert.equal(first.payload.charged, true, "whole-text response must include charged=true");

  const second = await postJson("/api/whole-text", request);
  assert.equal(second.response.ok, true, `whole-text second call failed: ${JSON.stringify(second.payload)}`);
  assert.equal(second.payload.charged, true, "whole-text cache hit must still be charged");
}

await runSimplifySmoke();
await runWholeTextSmoke();

console.log("Route smoke checks passed.");
