import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, test } from "node:test";
import { projects, resultFor } from "./fixtures.mjs";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

function classList() {
  const values = new Set();
  return {
    add: (...items) => items.forEach((item) => values.add(item)),
    remove: (...items) => items.forEach((item) => values.delete(item)),
    toggle(item, force) {
      if (force === true) values.add(item);
      else if (force === false) values.delete(item);
      else if (values.has(item)) values.delete(item);
      else values.add(item);
      return values.has(item);
    },
    contains: (item) => values.has(item),
  };
}

function element(extra = {}) {
  return {
    textContent: "",
    innerHTML: "",
    disabled: false,
    className: "",
    classList: classList(),
    dataset: {},
    style: {},
    value: "",
    addEventListener() {},
    setAttribute() {},
    append() {},
    appendChild() {},
    insertAdjacentHTML(_position, html) { this.innerHTML += html; },
    remove() {},
    focus() {},
    click() {},
    close() { this.open = false; },
    showModal() { this.open = true; },
    matches() { return false; },
    closest() { return null; },
    ...extra,
  };
}

function makeStorage(seed = new Map()) {
  return {
    data: seed,
    getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
    setItem(key, value) { this.data.set(key, String(value)); },
    removeItem(key) { this.data.delete(key); },
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function makeHarness({ storage = makeStorage(), fetchMode = "model" } = {}) {
  const handlers = {};
  const calls = [];
  const dom = {
    "#context-content": element(), "#canvas-content": element(), "#agent-content": element(), "#canvas-title": element(), "#canvas-eyebrow": element(), "#canvas-meta": element(), "#project-status": element(),
    ".agent-state-text": element(), "#next-step-copy": element(), ".footer-primary": element(), ".terminate-task": element(), ".export-button": element(),
    "#history-dialog": element(), "#history-list": element(), "#confirm-dialog": element(), ".mvp-toast": element(), ".provider-badge": element(),
  };
  const forms = {};
  const standalone = {};
  const document = {
    body: element(),
    querySelector(selector) { return forms[selector] || standalone[selector] || dom[selector] || null; },
    querySelectorAll(selector) {
      if (selector === ".steps .step") return [element(), element(), element(), element()];
      if (selector === ".steps em") return [element(), element(), element()];
      return [];
    },
    addEventListener(type, callback) { handlers[type] = callback; },
    createElement() { return element(); },
  };
  class FakeFormData {
    constructor(form) { this.values = form?._data || {}; }
    get(key) { return this.values[key] ?? null; }
  }

  const fetchImpl = (url, options = {}) => {
    const request = JSON.parse(options.body || "{}");
    calls.push({ url, request });
    if (options.signal?.aborted) return Promise.reject(abortError());
    if (fetchMode === "failure") return Promise.resolve(response(503, { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "No server key", retryable: false } }));
    if (fetchMode === "pending") return new Promise((resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(abortError()), { once: true });
    });
    const data = resultFor(request.operation, request.payload, request.artifactKind);
    return Promise.resolve(response(200, { ok: true, data, meta: { provider: "openai", model: "gpt-5-mini-test", responseId: `front_${calls.length}`, attempts: 1 } }));
  };

  const window = { setTimeout(callback) { callback(); return 1; }, clearTimeout() {}, location: { reload() {} } };
  const context = {
    window, document, localStorage: storage, FormData: FakeFormData, navigator: {}, fetch: fetchImpl,
    Blob, URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} }, AbortController, Intl, Date, Math, JSON, console,
  };
  vm.createContext(context);
  vm.runInContext(appSource, context, { filename: "app.js" });

  function setForm(selector, data) {
    forms[selector] = element({
      _data: data,
      elements: Object.fromEntries(Object.keys(data).map((key) => [key, { value: data[key] }])),
      matches(target) { return target === selector; },
      querySelector() { return element(); },
    });
  }
  function setElement(selector, data) { standalone[selector] = element(data); }
  function submit(selector) {
    assert.ok(forms[selector], `Missing mocked form ${selector}`);
    handlers.submit({ target: forms[selector], preventDefault() {} });
  }
  function click(action, data = {}) {
    const button = element({ dataset: { action, ...data }, closest(selector) { return selector === "[data-action]" ? this : null; } });
    handlers.click({ target: button });
  }
  const debug = window.DesignCopilotDebug;
  return { storage, calls, setForm, setElement, submit, click, state: debug.getState, history: debug.getHistory, wait: debug.waitForIdle, retryLLM: debug.retryWithLLM, retryLocal: debug.retryWithLocalDemo };
}

function projectForm(project, preset = "adhd") {
  return { preset, ...project };
}

function briefForm(state) {
  return { goal: state.brief.goal, targetUser: state.brief.targetUser, productType: state.brief.productType, platform: state.brief.platform, mainProblem: state.brief.mainProblem, constraints: state.brief.constraints };
}

async function approveAndWait(harness, key) {
  harness.click("approve-artifact", { key });
  await harness.wait();
}

describe("browser task state with LLMProvider", () => {
  test("ecommerce input completes unchanged Golden Path with Ask Agent, Regenerate, Apply Fix, Re-review, History and persistence", async () => {
    const harness = makeHarness();
    harness.setForm("#project-form", projectForm(projects.commerce, "commerce"));
    harness.submit("#project-form");
    await harness.wait();
    let state = harness.state();
    assert.equal(state.status, "brief-approval");
    assert.equal(state.runtime.provider, "llm");
    assert.match(state.brief.productType, /电商/);

    harness.setForm("#brief-form", briefForm(state));
    harness.click("approve-brief");
    await harness.wait();
    state = harness.state();
    assert.equal(state.status, "user-insight");
    assert.match(state.outputs.userInsight.goals[0], /异常订单/);

    const callsBeforeRevision = harness.calls.length;
    harness.setElement("#revision-instruction", { value: "强调多人批量操作的权限边界" });
    harness.click("submit-revision", { key: "userInsight" });
    await harness.wait();
    state = harness.state();
    assert.match(state.outputs.userInsight.implications[0], /权限边界/);
    assert.equal(harness.calls.length, callsBeforeRevision + 1);
    assert.equal(harness.calls.at(-1).request.operation, "reviseArtifact");

    const generationAfterRevision = state.outputs.userInsight.generation;
    harness.click("regenerate", { key: "userInsight" });
    await harness.wait();
    state = harness.state();
    assert.equal(state.outputs.userInsight.generation, generationAfterRevision + 1);
    assert.equal(harness.calls.at(-1).request.operation, "generateInsights");

    await approveAndWait(harness, "userInsight");
    await approveAndWait(harness, "experiencePrinciples");
    await approveAndWait(harness, "userFlow");
    await approveAndWait(harness, "screenStructure");
    state = harness.state();
    assert.equal(state.status, "prototype-v1");
    assert.equal(state.outputs.prototypes.v1.ui.productLabel, "SELLER COMMAND CENTER");

    await approveAndWait(harness, "prototypeV1");
    state = harness.state();
    assert.equal(state.status, "review-v1");
    const openIssue = state.reviews[0].issues.find((issue) => issue.status === "open");
    assert.match(openIssue.problem, /批量订单/);

    harness.click("apply-fix", { id: openIssue.id });
    await harness.wait();
    state = harness.state();
    assert.equal(state.status, "prototype-v2");
    assert.equal(state.outputs.prototypes.v1.settings.touchTarget, 40);
    assert.equal(state.outputs.prototypes.v2.settings.touchTarget, 52);
    assert.equal(state.iterations.length, 1);

    harness.click("rereview");
    await harness.wait();
    state = harness.state();
    assert.equal(state.status, "review-v2");
    assert.equal(state.reviews[1].issues.some((issue) => issue.status === "open"), false);

    harness.click("complete");
    state = harness.state();
    assert.equal(state.status, "complete");
    assert.equal(state.plan.every((step) => step.status === "completed"), true);
    assert.equal(harness.history().length, 1);

    const restored = makeHarness({ storage: harness.storage });
    const restoredState = restored.state();
    assert.equal(restoredState.status, "complete");
    assert.equal(restoredState.runtime.isRunning, false);
    assert.equal(restoredState.outputs.prototypes.v2.ui.productLabel, "SELLER COMMAND CENTER");
  });

  test("API failure falls back locally, exposes retry state, and can explicitly continue with LocalDemoProvider", async () => {
    const harness = makeHarness({ fetchMode: "failure" });
    harness.setForm("#project-form", projectForm(projects.commerce, "commerce"));
    harness.submit("#project-form");
    await harness.wait();
    let state = harness.state();
    assert.equal(state.runtime.provider, "local-demo");
    assert.equal(state.runtime.providerWarning.code, "AI_NOT_CONFIGURED");
    assert.match(state.brief.productType, /数字产品|电商|后台/);

    await harness.retryLLM();
    state = harness.state();
    assert.equal(state.runtime.error.code, "AI_NOT_CONFIGURED");
    assert.equal(state.runtime.provider, "local-demo");

    await harness.retryLocal();
    state = harness.state();
    assert.equal(state.runtime.error, null);
    assert.equal(state.runtime.provider, "local-demo");
    assert.equal(state.runtime.providerWarning, null);
  });

  test("Stop aborts an in-flight model request and blocks late state writes", async () => {
    const harness = makeHarness({ fetchMode: "pending" });
    harness.setForm("#project-form", projectForm(projects.reading));
    harness.submit("#project-form");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(harness.state().runtime.isRunning, true);
    harness.click("stop");
    await harness.wait();
    const state = harness.state();
    assert.equal(state.status, "stopped");
    assert.equal(state.brief, null);
    assert.equal(state.runtime.isRunning, false);
  });
});
