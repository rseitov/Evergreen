import { buildAnchor } from "./lib/domAnchor";
import { describeAction, type ActionKind } from "./lib/actionText";
import type { RawStep } from "./lib/types";
import { runDriftScan, type DriftApi } from "./lib/driftAgent";
import { loadSession } from "./lib/storage";

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

function backgroundDriftApi(): DriftApi {
  return {
    listObservable(token, orgId, url) {
      return chrome.runtime
        .sendMessage({ type: "drift.observable", token, orgId, url })
        .then((r: { ok: boolean; result?: unknown }) => (r?.ok ? r.result : []));
    },
    observeDrift(token, orgId, body) {
      return chrome.runtime.sendMessage({ type: "drift.observe", token, orgId, body });
    },
  } as DriftApi;
}

async function passiveScan(): Promise<void> {
  try {
    const session = await loadSession();
    if (!session?.token || !session.orgId) return;
    await runDriftScan(backgroundDriftApi(), session.token, session.orgId, location.href, document);
  } catch {
    // never surface drift-agent errors into the host page
  }
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    void passiveScan();
  } else {
    document.addEventListener("DOMContentLoaded", () => void passiveScan());
  }
}
