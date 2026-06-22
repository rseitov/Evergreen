# Web App — Consumer Flag (Loop C) + Session Polish Implementation Plan (Plan 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close drift loop C in the web-app (a per-step "этого больше нет" button that flags a step via the backend), and fix the deferred UX gaps from Plan 4 — persist the selected org so deep links survive a reload, stabilize the ApiClient in context, and add a 404 fallback route.

**Architecture:** Pure additions to the existing React web-app (`webapp/`). A new `ApiClient.flagDrift` method calls the Plan 5 `POST /drift/flag` endpoint. `orgId` joins the token in `localStorage` (via `session.ts`) and is loaded/persisted by `AppContext`, which also lifts the `ApiClient` to a stable `useMemo([])`. `GuidePage` gains a flag button per step. `App` gets a catch-all route. Everything is tested headless with Vitest + Testing Library and the ApiClient faked.

**Tech Stack:** React 18, Vite, TypeScript (strict), react-router-dom v6, Vitest + @testing-library/react + @testing-library/user-event + jsdom, Node 20+, npm.

## Global Constraints

- Node 20+; npm; tests run with `npm test` (Vitest) from `webapp/`.
- TypeScript `strict: true`.
- All backend calls go through `src/lib/api.ts` (`ApiClient`) — no `fetch` in components. The flag endpoint is `POST /orgs/{org_id}/drift/flag` with body `{step_id}` returning a `DriftEventOut` (Plan 5).
- `orgId` is persisted in `localStorage` under key `"shsop_org"` (token stays under `"shsop_token"`).
- This is **loop C** of the drift design (§5 "флаг потребителя"): the consumer marks a step gone; the backend records a `DriftEvent(source="flag")` for owner review on the existing "Что устарело" dashboard. Loop A (extension passive agent) remains a separate deferred plan.
- One responsibility per file; intent-revealing names; no secrets in code.

---

## File Structure

```
webapp/
  src/
    lib/
      session.ts        # MODIFY: add loadOrgId / saveOrgId / clearOrgId
      api.ts            # MODIFY: add flagDrift
    app/
      AppContext.tsx    # MODIFY: init orgId from storage, persist on setOrgId, clear on logout, lift ApiClient to stable useMemo
    pages/
      GuidePage.tsx     # MODIFY: per-step "этого больше нет" flag button
    App.tsx             # MODIFY: catch-all 404 route
  tests/
    session.test.ts     # MODIFY: add orgId persistence cases
    api.test.ts         # MODIFY: add flagDrift case
    AppContext.test.tsx # MODIFY: add orgId init/persist/logout cases
    GuidePage.test.tsx  # MODIFY: add flag-button case
    App.test.tsx        # MODIFY: add unknown-route case
```

---

### Task 1: ApiClient.flagDrift

**Files:**
- Modify: `webapp/src/lib/api.ts`
- Modify: `webapp/tests/api.test.ts`

**Interfaces:**
- Consumes: `DriftEventOut` from `types.ts`, the existing private `request` helper.
- Produces: `ApiClient.flagDrift(token: string, orgId: string, stepId: string): Promise<DriftEventOut>` → `POST /orgs/{orgId}/drift/flag` with body `{ step_id: stepId }`, bearer auth.

- [ ] **Step 1: Write the failing test — add to `webapp/tests/api.test.ts`**

Append this test inside the existing `describe("ApiClient", ...)` block:

```typescript
  it("flagDrift posts the step id to the flag endpoint", async () => {
    const f = mockFetch(201, {
      id: "d1", step_id: "s1", score: 1, source: "flag", status: "open",
      fresh_fingerprint: null, draft_text: null, created_at: "",
    });
    const res = await api().flagDrift("tok", "o1", "s1");
    expect(res.id).toBe("d1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/drift/flag");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ step_id: "s1" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npm test -- api`
Expected: FAIL (`api().flagDrift is not a function`).

- [ ] **Step 3: Add the method — modify `webapp/src/lib/api.ts`**

Add `DriftEventOut` to the type import at the top if not already present, then add the method to `ApiClient` (next to `acceptDrift`/`dismissDrift`):

```typescript
  flagDrift(token: string, orgId: string, stepId: string): Promise<DriftEventOut> {
    return this.request<DriftEventOut>(`/orgs/${orgId}/drift/flag`, {
      method: "POST",
      body: { step_id: stepId },
      token,
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npm test -- api`
Expected: PASS (all api tests, including the new one).

- [ ] **Step 5: Commit**

```bash
cd webapp
git add src/lib/api.ts tests/api.test.ts
git commit -m "feat(webapp): add flagDrift API method"
```

---

### Task 2: Persist orgId + stabilize ApiClient in context

**Files:**
- Modify: `webapp/src/lib/session.ts`
- Modify: `webapp/src/app/AppContext.tsx`
- Modify: `webapp/tests/session.test.ts`
- Modify: `webapp/tests/AppContext.test.tsx`

**Interfaces:**
- Consumes: `ApiClient`, the new session helpers, `saveToken`/`clearToken`.
- Produces:
  - `loadOrgId(): string | null`, `saveOrgId(orgId: string): void`, `clearOrgId(): void` — `localStorage` key `"shsop_org"`.
  - `AppProvider` now initializes `orgId` from `loadOrgId()`, persists it whenever `setOrgId` is called, clears both token and org on `logout`, and holds a single stable `ApiClient` (`useMemo([])`).

- [ ] **Step 1: Write the failing tests**

Add to `webapp/tests/session.test.ts` (inside the file, after the existing token suite):

```typescript
import { clearOrgId, loadOrgId, saveOrgId } from "../src/lib/session";

describe("org session", () => {
  it("returns null when no org stored", () => {
    expect(loadOrgId()).toBeNull();
  });

  it("round-trips an org id", () => {
    saveOrgId("o1");
    expect(loadOrgId()).toBe("o1");
  });

  it("clears the org id", () => {
    saveOrgId("o1");
    clearOrgId();
    expect(loadOrgId()).toBeNull();
  });
});
```

> The existing `beforeEach(() => localStorage.clear())` at the top of the file already isolates these.

Add to `webapp/tests/AppContext.test.tsx`:

```typescript
import { act, render, renderHook } from "@testing-library/react";
import { AppProvider, useApp } from "../src/app/AppContext";
import { saveOrgId } from "../src/lib/session";

describe("AppContext org persistence", () => {
  it("initializes orgId from storage", () => {
    saveOrgId("o7");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppProvider>{children}</AppProvider>
    );
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.orgId).toBe("o7");
  });

  it("setOrgId persists to storage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AppProvider>{children}</AppProvider>
    );
    const { result } = renderHook(() => useApp(), { wrapper });
    act(() => result.current.setOrgId("o9"));
    expect(localStorage.getItem("shsop_org")).toBe("o9");
  });
});
```

> `localStorage.clear()` is already run in `beforeEach` in this test file (added in Plan 4 Task 4). If it is not, add it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd webapp && npm test -- session AppContext`
Expected: FAIL (`loadOrgId`/`saveOrgId`/`clearOrgId` not exported; orgId not initialized from storage).

- [ ] **Step 3: Add the session helpers — modify `webapp/src/lib/session.ts`**

Append:

```typescript
const ORG_KEY = "shsop_org";

export function loadOrgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function saveOrgId(orgId: string): void {
  localStorage.setItem(ORG_KEY, orgId);
}

export function clearOrgId(): void {
  localStorage.removeItem(ORG_KEY);
}
```

- [ ] **Step 4: Rewrite the provider — modify `webapp/src/app/AppContext.tsx`**

Replace the `AppProvider` body so the ApiClient is stable, orgId loads from storage, `setOrgId` persists, and `logout` clears both keys:

```typescript
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ApiClient } from "../lib/api";
import { clearOrgId, clearToken, loadOrgId, loadToken, saveOrgId, saveToken } from "../lib/session";

export interface AppValue {
  api: ApiClient;
  token: string | null;
  orgId: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  setOrgId(orgId: string): void;
}

const AppContext = createContext<AppValue | null>(null);

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8077";

export function AppProvider({ value, children }: { value?: AppValue; children: ReactNode }) {
  const api = useMemo(() => new ApiClient(BASE_URL), []);
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [orgId, setOrgIdState] = useState<string | null>(() => loadOrgId());

  const setOrgId = useCallback((id: string) => {
    saveOrgId(id);
    setOrgIdState(id);
  }, []);

  const built = useMemo<AppValue>(
    () => ({
      api,
      token,
      orgId,
      async login(email, password) {
        const auth = await api.login(email, password);
        saveToken(auth.access_token);
        setToken(auth.access_token);
      },
      logout() {
        clearToken();
        clearOrgId();
        setToken(null);
        setOrgIdState(null);
      },
      setOrgId,
    }),
    [api, token, orgId, setOrgId],
  );

  return <AppContext.Provider value={value ?? built}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return ctx;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd webapp && npm test -- session AppContext`
Expected: PASS (existing + new cases).

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `cd webapp && npm test`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
cd webapp
git add src/lib/session.ts src/app/AppContext.tsx tests/session.test.ts tests/AppContext.test.tsx
git commit -m "feat(webapp): persist selected org and stabilize ApiClient in context"
```

---

### Task 3: Per-step "этого больше нет" flag button (loop C)

**Files:**
- Modify: `webapp/src/pages/GuidePage.tsx`
- Modify: `webapp/tests/GuidePage.test.tsx`

**Interfaces:**
- Consumes: `useApp` (`app.api.flagDrift`, `app.token`, `app.orgId`), the existing guide load.
- Produces: each rendered step gets a button labelled "этого больше нет"; clicking it calls `app.api.flagDrift(token, orgId, step.id)` and, on success, replaces that step's button with the text "Помечено как устаревший". Tracks flagged step ids in component state.

- [ ] **Step 1: Write the failing test — add to `webapp/tests/GuidePage.test.tsx`**

Add this test inside the existing `describe("GuidePage", ...)` block (the `renderGuide` helper and imports already exist from Plan 4):

```typescript
  it("flags a step as gone via loop C", async () => {
    const api = {
      getGuide: vi.fn().mockResolvedValue({
        id: "g1", title: "Возврат сделки", type: "digital", project_id: "p1",
        version_number: 1, current_version_id: "v1",
        steps: [{ id: "s1", order_index: 0, text: "Открыть карточку", media_url: null, fingerprint: null }],
        created_at: "",
      }),
      listVersions: vi.fn().mockResolvedValue([
        { id: "v1", version_number: 1, created_by: "u1", created_at: "", is_current: true },
      ]),
      flagDrift: vi.fn().mockResolvedValue({
        id: "d1", step_id: "s1", score: 1, source: "flag", status: "open",
        fresh_fingerprint: null, draft_text: null, created_at: "",
      }),
    };
    renderGuide(api);

    await screen.findByText("Открыть карточку");
    await userEvent.click(screen.getByRole("button", { name: "этого больше нет" }));

    await waitFor(() => expect(api.flagDrift).toHaveBeenCalledWith("test-token", "o1", "s1"));
    expect(await screen.findByText("Помечено как устаревший")).toBeInTheDocument();
  });
```

> If `screen`, `userEvent`, `waitFor`, or `vi` are not already imported in this file from Plan 4, add them to the imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npm test -- GuidePage`
Expected: FAIL (no "этого больше нет" button).

- [ ] **Step 3: Add the flag button — modify `webapp/src/pages/GuidePage.tsx`**

Add `flagged` state and a `flag` handler inside the component, and render the button per step. The full updated component:

```typescript
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../app/AppContext";
import type { GuideDetail, VersionSummary } from "../lib/types";

export default function GuidePage() {
  const app = useApp();
  const { guideId } = useParams();
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function load() {
      if (!app.token || !app.orgId || !guideId) return;
      const g = await app.api.getGuide(app.token, app.orgId, guideId);
      const v = await app.api.listVersions(app.token, app.orgId, guideId);
      if (active) {
        setGuide(g);
        setVersions(v);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [app, guideId]);

  async function makeLink() {
    if (!app.token || !app.orgId || !guideId) return;
    const link = await app.api.createShareLink(app.token, app.orgId, guideId);
    setShareUrl(link.url_path);
  }

  async function flag(stepId: string) {
    if (!app.token || !app.orgId) return;
    await app.api.flagDrift(app.token, app.orgId, stepId);
    setFlagged((prev) => new Set(prev).add(stepId));
  }

  if (!guide) return <p>Загрузка…</p>;

  return (
    <div>
      <h1>{guide.title}</h1>
      <p>Версия {guide.version_number}</p>
      <ol>
        {guide.steps.map((s) => (
          <li key={s.id}>
            {s.text}{" "}
            {flagged.has(s.id) ? (
              <span>Помечено как устаревший</span>
            ) : (
              <button type="button" onClick={() => flag(s.id)}>
                этого больше нет
              </button>
            )}
          </li>
        ))}
      </ol>
      <Link to={`/guides/${guide.id}/edit`}>Редактировать</Link>
      <button type="button" onClick={makeLink}>
        Создать ссылку
      </button>
      {shareUrl && <p>{shareUrl}</p>}
      <h2>История версий</h2>
      <ul>
        {versions.map((v) => (
          <li key={v.id}>
            Версия {v.version_number}
            {v.is_current ? " (текущая)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npm test -- GuidePage`
Expected: PASS (existing + new case).

- [ ] **Step 5: Commit**

```bash
cd webapp
git add src/pages/GuidePage.tsx tests/GuidePage.test.tsx
git commit -m "feat(webapp): add per-step consumer flag button (loop C)"
```

---

### Task 4: Catch-all 404 route

**Files:**
- Modify: `webapp/src/App.tsx`
- Modify: `webapp/tests/App.test.tsx`

**Interfaces:**
- Consumes: `Navigate` (react-router), the existing route table.
- Produces: a trailing `<Route path="*" element={<Navigate to="/" replace />} />` so unknown paths redirect to the library (which itself redirects to `/login` when unauthenticated via `RequireAuth`).

- [ ] **Step 1: Write the failing test — add to `webapp/tests/App.test.tsx`**

Add inside the existing `describe("App routing", ...)`:

```typescript
  it("redirects unknown paths (unauthenticated lands on login)", () => {
    renderWithProviders(<App />, { value: makeAppValue({ token: null }), route: "/totally/unknown" });
    expect(screen.getByText("Вход")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd webapp && npm test -- App.test`
Expected: FAIL (unknown path renders nothing — "Вход" not found).

- [ ] **Step 3: Add the catch-all — modify `webapp/src/App.tsx`**

Add `Navigate` to the `react-router-dom` import, and add the catch-all as the last route in the `<Routes>` block:

```typescript
import { Link, Navigate, Route, Routes } from "react-router-dom";
```

```typescript
        <Route path="/drift" element={<RequireAuth><DriftPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd webapp && npm test -- App.test`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `cd webapp && npm test`
Expected: ALL pass.

- [ ] **Step 6: Commit**

```bash
cd webapp
git add src/App.tsx tests/App.test.tsx
git commit -m "feat(webapp): add catch-all route redirecting unknown paths"
```

---

## Self-Review

**1. Spec coverage (drift design §5 loop C + Plan 4 deferred minors):**
- Loop C "флаг потребителя" (mark a step gone) → `flagDrift` API (Task 1) + GuidePage per-step button (Task 3), creating a `DriftEvent(source="flag")` the existing dashboard already surfaces. ✅
- Deferred Plan 4 minor "orgId not persisted → deep-link `/guides/:id` after reload stays on Загрузка" → orgId in localStorage + AppContext load/persist (Task 2). ✅
- Deferred Plan 4 minor "lift ApiClient out of the value useMemo" → stable `useMemo([])` (Task 2). ✅
- Deferred Plan 4 minor "no 404 fallback route" → catch-all (Task 4). ✅
- Loop A (extension passive agent) and other Plan 4 minors (error toasts, `?next=` redirect) → **out of scope**, stated. No gap against this plan's goal.

**2. Placeholder scan:** No TBD/empty steps; every code step is complete with real assertions. ✅

**3. Type consistency:** `flagDrift(token, orgId, stepId) -> DriftEventOut` (Task 1) is the signature the GuidePage test mocks and the component calls (Task 3). `loadOrgId`/`saveOrgId`/`clearOrgId` (Task 2 session) are imported by `AppContext` (Task 2). `AppValue` shape is unchanged (Plan 4) — `setOrgId(orgId: string)` matches. `Navigate` import + catch-all route match the existing `<Routes>` table. `DriftEventOut` (Plan 4 types.ts) is the flag return type. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-webapp-loop-c-and-polish.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
