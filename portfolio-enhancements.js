(() => {
  "use strict";

  const ZOOM_MIN = 60;
  const ZOOM_MAX = 120;
  const ZOOM_STEP = 10;
  const DEFAULT_ZOOM = 80;
  let zoom = DEFAULT_ZOOM;

  function safeState() {
    try {
      return window.DesignCopilotDebug?.getState?.() || null;
    } catch {
      return null;
    }
  }

  function safeHistory() {
    try {
      return window.DesignCopilotDebug?.getHistory?.() || [];
    } catch {
      return [];
    }
  }

  function reviewState(issue) {
    const status = issue.classList;
    const severity = issue.querySelector(".severity")?.textContent?.trim().toLowerCase() || "";
    if (status.contains("pass") || status.contains("resolved") || status.contains("fixed-in-v2")) {
      return { icon: "✓", label: "通过", tone: "pass" };
    }
    if (status.contains("open") && severity === "high") {
      return { icon: "×", label: "未通过", tone: "fail" };
    }
    if (status.contains("open") || status.contains("ignored") || status.contains("fixing")) {
      return { icon: "!", label: status.contains("fixing") ? "修复中" : "建议修改", tone: "warn" };
    }
    return { icon: "!", label: "待确认", tone: "warn" };
  }

  function enhanceReview() {
    const list = document.querySelector(".review-list");
    if (!list) return;

    if (!document.querySelector(".review-status-legend")) {
      const legend = document.createElement("div");
      legend.className = "review-status-legend";
      legend.innerHTML = '<span class="pass"><i>✓</i>通过</span><span class="warn"><i>!</i>建议修改</span><span class="fail"><i>×</i>未通过</span>';
      list.before(legend);
    }

    document.querySelectorAll(".review-issue").forEach((issue) => {
      const header = issue.querySelector(":scope > header");
      if (!header || header.querySelector(".review-status-mark")) return;
      const state = reviewState(issue);
      const mark = document.createElement("span");
      mark.className = `review-status-mark ${state.tone}`;
      mark.innerHTML = `<i>${state.icon}</i><b>${state.label}</b>`;
      header.prepend(mark);
    });

    /* Local fallback copy must reflect the actual V2 data instead of a hard-coded value. */
    const state = safeState();
    const target = state?.outputs?.prototypes?.v2?.settings?.touchTarget;
    const viewingRound2 = state?.status === "review-v2" || (state?.status === "complete" && state?.view === "reviewV2");
    if (state?.runtime?.provider === "local-demo" && target && viewingRound2) {
      document.querySelectorAll(".review-issue p").forEach((node) => {
        if (/52px/.test(node.textContent || "") && Number(target) !== 52) {
          node.textContent = node.textContent.replaceAll("52px", `${target}px`);
        }
      });
    }
  }

  function setZoom(stage, nextZoom) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
    stage.style.setProperty("--preview-zoom", String(zoom / 100));
    const label = stage.querySelector('[data-preview-action="zoom-label"]');
    if (label) label.textContent = `${zoom}%`;
    stage.querySelector('[data-preview-action="zoom-out"]')?.toggleAttribute("disabled", zoom <= ZOOM_MIN);
    stage.querySelector('[data-preview-action="zoom-in"]')?.toggleAttribute("disabled", zoom >= ZOOM_MAX);
  }

  function enhancePrototype() {
    const layout = document.querySelector(".prototype-layout");
    const phone = layout?.querySelector(":scope > .prototype-phone");
    if (!layout || !phone || layout.querySelector(".portfolio-preview-stage")) return;

    const stage = document.createElement("section");
    stage.className = "portfolio-preview-stage";
    stage.setAttribute("aria-label", "Prototype Preview");
    stage.innerHTML = `
      <div class="portfolio-preview-toolbar" role="toolbar" aria-label="Preview controls">
        <button type="button" data-preview-action="zoom-out" aria-label="缩小预览">−</button>
        <button type="button" class="zoom-label" data-preview-action="zoom-label" aria-label="当前缩放比例">${DEFAULT_ZOOM}%</button>
        <button type="button" data-preview-action="zoom-in" aria-label="放大预览">＋</button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button type="button" class="expand" data-preview-action="expand" aria-label="放大查看">⛶<span>放大</span></button>
      </div>
      <div class="portfolio-preview-viewport"></div>`;

    const viewport = stage.querySelector(".portfolio-preview-viewport");
    layout.insertBefore(stage, phone);
    viewport.appendChild(phone);
    setZoom(stage, DEFAULT_ZOOM);

    stage.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preview-action]");
      if (!button) return;
      const action = button.dataset.previewAction;
      if (action === "zoom-out") setZoom(stage, zoom - ZOOM_STEP);
      if (action === "zoom-in") setZoom(stage, zoom + ZOOM_STEP);
      if (action === "zoom-label") setZoom(stage, DEFAULT_ZOOM);
      if (action === "expand") {
        const expanded = stage.classList.toggle("is-expanded");
        document.body.classList.toggle("preview-expanded", expanded);
        button.querySelector("span").textContent = expanded ? "收起" : "放大";
      }
    });
  }

  function currentArtifactKey() {
    const status = safeState()?.status || "";
    return {
      "user-insight": "userInsight",
      "experience-principles": "experiencePrinciples",
      "user-flow": "userFlow",
      "screen-structure": "screenStructure",
      "prototype-v1": "prototypeV1",
      "prototype-v2": "prototypeV2",
    }[status] || null;
  }

  function regenerateCurrentArtifact() {
    const key = currentArtifactKey();
    const selector = key
      ? `[data-action="regenerate"][data-key="${key}"]`
      : '[data-action="regenerate"]';
    const regenerate = document.querySelector(selector);
    if (!regenerate || regenerate.disabled) return false;
    regenerate.click();
    return true;
  }

  function enhancePersistentProviderRetry() {
    const existing = document.querySelector(".persistent-provider-retry");
    const state = safeState();
    const fallbackActive = state?.runtime?.provider === "local-demo";
    const warningVisible = Boolean(document.querySelector("#agent-content .provider-alert:not(.persistent-provider-retry)"));

    /* Completed tasks use a quiet recorded-fallback status instead of an error/retry card. */
    if (state?.status === "complete") {
      existing?.remove();
      return;
    }

    if (!fallbackActive || warningVisible) {
      existing?.remove();
      return;
    }

    if (existing) return;
    const agent = document.querySelector("#agent-content");
    if (!agent) return;

    const alert = document.createElement("section");
    alert.className = "provider-alert persistent-provider-retry";
    alert.innerHTML = `
      <p class="agent-label">LOCAL FALLBACK ACTIVE</p>
      <b>当前结果来自本地兜底</b>
      <p>可以继续当前流程，也可以随时重新尝试真实 AI；接受 fallback 不会永久关闭重试入口。</p>
      <div><button type="button" data-persistent-retry>Retry real AI</button></div>`;

    const plan = agent.querySelector(".agent-plan");
    if (plan) plan.before(alert);
    else agent.prepend(alert);
  }

  function enhanceCompletedFallback() {
    const state = safeState();
    const agent = document.querySelector("#agent-content");
    const badge = document.querySelector(".provider-badge");
    const existing = document.querySelector(".provider-fallback-compact");

    if (state?.status !== "complete") {
      existing?.remove();
      return;
    }

    if (state.runtime?.provider !== "local-demo") {
      existing?.remove();
      return;
    }

    /* Remove the large warning card after completion; the event remains in state/export. */
    agent?.querySelectorAll(".provider-alert").forEach((node) => node.remove());
    document.querySelector(".persistent-provider-retry")?.remove();
    if (badge) badge.textContent = "Fallback recorded";

    if (!agent || existing) return;
    const code = state.runtime?.providerWarning?.code || "STRUCTURED_OUTPUT_FALLBACK";
    const compact = document.createElement("section");
    compact.className = "provider-fallback-compact";
    compact.innerHTML = `
      <span>Review Round 2</span>
      <div><b>Completed with fallback</b><p>${code} · 结构化输出校验失败后由本地评审器完成复评；Prototype V2 数据未被回退结果改写。</p></div>`;
    const plan = agent.querySelector(".agent-plan");
    if (plan) plan.before(compact);
    else agent.prepend(compact);
  }

  function openIssueCount(review) {
    return (review?.issues || []).filter((item) => item.status === "open").length;
  }

  function timelineNode(label, meta, tone = "done") {
    const icon = tone === "pass" ? "✓" : tone === "warn" ? "!" : tone === "pending" ? "·" : "✓";
    return `<div class="history-version-node ${tone}"><i>${icon}</i><div><b>${label}</b><span>${meta}</span></div></div>`;
  }

  function buildVersionChain(entry) {
    const itemState = entry?.state || {};
    const v1 = itemState.outputs?.prototypes?.v1;
    const v2 = itemState.outputs?.prototypes?.v2;
    const reviews = itemState.reviews || [];
    const r1 = reviews.find((review) => Number(review.round) === 1) || reviews[0];
    const r2 = reviews.find((review) => Number(review.round) === 2) || reviews[1];
    const iterations = itemState.iterations || [];

    const nodes = [];
    if (v1) {
      const target = v1.settings?.touchTarget;
      nodes.push(timelineNode("Prototype V1", `Generated${target ? ` · ${target}px targets` : ""}`));
    }
    if (r1) {
      const count = openIssueCount(r1);
      nodes.push(timelineNode("Review Round 1", count ? `${count} issue${count === 1 ? "" : "s"} found` : "Passed", count ? "warn" : "pass"));
    }
    if (v2) {
      const target = v2.settings?.touchTarget;
      const changes = iterations.reduce((sum, item) => sum + (item.changes?.length || 0), 0);
      nodes.push(timelineNode("Prototype V2", `${changes || v2.appliedChanges?.length || 0} applied change${(changes || v2.appliedChanges?.length || 0) === 1 ? "" : "s"}${target ? ` · ${target}px targets` : ""}`));
    }
    if (r2) {
      const count = openIssueCount(r2);
      nodes.push(timelineNode("Review Round 2", count ? `${count} issue${count === 1 ? "" : "s"} still open` : "Passed · 0 open issues", count ? "warn" : "pass"));
    }

    return nodes.length ? `<div class="history-version-chain">${nodes.join("")}</div>` : "";
  }

  function enhanceHistoryTimeline() {
    const dialog = document.querySelector("#history-dialog");
    const entries = [...document.querySelectorAll("#history-list .history-entry")];
    if (!dialog || !entries.length) return;

    const title = dialog.querySelector("#history-title");
    if (title) title.textContent = "项目与版本历史";

    const history = safeHistory();
    entries.forEach((entryNode, index) => {
      const historyEntry = history[index];
      if (!historyEntry?.state) return;
      const signature = `${historyEntry.id}:${historyEntry.completedAt}:${historyEntry.state?.reviews?.length || 0}:${Boolean(historyEntry.state?.outputs?.prototypes?.v2)}`;
      if (entryNode.dataset.timelineSignature === signature) return;
      entryNode.dataset.timelineSignature = signature;
      entryNode.querySelector(".history-version-chain")?.remove();
      const wrapper = entryNode.querySelector(":scope > div");
      if (wrapper) wrapper.insertAdjacentHTML("beforeend", buildVersionChain(historyEntry));
    });
  }

  function cleanupExpandedState() {
    if (!document.querySelector(".portfolio-preview-stage.is-expanded")) {
      document.body.classList.remove("preview-expanded");
    }
  }

  function enhance() {
    enhancePrototype();
    enhanceReview();
    enhancePersistentProviderRetry();
    enhanceCompletedFallback();
    enhanceHistoryTimeline();
    cleanupExpandedState();
  }

  /* app.js keeps retrySpec only in memory. After a reload the persisted provider warning
     can still be visible while retrySpec is gone. Convert the warning retry into an
     explicit regenerate from current persisted state so it still works after reload. */
  document.addEventListener("click", (event) => {
    const retry = event.target.closest('[data-action="retry-ai"]');
    if (retry?.closest(".provider-alert")) {
      if (regenerateCurrentArtifact()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const persistentRetry = event.target.closest("[data-persistent-retry]");
    if (!persistentRetry) return;
    persistentRetry.disabled = true;
    persistentRetry.textContent = "Retrying…";
    if (!regenerateCurrentArtifact()) {
      persistentRetry.disabled = false;
      persistentRetry.textContent = "Retry real AI";
    }
  }, true);

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const stage = document.querySelector(".portfolio-preview-stage.is-expanded");
    if (!stage) return;
    stage.classList.remove("is-expanded");
    document.body.classList.remove("preview-expanded");
    const label = stage.querySelector('[data-preview-action="expand"] span');
    if (label) label.textContent = "放大";
  });
  enhance();
})();
