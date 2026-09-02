import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import { createAppServer } from "../server.mjs";
import { projects, resultFor } from "./fixtures.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function modelResponse(data, id = "resp_test") {
  return { id, model: "gpt-5-mini-test", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }] };
}

describe("LLM proxy structured integration", () => {
  let upstream;
  let upstreamUrl;
  let app;
  let appUrl;
  const requests = [];

  before(async () => {
    upstream = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({ headers: request.headers, body });
      const input = JSON.parse(body.input);
      const data = resultFor(input.operation, input, input.artifactKind);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(modelResponse(data, `resp_${requests.length}`)));
    });
    upstreamUrl = await listen(upstream);
    app = createAppServer({ env: { OPENAI_API_KEY: "server-only-test-key", OPENAI_BASE_URL: upstreamUrl, OPENAI_MODEL: "gpt-5-mini-test" } });
    appUrl = await listen(app);
  });

  after(async () => {
    await close(app);
    await close(upstream);
  });

  async function call(operation, payload, artifactKind) {
    const response = await fetch(`${appUrl}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation, artifactKind, payload }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    return body.data;
  }

  async function runProject(project) {
    const context = { project, brief: null, addedContext: { answers: [] }, approvedOutputs: {}, constraints: project.constraints, platform: project.platform };
    const understanding = await call("understandProject", { context });
    context.brief = { ...understanding.brief, approved: true, revision: 1 };
    const insights = await call("generateInsights", { context });
    context.approvedOutputs.userInsight = insights;
    const principles = await call("generatePrinciples", { context });
    context.approvedOutputs.experiencePrinciples = principles;
    const flow = await call("generateUserFlow", { context });
    context.approvedOutputs.userFlow = flow;
    const screens = await call("generateScreenStructure", { context });
    context.approvedOutputs.screenStructure = screens;
    const prototype = await call("generatePrototype", { context, prototypeOptions: { version: 1, previous: null } });
    const review = await call("reviewPrototype", { context, prototype, reviewOptions: { round: 1 } });
    const issue = review.issues.find((item) => item.status === "open");
    const revised = await call("reviseArtifact", { context, artifact: prototype, userInstruction: issue.recommendation }, "prototypeV2");
    const reReview = await call("reviewPrototype", { context, prototype: revised, reviewOptions: { round: 2, previousReview: review } });
    return { understanding, insights, principles, flow, screens, prototype, review, revised, reReview };
  }

  test("ADHD reading and ecommerce operations produce distinct data through every required node", async () => {
    const reading = await runProject(projects.reading);
    const commerce = await runProject(projects.commerce);

    assert.match(reading.understanding.brief.productType, /ADHD|阅读/);
    assert.match(commerce.understanding.brief.productType, /电商|运营/);
    assert.notDeepEqual(reading.insights, commerce.insights);
    assert.notEqual(reading.principles.principles[0].title, commerce.principles.principles[0].title);
    assert.notEqual(reading.flow.happyPath[0], commerce.flow.happyPath[0]);
    assert.notEqual(reading.screens.screens[0].name, commerce.screens.screens[0].name);
    assert.notEqual(reading.prototype.ui.productLabel, commerce.prototype.ui.productLabel);
    assert.match(reading.review.summary, /阅读/);
    assert.match(commerce.review.summary, /订单/);
    assert.equal(reading.revised.version, "V2");
    assert.equal(commerce.revised.version, "V2");
    assert.equal(reading.reReview.issues.some((item) => item.status === "open"), false);
    assert.equal(commerce.reReview.issues.some((item) => item.status === "open"), false);

    for (const captured of requests) {
      assert.equal(captured.headers.authorization, "Bearer server-only-test-key");
      assert.equal(captured.body.text.format.type, "json_schema");
      assert.equal(captured.body.text.format.strict, true);
      assert.equal(captured.body.store, false);
      assert.ok(captured.body.instructions.includes("Never return chain-of-thought"));
    }
  });

  test("missing context is model output and only asks for actually absent fields", async () => {
    const incomplete = { ...projects.commerce, constraints: "", additionalContext: "" };
    const result = await call("understandProject", { context: { project: incomplete } });
    assert.deepEqual(result.missingContext.map((item) => item.field), ["constraints", "additionalContext"]);
    assert.match(result.missingContext[0].prompt, /订单|权限|审计/);
  });
});

test("invalid model JSON is retried once and then validated", async () => {
  let attempts = 0;
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")).input);
    attempts += 1;
    const body = attempts === 1
      ? { id: "bad", model: "test", output: [{ type: "message", content: [{ type: "output_text", text: "{not-json" }] }] }
      : modelResponse(resultFor(input.operation, input, input.artifactKind), "good");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  });
  const upstreamUrl = await listen(upstream);
  const app = createAppServer({ env: { OPENAI_API_KEY: "test", OPENAI_BASE_URL: upstreamUrl } });
  const appUrl = await listen(app);
  try {
    const response = await fetch(`${appUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "understandProject", payload: { context: { project: projects.reading } } }) });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.meta.attempts, 2);
    assert.equal(attempts, 2);
  } finally {
    await close(app);
    await close(upstream);
  }
});

test("missing key and repeated upstream failure return safe structured API errors", async () => {
  const unconfigured = createAppServer({ env: {} });
  const unconfiguredUrl = await listen(unconfigured);
  try {
    const health = await (await fetch(`${unconfiguredUrl}/api/health`)).json();
    assert.equal(health.configured, false);
    const response = await fetch(`${unconfiguredUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generateInsights", payload: { context: { project: projects.reading } } }) });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "AI_NOT_CONFIGURED");
  } finally {
    await close(unconfigured);
  }

  let attempts = 0;
  const failingUpstream = createServer((request, response) => {
    attempts += 1;
    request.resume();
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "temporary upstream failure" } }));
  });
  const failingUrl = await listen(failingUpstream);
  const app = createAppServer({ env: { OPENAI_API_KEY: "test", OPENAI_BASE_URL: failingUrl } });
  const appUrl = await listen(app);
  try {
    const response = await fetch(`${appUrl}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "generateInsights", payload: { context: { project: projects.commerce } } }) });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error.code, "AI_API_ERROR");
    assert.equal(body.error.retryable, true);
    assert.equal(attempts, 2);
  } finally {
    await close(app);
    await close(failingUpstream);
  }
});
