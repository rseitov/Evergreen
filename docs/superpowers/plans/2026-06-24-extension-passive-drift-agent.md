# Extension Passive Drift Agent (Loop A Client) Implementation Plan (Plan 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close drift loop A — the browser extension, on each page, asks the backend which documented steps live on this URL, re-captures their fingerprints from the live DOM, and posts them to `/drift/observe` so the backend can score drift.

**Architecture:** A pure `runDriftScan(api, token, orgId, url, doc)` orchestration in `src/lib/driftAgent.ts` is the heart: it calls `listObservable`, re-captures each step's element by its stored selector (a missing element → `dom_anchor: null`, i.e. max drift), and calls `observeDrift`. Two new `ApiClient` methods wrap the Plan 7/5 endpoints. The MV3 wiring proxies those two calls from the content script (which has the DOM) to the background service worker (which has cross-origin fetch privileges), so privacy holds — on non-allowlisted domains the backend returns nothing and the agent does nothing. The pure core and the background message handlers are unit-tested (jsdom + mocked api); the content-script trigger is thin glue verified manually in Chrome.

**Tech Stack:** TypeScript, Vite (MV3 build), Vitest + jsdom, the existing extension `ApiClient`/`buildAnchor`/`Session`.

## Global Constraints

- TypeScript strict; tests run with `npm test` (Vitest) from `extension/`.
- Backend base URL `http://localhost:8077` (the value already used in `background.ts`).
- All backend access goes through `ApiClient`; the content script never fetches directly — it proxies `listObservable`/`observeDrift` to the background via `chrome.runtime.sendMessage` (MV3: the service worker has the host permission and is not subject to page CORS).
- Privacy / §5.3: the agent sends only the page URL to `listObservable`; page DOM is read **only** for steps the backend returns (which are allowlisted by construction, Plan 7). No DOM content leaves the machine for non-allowlisted domains.
- Re-capture matches the design §5.2 fingerprint: a step's element is located by its stored `dom_anchor.selector`; the fresh fingerprint reuses the stored `semantics`/`url` and a freshly built `dom_anchor` (or `null` if the element is gone). Drift scoring is the backend's job (`/drift/observe`, Plan 5) — the agent does no scoring.
- Reuse, don't reimplement: `ApiClient` (extend it), `buildAnchor` (`src/lib/domAnchor.ts`), `Session` (`src/lib/storage.ts`), `DomAnchor` type.
- The content-script trigger must be a no-op when there is no session/token (logged-out users) and must never throw into the page.

---

## File Structure

```
extension/
  src/
    lib/
      types.ts        # MODIFY: add Fingerprint, ObservableStep, ObserveResult
      api.ts          # MODIFY: add listObservable, observeDrift
      driftAgent.ts   # NEW: runDriftScan pure orchestration + DriftApi interface
    background.ts     # MODIFY: handle "drift.observable" / "drift.observe" messages via ApiClient
    content.ts        # MODIFY: on load, run a drift scan proxied through the background
  tests/
    api.test.ts       # MODIFY: cover listObservable + observeDrift
    driftAgent.test.ts# NEW
    background.test.ts# MODIFY: cover the two drift message handlers
```

---

### Task 1: API methods + types for observe/observable

**Files:**
- Modify: `extension/src/lib/types.ts`
- Modify: `extension/src/lib/api.ts`
- Modify: `extension/tests/api.test.ts`

**Interfaces:**
- Consumes: existing `ApiClient.request`, `DomAnchor`.
- Produces:
  - Types: `Fingerprint { dom_anchor: DomAnchor | null; semantics: string; screenshot_url: string | null; url: string | null }`; `ObservableStep { step_id: string; guide_id: string; url: string | null; fingerprint: Fingerprint | null }`; `ObserveResult { drift: boolean; score: number; classification: string; event_id: string | null }`.
  - `ApiClient.listObservable(token, orgId, url): Promise<ObservableStep[]>` → `GET /orgs/{orgId}/steps/observable?url=<encoded>`.
  - `ApiClient.observeDrift(token, orgId, body: { step_id: string; fresh_fingerprint: Fingerprint; source: "passive" }): Promise<ObserveResult>` → `POST /orgs/{orgId}/drift/observe`.

- [ ] **Step 1: Add types — modify `extension/src/lib/types.ts`**

Append:

```typescript
export interface Fingerprint {
  dom_anchor: DomAnchor | null;
  semantics: string;
  screenshot_url: string | null;
  url: string | null;
}

export interface ObservableStep {
  step_id: string;
  guide_id: string;
  url: string | null;
  fingerprint: Fingerprint | null;
}

export interface ObserveResult {
  drift: boolean;
  score: number;
  classification: string;
  event_id: string | null;
}
```

- [ ] **Step 2: Write the failing test — add to `extension/tests/api.test.ts`**

Add inside the existing `ApiClient` describe block (mirror the existing `mockFetch` helper used in that file):

```typescript
  it("listObservable encodes the url and uses bearer auth", async () => {
    const f = mockFetch(200, [
      { step_id: "s1", guide_id: "g1", url: "https://crm.acme.ru/d/1", fingerprint: null },
    ]);
    const res = await api().listObservable("tok", "o1", "https://crm.acme.ru/d/1");
    expect(res).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(
      "http://localhost:8077/orgs/o1/steps/observable?url=https%3A%2F%2Fcrm.acme.ru%2Fd%2F1",
    );
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("observeDrift posts the fresh fingerprint", async () => {
    const f = mockFetch(201, { drift: true, score: 0.7, classification: "stale", event_id: "d1" });
    const fp = { dom_anchor: null, semantics: "s", screenshot_url: null, url: "u" };
    const res = await api().observeDrift("tok", "o1", { step_id: "s1", fresh_fingerprint: fp, source: "passive" });
    expect(res.classification).toBe("stale");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/drift/observe");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ step_id: "s1", fresh_fingerprint: fp, source: "passive" });
  });
```

> If `api.test.ts` defines its `mockFetch`/`api()` helpers differently, adapt these two tests to that file's existing pattern (same assertions).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd extension && npm test -- api`
Expected: FAIL (`listObservable`/`observeDrift` not a function).

- [ ] **Step 4: Add the methods — modify `extension/src/lib/api.ts`**

Extend the type import and add the two methods to `ApiClient`:

```typescript
import type {
  AuthResult,
  Fingerprint,
  GenerateRequest,
  GuideDetailLite,
  MeResponse,
  ObservableStep,
  ObserveResult,
  Project,
} from "./types";
```

```typescript
  listObservable(token: string, orgId: string, url: string): Promise<ObservableStep[]> {
    return this.request<ObservableStep[]>(
      `/orgs/${orgId}/steps/observable?url=${encodeURIComponent(url)}`,
      { token },
    );
  }

  observeDrift(
    token: string,
    orgId: string,
    body: { step_id: string; fresh_fingerprint: Fingerprint; source: "passive" },
  ): Promise<ObserveResult> {
    return this.request<ObserveResult>(`/orgs/${orgId}/drift/observe`, {
      method: "POST",
      body,
      token,
    });
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd extension && npm test -- api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd extension
git add src/lib/types.ts src/lib/api.ts tests/api.test.ts
git commit -m "feat(extension): add observable/observe API methods for drift loop A"
```

---

### Task 2: `runDriftScan` pure orchestration

**Files:**
- Create: `extension/src/lib/driftAgent.ts`
- Create: `extension/tests/driftAgent.test.ts`

**Interfaces:**
- Consumes: `buildAnchor` (`./domAnchor`), `Fingerprint`/`ObservableStep` (`./types`).
- Produces:
  - `interface DriftApi { listObservable(token, orgId, url): Promise<ObservableStep[]>; observeDrift(token, orgId, body): Promise<unknown> }`.
  - `runDriftScan(api: DriftApi, token: string, orgId: string, url: string, doc: Document): Promise<number>` — fetches observable steps; for each, finds the element by its stored `dom_anchor.selector` in `doc`, builds a fresh fingerprint (`dom_anchor` from the live element via `buildAnchor`, or `null` if not found; reusing the stored `semantics` and the current `url`), and calls `observeDrift` with `source: "passive"`. Returns the count of steps observed.

- [ ] **Step 1: Write the failing test — `extension/tests/driftAgent.test.ts`**

```typescript
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { runDriftScan, type DriftApi } from "../src/lib/driftAgent";
import type { ObservableStep } from "../src/lib/types";

function docWith(html: string): Document {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
}

function step(selector: string, semantics = "нажать Сохранить"): ObservableStep {
  return {
    step_id: "s1",
    guide_id: "g1",
    url: "https://crm.acme.ru/d/1",
    fingerprint: { dom_anchor: { role: "button", text: "Сохранить", selector }, semantics, screenshot_url: null, url: "https://crm.acme.ru/d/1" },
  };
}

function fakeApi(steps: ObservableStep[]) {
  return {
    listObservable: vi.fn().mockResolvedValue(steps),
    observeDrift: vi.fn().mockResolvedValue({ drift: false, score: 0, classification: "none", event_id: null }),
  } satisfies DriftApi;
}

describe("runDriftScan", () => {
  it("re-captures a present element and reports a fresh fingerprint", async () => {
    const api = fakeApi([step("#save")]);
    const doc = docWith(`<button id="save" role="button">Готово</button>`);
    const n = await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    expect(n).toBe(1);
    expect(api.observeDrift).toHaveBeenCalledTimes(1);
    const body = api.observeDrift.mock.calls[0][2];
    expect(body.step_id).toBe("s1");
    expect(body.source).toBe("passive");
    expect(body.fresh_fingerprint.dom_anchor.text).toBe("Готово"); // live text, drifted from "Сохранить"
    expect(body.fresh_fingerprint.semantics).toBe("нажать Сохранить"); // stored semantics reused
    expect(body.fresh_fingerprint.url).toBe("https://crm.acme.ru/d/1");
  });

  it("reports a null anchor when the element is gone (max drift)", async () => {
    const api = fakeApi([step("#save")]);
    const doc = docWith(`<div>no button here</div>`);
    await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    const body = api.observeDrift.mock.calls[0][2];
    expect(body.fresh_fingerprint.dom_anchor).toBeNull();
  });

  it("does nothing when there are no observable steps", async () => {
    const api = fakeApi([]);
    const doc = docWith(`<button id="save">x</button>`);
    const n = await runDriftScan(api, "tok", "o1", "https://crm.acme.ru/d/1", doc);
    expect(n).toBe(0);
    expect(api.observeDrift).not.toHaveBeenCalled();
  });
});
```

> `jsdom` is already a devDependency of the extension. If `JSDOM` import resolution differs, the extension's vitest already runs in a DOM-capable environment — alternatively use the ambient `document` after setting `document.body.innerHTML`, matching how `domAnchor.test.ts` builds elements.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- driftAgent`
Expected: FAIL (cannot find `../src/lib/driftAgent`).

- [ ] **Step 3: Create `extension/src/lib/driftAgent.ts`**

```typescript
import { buildAnchor } from "./domAnchor";
import type { Fingerprint, ObservableStep } from "./types";

export interface DriftApi {
  listObservable(token: string, orgId: string, url: string): Promise<ObservableStep[]>;
  observeDrift(
    token: string,
    orgId: string,
    body: { step_id: string; fresh_fingerprint: Fingerprint; source: "passive" },
  ): Promise<unknown>;
}

export async function runDriftScan(
  api: DriftApi,
  token: string,
  orgId: string,
  url: string,
  doc: Document,
): Promise<number> {
  const steps = await api.listObservable(token, orgId, url);
  let observed = 0;
  for (const step of steps) {
    const selector = step.fingerprint?.dom_anchor?.selector;
    const el = selector ? doc.querySelector(selector) : null;
    const fresh: Fingerprint = {
      dom_anchor: el ? buildAnchor(el) : null,
      semantics: step.fingerprint?.semantics ?? "",
      screenshot_url: null,
      url,
    };
    await api.observeDrift(token, orgId, {
      step_id: step.step_id,
      fresh_fingerprint: fresh,
      source: "passive",
    });
    observed += 1;
  }
  return observed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- driftAgent`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/driftAgent.ts tests/driftAgent.test.ts
git commit -m "feat(extension): add passive drift-scan orchestration"
```

---

### Task 3: Wire the scan — background handlers + content trigger

**Files:**
- Modify: `extension/src/background.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/tests/background.test.ts`

**Interfaces:**
- Consumes: `ApiClient.listObservable`/`observeDrift` (Task 1), `runDriftScan` (Task 2), `loadSession` (`./lib/storage`).
- Produces:
  - `background.ts`: an exported `handleDriftMessage(api, message)` that, for `{type: "drift.observable", token, orgId, url}` returns `api.listObservable(...)`, and for `{type: "drift.observe", token, orgId, body}` returns `api.observeDrift(...)`; wired into the runtime `onMessage` listener so the content script can proxy through the background.
  - `content.ts`: on load, loads the session and (when a token + orgId exist) runs `runDriftScan` against `document` and `location.href`, using a `DriftApi` proxy that forwards `listObservable`/`observeDrift` to the background via `chrome.runtime.sendMessage`. Wrapped so it never throws into the page.

- [ ] **Step 1: Write the failing test — add to `extension/tests/background.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { handleDriftMessage } from "../src/background";

describe("handleDriftMessage", () => {
  it("routes drift.observable to ApiClient.listObservable", async () => {
    const api = { listObservable: vi.fn().mockResolvedValue([{ step_id: "s1" }]), observeDrift: vi.fn() };
    const res = await handleDriftMessage(api as never, {
      type: "drift.observable", token: "tok", orgId: "o1", url: "https://x/1",
    });
    expect(api.listObservable).toHaveBeenCalledWith("tok", "o1", "https://x/1");
    expect(res).toEqual([{ step_id: "s1" }]);
  });

  it("routes drift.observe to ApiClient.observeDrift", async () => {
    const body = { step_id: "s1", fresh_fingerprint: { dom_anchor: null, semantics: "", screenshot_url: null, url: "u" }, source: "passive" };
    const api = { listObservable: vi.fn(), observeDrift: vi.fn().mockResolvedValue({ drift: false }) };
    const res = await handleDriftMessage(api as never, { type: "drift.observe", token: "tok", orgId: "o1", body });
    expect(api.observeDrift).toHaveBeenCalledWith("tok", "o1", body);
    expect(res).toEqual({ drift: false });
  });

  it("returns null for unrelated messages", async () => {
    const api = { listObservable: vi.fn(), observeDrift: vi.fn() };
    expect(await handleDriftMessage(api as never, { type: "step" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- background`
Expected: FAIL (`handleDriftMessage` not exported).

- [ ] **Step 3: Add the background handler — modify `extension/src/background.ts`**

Add the exported handler (near `RecordingService`):

```typescript
import { ApiClient } from "./lib/api";
// ...existing imports...

interface DriftMessage {
  type: string;
  token?: string;
  orgId?: string;
  url?: string;
  body?: { step_id: string; fresh_fingerprint: unknown; source: "passive" };
}

export async function handleDriftMessage(api: ApiClient, message: DriftMessage): Promise<unknown> {
  if (message?.type === "drift.observable") {
    return api.listObservable(message.token!, message.orgId!, message.url!);
  }
  if (message?.type === "drift.observe") {
    return api.observeDrift(message.token!, message.orgId!, message.body as never);
  }
  return null;
}
```

In the runtime listener (inside the `if (typeof chrome !== "undefined" ...)` guard), route drift messages through it:

```typescript
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "step") {
      service.addStep(message.step as RawStep);
      return false;
    }
    if (message?.type === "start") {
      service.start();
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "stop") {
      service
        .stopAndGenerate(message.session as Session, (message.titleHint as string) ?? null)
        .then((guide) => sendResponse({ ok: true, guide }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    if (message?.type === "drift.observable" || message?.type === "drift.observe") {
      handleDriftMessage(driftApi, message)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    return false;
  });
```

> Reuse the existing `ApiClient` instance for drift: in the guard block, the service is built as `new RecordingService(new ApiClient("http://localhost:8077"))`. Extract the client so both share it:
>
> ```typescript
>   const driftApi = new ApiClient("http://localhost:8077");
>   const service = new RecordingService(driftApi);
> ```

- [ ] **Step 4: Add the content trigger — modify `extension/src/content.ts`**

Append (at the end of the file), guarded so it never throws into the page and only runs with a session. This is glue verified manually in Chrome:

```typescript
import { runDriftScan, type DriftApi } from "./lib/driftAgent";
import { loadSession } from "./lib/storage";

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
```

> The content script is already injected on pages by the Plan 3 manifest; the background already has host permission for the backend origin (used by `generate`). No manifest change is required for the proxy path (fetch happens in the background). If a future hardening pass restricts host permissions, ensure `http://localhost:8077/*` (and the prod API origin) remain listed.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd extension && npm test -- background`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Run the full extension suite**

Run: `cd extension && npm test`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
cd extension
git add src/background.ts src/content.ts tests/background.test.ts
git commit -m "feat(extension): wire passive drift scan on page load via background"
```

---

## Self-Review

**1. Spec coverage (design §5 loop A — passive drift, client side):**
- "Расширение знает, какие URL/экраны относятся к гайдам" → `listObservable(url)` (Task 1) backed by Plan 7. ✅
- "Когда сотрудник снова попадает на экран... снимается свежий отпечаток" → `runDriftScan` re-captures via `buildAnchor` on page load (Tasks 2–3). ✅
- "AI-пайплайн считает drift-score... пороги... авто-черновик" → done server-side by `/drift/observe` (Plan 5); the agent just submits the fresh fingerprint. ✅
- §5.3 privacy: only the URL is sent to discover steps; DOM is read only for backend-returned (allowlisted) steps; non-allowlisted domains → empty → no-op. ✅
- Element gone → `dom_anchor: null` → backend scores 1.0 (stale) → auto-draft. ✅
- Loop A now closes end-to-end: extension → `/drift/observe` → DriftEvent → "Что устарело" dashboard (Plan 4) → accept applies a new version (Plan 5). ✅

**2. Placeholder scan:** No TBD/empty steps; pure core + handlers have complete code and real assertions; the content trigger is explicitly flagged as manually-verified glue (it has no unit test, by design — DOM-load wiring), while its logic (`runDriftScan`) and the background handlers it depends on are fully tested. ✅

**3. Type consistency:** `Fingerprint`/`ObservableStep`/`ObserveResult` (Task 1) are used by `runDriftScan` (Task 2) and the handlers (Task 3). `DriftApi` (Task 2) is implemented by both the test fakes and the content-script proxy (Task 3) and matches `ApiClient.listObservable`/`observeDrift` signatures (Task 1). The `observeDrift` body shape `{step_id, fresh_fingerprint, source:"passive"}` is identical across api, agent, and handler, and matches the backend `ObserveRequest` (Plan 5). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-extension-passive-drift-agent.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
