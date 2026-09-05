(() => {
  "use strict";

  function history() {
    try {
      return window.DesignCopilotDebug?.getHistory?.() || [];
    } catch {
      return [];
    }
  }

  function historicalFindingCount(review) {
    const findingStatuses = new Set(["open", "fixed-in-v2", "fixing", "ignored"]);
    return (review?.issues || []).filter((item) => findingStatuses.has(item.status)).length;
  }

  function fixedInV2Count(review) {
    return (review?.issues || []).filter((item) => item.status === "fixed-in-v2").length;
  }

  function uniqueIterationIssueCount(iterations) {
    return new Set((iterations || []).map((item) => item?.issueId).filter(Boolean)).size;
  }

  function syncRound1History() {
    const entries = [...document.querySelectorAll("#history-list .history-entry")];
    const items = history();
    if (!entries.length || !items.length) return;

    entries.forEach((entry, index) => {
      const state = items[index]?.state;
      const reviews = state?.reviews || [];
      const iterations = state?.iterations || [];
      const round1 = reviews.find((review) => Number(review.round) === 1) || reviews[0];
      if (!round1) return;

      const node = [...entry.querySelectorAll(".history-version-node")]
        .find((item) => item.querySelector("b")?.textContent?.trim() === "Review Round 1");
      const meta = node?.querySelector("span");
      if (!node || !meta) return;

      const reviewFindings = historicalFindingCount(round1);
      const iterationFindings = uniqueIterationIssueCount(iterations);
      const found = Math.max(reviewFindings, iterationFindings);
      const fixedFromReview = fixedInV2Count(round1);
      const fixed = Math.max(fixedFromReview, iterationFindings);

      let text = "Passed";
      let tone = "pass";

      if (found > 0) {
        text = `${found} issue${found === 1 ? "" : "s"} found${fixed ? ` · ${fixed} fixed in V2` : ""}`;
        tone = "warn";
      }

      if (meta.textContent !== text) meta.textContent = text;
      node.classList.toggle("warn", tone === "warn");
      node.classList.toggle("pass", tone === "pass");
      const icon = node.querySelector("i");
      if (icon) icon.textContent = tone === "warn" ? "!" : "✓";
    });
  }

  const observer = new MutationObserver(() => requestAnimationFrame(syncRound1History));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", syncRound1History);
  syncRound1History();
})();
