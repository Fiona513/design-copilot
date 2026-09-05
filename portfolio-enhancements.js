(() => {
  "use strict";

  const ZOOM_MIN = 60;
  const ZOOM_MAX = 120;
  const ZOOM_STEP = 10;
  const DEFAULT_ZOOM = 80;
  let zoom = DEFAULT_ZOOM;

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
    try {
      const status = window.DesignCopilotDebug?.getState?.()?.status || "";
      return {
        "user-insight": "userInsight",
        "experience-principles": "experiencePrinciples",
        "user-flow": "userFlow",
        "screen-structure": "screenStructure",
        "prototype-v1": "prototypeV1",
        "prototype-v2": "prototypeV2",
      }[status] || null;
    } catch {
      return null;
    }
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
    let state = null;
    try {
      state = window.DesignCopilotDebug?.getState?.() || null;
    } catch {
      state = null;
    }

    const fallbackActive = state?.runtime?.provider === "local-demo";
    const warningVisible = Boolean(document.querySelector("#agent-content .provider-alert:not(.persistent-provider-retry)"));
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

  function cleanupExpandedState() {
    if (!document.querySelector(".portfolio-preview-stage.is-expanded")) {
      document.body.classList.remove("preview-expanded");
    }
  }

  function enhance() {
    enhancePrototype();
    enhanceReview();
    enhancePersistentProviderRetry();
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
