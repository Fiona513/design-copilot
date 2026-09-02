import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppServer, getConfig } from "../server.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("Render configuration defaults to PORT or 3000 and binds 0.0.0.0", () => {
  const fallback = getConfig({});
  assert.equal(fallback.port, 3000);
  assert.equal(fallback.host, "0.0.0.0");
  assert.equal(getConfig({ PORT: "4310" }).port, 4310);
  assert.equal(getConfig({ PORT: "bad" }).port, 3000);
  assert.equal(getConfig({ OPENAI_TIMEOUT_MS: "999999" }).timeoutMs, 120000);
  assert.equal(getConfig({ OPENAI_MAX_OUTPUT_TOKENS: "999999" }).maxOutputTokens, 5000);
  assert.equal(getConfig({ AI_RATE_LIMIT_PER_MINUTE: "999999" }).rateLimitPerMinute, 300);
});

test("static root, health aliases, body limit and per-IP rate limit are available", async () => {
  const server = createAppServer({ env: { AI_RATE_LIMIT_PER_MINUTE: "1" } });
  const baseUrl = await listen(server);
  try {
    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Design Copilot/);

    const asset = await fetch(`${baseUrl}/assets/branding/agent-logo.png`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /image\/png/);

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const apiHealth = await fetch(`${baseUrl}/api/health`);
    assert.equal(apiHealth.status, 200);

    const firstAgent = await fetch(`${baseUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generateInsights", payload: {} }) });
    assert.equal(firstAgent.status, 503);
    assert.equal((await firstAgent.json()).error.code, "AI_NOT_CONFIGURED");

    const secondAgent = await fetch(`${baseUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generateInsights", payload: {} }) });
    assert.equal(secondAgent.status, 429);
    assert.equal((await secondAgent.json()).error.code, "RATE_LIMITED");
    assert.ok(secondAgent.headers.get("retry-after"));
  } finally {
    await close(server);
  }

  const bodyLimitServer = createAppServer({ env: { AI_RATE_LIMIT_PER_MINUTE: "30" } });
  const bodyLimitUrl = await listen(bodyLimitServer);
  try {
    const oversized = await fetch(`${bodyLimitUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(1_000_001) });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, "REQUEST_TOO_LARGE");
  } finally {
    await close(bodyLimitServer);
  }
});
