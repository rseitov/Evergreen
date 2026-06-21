import { buildAnchor } from "./lib/domAnchor";
import { describeAction, type ActionKind } from "./lib/actionText";
import type { RawStep } from "./lib/types";

export function buildStepFromEvent(event: Event): RawStep | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const kind: ActionKind = event.type === "change" ? "input" : "click";
  const anchor = buildAnchor(target);
  return {
    action_text: describeAction(kind, anchor),
    dom_anchor: anchor,
    screenshot_url: null,
  };
}

function relay(event: Event): void {
  const step = buildStepFromEvent(event);
  if (step) {
    chrome.runtime.sendMessage({ type: "step", step });
  }
}

// Attach capturing listeners only in a real extension context (guarded so the
// module is import-safe in tests).
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  document.addEventListener("click", relay, true);
  document.addEventListener("change", relay, true);
}
