# Browser Extension — Capture Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that records a user's clicks/inputs on a page as raw steps and submits them to the backend's `/generate` endpoint, producing a clean guide — the funnel entry ("record one process → get a ready guide").

**Architecture:** Pure, fully unit-tested TypeScript library modules (`src/lib/*`) hold all logic — DOM-anchor extraction, action description, the recorder state machine, the backend API client, and storage. The three Chrome surfaces are thin glue over those modules: a content script captures DOM events and maps each to a `RawStep` (via the tested `buildStepFromEvent`) and forwards it to the service worker; the service worker (`RecordingService`) accumulates steps across the popup's lifecycle and, on stop, calls the backend; the popup (`PopupController`) handles login, org/project selection, and start/stop. Tests run on the TS source via Vitest + jsdom — no build is needed to test. The build (Vite) is only for loading the unpacked extension in Chrome (manual verification).

**Tech Stack:** TypeScript, Vite (MV3 build), Vitest + jsdom (tests), Node 20+, npm. Backend it talks to: the FastAPI service from Plans 1–2.

## Global Constraints

- Node 20+; package manager **npm**; tests run with `npm test` (Vitest) from `extension/`.
- TypeScript `strict: true`.
- **Manifest V3** only.
- **Text-only capture in v1:** every `RawStep` has `screenshot_url: null`. No screenshot capture, no blob upload (the backend has no blob storage yet).
- **Privacy at capture (152-ФЗ, data minimization):** never record the *value* a user types into a field. Input steps describe the field only ("заполнить поле …"), never its contents.
- The extension talks to the backend over the exact shapes from Plans 1–2: `POST /auth/login`, `GET /auth/me`, `GET /orgs/{org_id}/projects`, `POST /orgs/{org_id}/projects/{project_id}/guides/generate`. The generate body is `{title_hint: string|null, type: "digital", raw_steps: RawStep[]}` where `RawStep = {action_text: string, dom_anchor: object|null, screenshot_url: null}`.
- The recording session lives in the **service worker** (survives popup open/close). The content script sends steps to it; the popup sends start/stop commands to it.
- Pure logic lives in `src/lib/*` and is unit-tested. Chrome API wiring (`content.ts`, `background.ts`, `popup.ts` DOM glue) is thin and verified manually by loading the unpacked build; it delegates to tested functions.
- One responsibility per file; names reveal intent (no abbreviations); no secrets in code (the backend base URL is configurable, default `http://localhost:8077`).

---

## File Structure

```
extension/
  package.json              # deps: typescript, vite, vitest, jsdom, @types/chrome
  tsconfig.json             # strict TS
  vitest.config.ts          # jsdom environment
  vite.config.ts            # MV3 multi-entry build (content/background/popup)
  public/
    manifest.json           # MV3 manifest
    popup.html              # static popup markup
  src/
    lib/
      types.ts              # shared shapes (RawStep, GenerateRequest, MeResponse, Project, ...)
      domAnchor.ts          # buildAnchor(el) -> DomAnchor
      actionText.ts         # describeAction(kind, anchor) -> string
      recorder.ts           # Recorder state machine
      api.ts                # ApiClient + ApiError
      storage.ts            # Session + load/save/clear over chrome.storage.local
    content.ts              # buildStepFromEvent(event) + listener glue
    background.ts           # RecordingService + onMessage glue
    popup.ts               # PopupController + DOM glue
  tests/
    domAnchor.test.ts
    actionText.test.ts
    recorder.test.ts
    api.test.ts
    storage.test.ts
    content.test.ts
    background.test.ts
    popup.test.ts
```

---

### Task 1: Scaffolding (npm, TypeScript, Vitest, manifest, build)

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vitest.config.ts`
- Create: `extension/vite.config.ts`
- Create: `extension/public/manifest.json`
- Create: `extension/public/popup.html`
- Create: `extension/src/lib/types.ts`
- Create: `extension/tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working Vitest setup and the shared `src/lib/types.ts` shapes that every later task imports:
  - `DomAnchor { role: string | null; text: string | null; selector: string }`
  - `RawStep { action_text: string; dom_anchor: DomAnchor | null; screenshot_url: string | null }`
  - `GenerateRequest { title_hint: string | null; type: "digital" | "offline"; raw_steps: RawStep[] }`
  - `Membership { org_id: string; role: string }`
  - `MeResponse { user_id: string; email: string; memberships: Membership[] }`
  - `Project { id: string; org_id: string; name: string; allowlist_domains: string[]; created_at: string }`
  - `AuthResult { access_token: string; user_id: string; org_id: string | null }`
  - `GuideDetailLite { id: string; title: string; version_number: number }`

- [ ] **Step 1: Create `extension/package.json`**

```json
{
  "name": "selfhealing-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "vite build"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

Run `cd extension && npm install`.

- [ ] **Step 2: Create `extension/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `extension/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 4: Create `extension/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the three extension entry points to dist/ as ES modules.
// The manifest and popup.html are copied from public/ by Vite automatically.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts"),
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "src/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});
```

- [ ] **Step 5: Create `extension/public/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Self-Healing SOP Recorder",
  "version": "0.1.0",
  "description": "Record a process and turn it into a clean guide.",
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js", "type": "module" },
  "permissions": ["storage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }
  ]
}
```

- [ ] **Step 6: Create `extension/public/popup.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <style>
      body { width: 320px; font: 14px sans-serif; padding: 12px; }
      input, button, select { width: 100%; margin: 4px 0; padding: 6px; box-sizing: border-box; }
      .hidden { display: none; }
      #status { color: #555; margin-top: 8px; }
    </style>
  </head>
  <body>
    <div id="login">
      <input id="email" type="email" placeholder="Email" />
      <input id="password" type="password" placeholder="Пароль" />
      <button id="login-btn">Войти</button>
    </div>
    <div id="main" class="hidden">
      <select id="project"></select>
      <button id="start-btn">Начать запись</button>
      <button id="stop-btn" class="hidden">Остановить и собрать гайд</button>
    </div>
    <div id="status"></div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `extension/src/lib/types.ts`**

```typescript
export interface DomAnchor {
  role: string | null;
  text: string | null;
  selector: string;
}

export interface RawStep {
  action_text: string;
  dom_anchor: DomAnchor | null;
  screenshot_url: string | null;
}

export interface GenerateRequest {
  title_hint: string | null;
  type: "digital" | "offline";
  raw_steps: RawStep[];
}

export interface Membership {
  org_id: string;
  role: string;
}

export interface MeResponse {
  user_id: string;
  email: string;
  memberships: Membership[];
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  allowlist_domains: string[];
  created_at: string;
}

export interface AuthResult {
  access_token: string;
  user_id: string;
  org_id: string | null;
}

export interface GuideDetailLite {
  id: string;
  title: string;
  version_number: number;
}
```

- [ ] **Step 8: Create `extension/tests/smoke.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import type { RawStep } from "../src/lib/types";

describe("scaffolding", () => {
  it("runs vitest and imports shared types", () => {
    const step: RawStep = { action_text: "x", dom_anchor: null, screenshot_url: null };
    expect(step.screenshot_url).toBeNull();
  });
});
```

- [ ] **Step 9: Run the test**

Run: `cd extension && npm test`
Expected: 1 passed.

- [ ] **Step 10: Commit**

```bash
cd extension
git add package.json package-lock.json tsconfig.json vitest.config.ts vite.config.ts public/ src/lib/types.ts tests/smoke.test.ts
git commit -m "feat(extension): scaffold MV3 extension with TypeScript, Vite, and Vitest"
```

---

### Task 2: DOM anchor extraction

**Files:**
- Create: `extension/src/lib/domAnchor.ts`
- Create: `extension/tests/domAnchor.test.ts`

**Interfaces:**
- Consumes: `DomAnchor` from `types.ts`.
- Produces: `buildAnchor(el: Element): DomAnchor` — `role` = explicit `role` attribute else lowercased tag name; `text` = trimmed textContent capped at 80 chars (or null if empty); `selector` = `#id` if the element has an id, else a `tag:nth-of-type(n)` chain up to 3 levels (stable role/hierarchy-based locator, not a brittle absolute xpath).

- [ ] **Step 1: Write the failing test — `extension/tests/domAnchor.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { buildAnchor } from "../src/lib/domAnchor";

describe("buildAnchor", () => {
  it("uses explicit role and text", () => {
    document.body.innerHTML = `<button id="save" role="button">Сохранить</button>`;
    const el = document.getElementById("save")!;
    const a = buildAnchor(el);
    expect(a.role).toBe("button");
    expect(a.text).toBe("Сохранить");
    expect(a.selector).toBe("#save");
  });

  it("falls back to tag name when no role and builds an nth-of-type chain", () => {
    document.body.innerHTML = `<div><span>one</span><span>two</span></div>`;
    const el = document.querySelectorAll("span")[1] as Element;
    const a = buildAnchor(el);
    expect(a.role).toBe("span");
    expect(a.text).toBe("two");
    expect(a.selector).toContain("span:nth-of-type(2)");
  });

  it("returns null text for empty elements", () => {
    document.body.innerHTML = `<input id="f" />`;
    const a = buildAnchor(document.getElementById("f")!);
    expect(a.text).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- domAnchor`
Expected: FAIL (cannot find module `../src/lib/domAnchor`).

- [ ] **Step 3: Create `extension/src/lib/domAnchor.ts`**

```typescript
import type { DomAnchor } from "./types";

function buildSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 3) {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
    depth += 1;
  }
  return parts.join(" > ");
}

export function buildAnchor(el: Element): DomAnchor {
  const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
  const rawText = (el.textContent ?? "").trim();
  const text = rawText.length > 0 ? rawText.slice(0, 80) : null;
  return { role, text, selector: buildSelector(el) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- domAnchor`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/domAnchor.ts tests/domAnchor.test.ts
git commit -m "feat(extension): add DOM anchor extraction"
```

---

### Task 3: Action description (privacy-preserving)

**Files:**
- Create: `extension/src/lib/actionText.ts`
- Create: `extension/tests/actionText.test.ts`

**Interfaces:**
- Consumes: `DomAnchor` from `types.ts`.
- Produces: `type ActionKind = "click" | "input"` and `describeAction(kind: ActionKind, anchor: DomAnchor): string` — a Russian action phrase. For `input` it NEVER includes the typed value (privacy): "заполнить поле «…»". For `click`: "нажать «…»". The label is the anchor text in guillemets when present, else the role.

- [ ] **Step 1: Write the failing test — `extension/tests/actionText.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { describeAction } from "../src/lib/actionText";

describe("describeAction", () => {
  it("describes a click with the element text", () => {
    expect(describeAction("click", { role: "button", text: "Сохранить", selector: "#s" }))
      .toBe("нажать «Сохранить»");
  });

  it("uses role when there is no text", () => {
    expect(describeAction("click", { role: "button", text: null, selector: "#s" }))
      .toBe("нажать button");
  });

  it("describes input WITHOUT the typed value (privacy)", () => {
    const out = describeAction("input", { role: "textbox", text: "Email", selector: "#e" });
    expect(out).toBe("заполнить поле «Email»");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- actionText`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Create `extension/src/lib/actionText.ts`**

```typescript
import type { DomAnchor } from "./types";

export type ActionKind = "click" | "input";

export function describeAction(kind: ActionKind, anchor: DomAnchor): string {
  const label = anchor.text ? `«${anchor.text}»` : anchor.role ?? "элемент";
  if (kind === "input") {
    return `заполнить поле ${label}`;
  }
  return `нажать ${label}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- actionText`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/actionText.ts tests/actionText.test.ts
git commit -m "feat(extension): add privacy-preserving action description"
```

---

### Task 4: Recorder state machine

**Files:**
- Create: `extension/src/lib/recorder.ts`
- Create: `extension/tests/recorder.test.ts`

**Interfaces:**
- Consumes: `RawStep` from `types.ts`.
- Produces: class `Recorder` with `start(): void` (resets and begins), `isRecording(): boolean`, `add(step: RawStep): void` (ignored unless recording), `count(): number`, `stop(): RawStep[]` (returns a copy and stops).

- [ ] **Step 1: Write the failing test — `extension/tests/recorder.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { Recorder } from "../src/lib/recorder";
import type { RawStep } from "../src/lib/types";

const step = (t: string): RawStep => ({ action_text: t, dom_anchor: null, screenshot_url: null });

describe("Recorder", () => {
  it("ignores steps added before start", () => {
    const r = new Recorder();
    r.add(step("a"));
    expect(r.count()).toBe(0);
  });

  it("collects steps while recording and stop returns a copy", () => {
    const r = new Recorder();
    r.start();
    r.add(step("a"));
    r.add(step("b"));
    expect(r.isRecording()).toBe(true);
    const result = r.stop();
    expect(result.map((s) => s.action_text)).toEqual(["a", "b"]);
    expect(r.isRecording()).toBe(false);
    result.push(step("c")); // mutating the returned array must not affect internal state
    expect(r.count()).toBe(2);
  });

  it("start resets previously collected steps", () => {
    const r = new Recorder();
    r.start();
    r.add(step("a"));
    r.start();
    expect(r.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- recorder`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Create `extension/src/lib/recorder.ts`**

```typescript
import type { RawStep } from "./types";

export class Recorder {
  private steps: RawStep[] = [];
  private recording = false;

  start(): void {
    this.recording = true;
    this.steps = [];
  }

  isRecording(): boolean {
    return this.recording;
  }

  add(step: RawStep): void {
    if (this.recording) {
      this.steps.push(step);
    }
  }

  count(): number {
    return this.steps.length;
  }

  stop(): RawStep[] {
    this.recording = false;
    return [...this.steps];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- recorder`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/recorder.ts tests/recorder.test.ts
git commit -m "feat(extension): add recorder state machine"
```

---

### Task 5: Backend API client

**Files:**
- Create: `extension/src/lib/api.ts`
- Create: `extension/tests/api.test.ts`

**Interfaces:**
- Consumes: `AuthResult, GenerateRequest, GuideDetailLite, MeResponse, Project` from `types.ts`.
- Produces:
  - class `ApiError extends Error` with `status: number`.
  - class `ApiClient` constructed with `baseUrl: string`, methods:
    - `login(email: string, password: string): Promise<AuthResult>` → POST `/auth/login`.
    - `me(token: string): Promise<MeResponse>` → GET `/auth/me`.
    - `listProjects(token: string, orgId: string): Promise<Project[]>` → GET `/orgs/{orgId}/projects`.
    - `generate(token: string, orgId: string, projectId: string, body: GenerateRequest): Promise<GuideDetailLite>` → POST `/orgs/{orgId}/projects/{projectId}/guides/generate`.
  - Non-2xx responses throw `ApiError` carrying the status.

- [ ] **Step 1: Write the failing test — `extension/tests/api.test.ts`**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "../src/lib/api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("ApiClient", () => {
  it("login posts credentials and returns the auth result", async () => {
    const fetchFn = mockFetch(200, { access_token: "tok", user_id: "u1", org_id: "o1" });
    const api = new ApiClient("http://localhost:8077");
    const res = await api.login("a@b.ru", "pw");
    expect(res.access_token).toBe("tok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.ru", password: "pw" });
  });

  it("me sends the bearer token", async () => {
    const fetchFn = mockFetch(200, { user_id: "u1", email: "a@b.ru", memberships: [] });
    const api = new ApiClient("http://localhost:8077");
    await api.me("tok");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/auth/me");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("generate posts the request body to the right path", async () => {
    const fetchFn = mockFetch(201, { id: "g1", title: "T", version_number: 1 });
    const api = new ApiClient("http://localhost:8077");
    const res = await api.generate("tok", "o1", "p1", {
      title_hint: null,
      type: "digital",
      raw_steps: [{ action_text: "нажать «Сохранить»", dom_anchor: null, screenshot_url: null }],
    });
    expect(res.id).toBe("g1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://localhost:8077/orgs/o1/projects/p1/guides/generate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).raw_steps).toHaveLength(1);
  });

  it("throws ApiError with the status on non-2xx", async () => {
    mockFetch(401, { detail: "bad" });
    const api = new ApiClient("http://localhost:8077");
    await expect(api.login("a@b.ru", "wrong")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    await expect(api.login("a@b.ru", "wrong")).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- api`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Create `extension/src/lib/api.ts`**

```typescript
import type { AuthResult, GenerateRequest, GuideDetailLite, MeResponse, Project } from "./types";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export class ApiClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) {
      headers.Authorization = `Bearer ${opts.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status);
    }
    return (await res.json()) as T;
  }

  login(email: string, password: string): Promise<AuthResult> {
    return this.request<AuthResult>("/auth/login", { method: "POST", body: { email, password } });
  }

  me(token: string): Promise<MeResponse> {
    return this.request<MeResponse>("/auth/me", { token });
  }

  listProjects(token: string, orgId: string): Promise<Project[]> {
    return this.request<Project[]>(`/orgs/${orgId}/projects`, { token });
  }

  generate(
    token: string,
    orgId: string,
    projectId: string,
    body: GenerateRequest,
  ): Promise<GuideDetailLite> {
    return this.request<GuideDetailLite>(
      `/orgs/${orgId}/projects/${projectId}/guides/generate`,
      { method: "POST", body, token },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- api`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/api.ts tests/api.test.ts
git commit -m "feat(extension): add backend API client"
```

---

### Task 6: Session storage

**Files:**
- Create: `extension/src/lib/storage.ts`
- Create: `extension/tests/storage.test.ts`

**Interfaces:**
- Consumes: `chrome.storage.local` (typed via `@types/chrome`).
- Produces:
  - `interface Session { token: string; baseUrl: string; orgId: string | null; projectId: string | null }`.
  - `loadSession(): Promise<Session | null>`, `saveSession(session: Session): Promise<void>`, `clearSession(): Promise<void>` — persisted under the key `"shsop_session"`.

- [ ] **Step 1: Write the failing test — `extension/tests/storage.test.ts`**

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, loadSession, saveSession, type Session } from "../src/lib/storage";

beforeEach(() => {
  const store: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
        remove: async (key: string) => {
          delete store[key];
        },
      },
    },
  };
});

const session: Session = { token: "t", baseUrl: "http://localhost:8077", orgId: "o1", projectId: null };

describe("session storage", () => {
  it("returns null when nothing saved", async () => {
    expect(await loadSession()).toBeNull();
  });

  it("round-trips a saved session", async () => {
    await saveSession(session);
    expect(await loadSession()).toEqual(session);
  });

  it("clears the session", async () => {
    await saveSession(session);
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- storage`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Create `extension/src/lib/storage.ts`**

```typescript
export interface Session {
  token: string;
  baseUrl: string;
  orgId: string | null;
  projectId: string | null;
}

const KEY = "shsop_session";

export async function loadSession(): Promise<Session | null> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as Session | undefined) ?? null;
}

export async function saveSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- storage`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/lib/storage.ts tests/storage.test.ts
git commit -m "feat(extension): add session storage over chrome.storage.local"
```

---

### Task 7: Content script (event → step)

**Files:**
- Create: `extension/src/content.ts`
- Create: `extension/tests/content.test.ts`

**Interfaces:**
- Consumes: `buildAnchor` (Task 2), `describeAction`/`ActionKind` (Task 3), `RawStep` (Task 1).
- Produces: `buildStepFromEvent(event: Event): RawStep | null` — maps a DOM `click`/`change` event to a `RawStep` (`change` → input kind, otherwise click); returns `null` when the target is not an `Element`. The module also attaches capturing listeners and forwards steps to the service worker via `chrome.runtime.sendMessage({ type: "step", step })` — but only when `chrome.runtime` exists (so importing the module under test is side-effect-safe). `screenshot_url` is always `null`.

- [ ] **Step 1: Write the failing test — `extension/tests/content.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { buildStepFromEvent } from "../src/content";

describe("buildStepFromEvent", () => {
  it("maps a click to a click step", () => {
    document.body.innerHTML = `<button id="s" role="button">Сохранить</button>`;
    const el = document.getElementById("s")!;
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: el });
    const step = buildStepFromEvent(event);
    expect(step).not.toBeNull();
    expect(step!.action_text).toBe("нажать «Сохранить»");
    expect(step!.dom_anchor!.selector).toBe("#s");
    expect(step!.screenshot_url).toBeNull();
  });

  it("maps a change to an input step without the typed value", () => {
    document.body.innerHTML = `<input id="e" role="textbox" />`;
    const el = document.getElementById("e") as HTMLInputElement;
    el.value = "secret@private.ru";
    const event = new Event("change");
    Object.defineProperty(event, "target", { value: el });
    const step = buildStepFromEvent(event)!;
    expect(step.action_text).toContain("заполнить поле");
    expect(step.action_text).not.toContain("secret@private.ru");
  });

  it("returns null when target is not an element", () => {
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: null });
    expect(buildStepFromEvent(event)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- content`
Expected: FAIL (cannot find module `../src/content`).

- [ ] **Step 3: Create `extension/src/content.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- content`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/content.ts tests/content.test.ts
git commit -m "feat(extension): add content-script event-to-step mapping"
```

---

### Task 8: Service worker recording service

**Files:**
- Create: `extension/src/background.ts`
- Create: `extension/tests/background.test.ts`

**Interfaces:**
- Consumes: `Recorder` (Task 4), `ApiClient` (Task 5), `Session` (Task 6), `RawStep`/`GuideDetailLite` (Task 1).
- Produces: class `RecordingService` constructed with an `ApiClient`, methods:
  - `start(): void`, `addStep(step: RawStep): void`, `count(): number`, `isRecording(): boolean`.
  - `stopAndGenerate(session: Session, titleHint: string | null): Promise<GuideDetailLite>` — stops, requires `session.orgId` and `session.projectId` (throws `Error("project not selected")` otherwise), calls `api.generate(session.token, session.orgId, session.projectId, { title_hint, type: "digital", raw_steps })`.
  - The module also wires `chrome.runtime.onMessage` (thin glue) to drive a singleton `RecordingService` (guarded by `chrome.runtime?.id` so import is side-effect-safe in tests).

- [ ] **Step 1: Write the failing test — `extension/tests/background.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { RecordingService } from "../src/background";
import type { Session } from "../src/lib/storage";
import type { RawStep } from "../src/lib/types";

const step = (t: string): RawStep => ({ action_text: t, dom_anchor: null, screenshot_url: null });
const session = (over: Partial<Session> = {}): Session => ({
  token: "tok",
  baseUrl: "http://localhost:8077",
  orgId: "o1",
  projectId: "p1",
  ...over,
});

describe("RecordingService", () => {
  it("collects steps and generates with them on stop", async () => {
    const api = { generate: vi.fn().mockResolvedValue({ id: "g1", title: "T", version_number: 1 }) };
    const svc = new RecordingService(api as never);
    svc.start();
    svc.addStep(step("a"));
    svc.addStep(step("b"));
    expect(svc.count()).toBe(2);
    const result = await svc.stopAndGenerate(session(), "возврат");
    expect(result.id).toBe("g1");
    expect(api.generate).toHaveBeenCalledWith("tok", "o1", "p1", {
      title_hint: "возврат",
      type: "digital",
      raw_steps: [step("a"), step("b")],
    });
  });

  it("throws when no project is selected", async () => {
    const api = { generate: vi.fn() };
    const svc = new RecordingService(api as never);
    svc.start();
    await expect(svc.stopAndGenerate(session({ projectId: null }), null)).rejects.toThrow(
      "project not selected",
    );
    expect(api.generate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- background`
Expected: FAIL (cannot find module `../src/background`).

- [ ] **Step 3: Create `extension/src/background.ts`**

```typescript
import { ApiClient } from "./lib/api";
import { Recorder } from "./lib/recorder";
import type { Session } from "./lib/storage";
import type { GuideDetailLite, RawStep } from "./lib/types";

export class RecordingService {
  private recorder = new Recorder();

  constructor(private api: ApiClient) {}

  start(): void {
    this.recorder.start();
  }

  addStep(step: RawStep): void {
    this.recorder.add(step);
  }

  count(): number {
    return this.recorder.count();
  }

  isRecording(): boolean {
    return this.recorder.isRecording();
  }

  async stopAndGenerate(session: Session, titleHint: string | null): Promise<GuideDetailLite> {
    const steps = this.recorder.stop();
    if (!session.orgId || !session.projectId) {
      throw new Error("project not selected");
    }
    return this.api.generate(session.token, session.orgId, session.projectId, {
      title_hint: titleHint,
      type: "digital",
      raw_steps: steps,
    });
  }
}

// Glue: a singleton service driven by runtime messages. Guarded so importing
// the module under test has no side effects.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  const service = new RecordingService(new ApiClient("http://localhost:8077"));
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
      return true; // keep the message channel open for the async response
    }
    return false;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- background`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
cd extension
git add src/background.ts tests/background.test.ts
git commit -m "feat(extension): add service-worker recording service"
```

---

### Task 9: Popup controller + DOM wiring + manual verification

**Files:**
- Create: `extension/src/popup.ts`
- Create: `extension/tests/popup.test.ts`
- Create: `extension/README.md`

**Interfaces:**
- Consumes: `ApiClient` (Task 5), `Session`/`saveSession`/`loadSession` (Task 6), `Project`/`MeResponse` (Task 1).
- Produces: class `PopupController` constructed with `{ api: ApiClient; baseUrl: string; save: (s: Session) => Promise<void>; load: () => Promise<Session | null> }`, methods:
  - `login(email: string, password: string): Promise<void>` — calls `api.login`, builds a `Session { token, baseUrl, orgId: null, projectId: null }`, saves it, stores it as the controller's current session.
  - `loadProjects(): Promise<Project[]>` — requires a logged-in session; calls `api.me`, picks the first membership's `org_id` (sets `session.orgId`, saves), then `api.listProjects` and returns the list.
  - `selectProject(projectId: string): Promise<void>` — sets `session.projectId` and saves.
  - `getSession(): Session | null`.
  - The module also wires the popup DOM (buttons → controller, start/stop → `chrome.runtime.sendMessage`) under a `chrome.runtime?.id` guard (thin glue, verified manually).

- [ ] **Step 1: Write the failing test — `extension/tests/popup.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { PopupController } from "../src/popup";
import type { Session } from "../src/lib/storage";

function makeController(apiOverrides: Record<string, unknown>) {
  let saved: Session | null = null;
  const api = {
    login: vi.fn(),
    me: vi.fn(),
    listProjects: vi.fn(),
    generate: vi.fn(),
    ...apiOverrides,
  };
  const ctrl = new PopupController({
    api: api as never,
    baseUrl: "http://localhost:8077",
    save: async (s: Session) => {
      saved = s;
    },
    load: async () => saved,
  });
  return { ctrl, api, getSaved: () => saved };
}

describe("PopupController", () => {
  it("login builds and saves a session", async () => {
    const { ctrl, getSaved } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
    });
    await ctrl.login("a@b.ru", "pw");
    expect(getSaved()).toEqual({
      token: "tok",
      baseUrl: "http://localhost:8077",
      orgId: null,
      projectId: null,
    });
    expect(ctrl.getSession()?.token).toBe("tok");
  });

  it("loadProjects resolves the org from /me and lists projects", async () => {
    const { ctrl, api } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
      me: vi.fn().mockResolvedValue({
        user_id: "u1",
        email: "a@b.ru",
        memberships: [{ org_id: "o1", role: "owner" }],
      }),
      listProjects: vi.fn().mockResolvedValue([
        { id: "p1", org_id: "o1", name: "Support", allowlist_domains: [], created_at: "" },
      ]),
    });
    await ctrl.login("a@b.ru", "pw");
    const projects = await ctrl.loadProjects();
    expect(projects).toHaveLength(1);
    expect(api.listProjects).toHaveBeenCalledWith("tok", "o1");
    expect(ctrl.getSession()?.orgId).toBe("o1");
  });

  it("selectProject persists the choice", async () => {
    const { ctrl, getSaved } = makeController({
      login: vi.fn().mockResolvedValue({ access_token: "tok", user_id: "u1", org_id: "o1" }),
    });
    await ctrl.login("a@b.ru", "pw");
    await ctrl.selectProject("p1");
    expect(getSaved()?.projectId).toBe("p1");
    expect(ctrl.getSession()?.projectId).toBe("p1");
  });

  it("loadProjects without a session throws", async () => {
    const { ctrl } = makeController({});
    await expect(ctrl.loadProjects()).rejects.toThrow("not logged in");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extension && npm test -- popup`
Expected: FAIL (cannot find module `../src/popup`).

- [ ] **Step 3: Create `extension/src/popup.ts`**

```typescript
import { ApiClient } from "./lib/api";
import { loadSession, saveSession, type Session } from "./lib/storage";
import type { Project } from "./lib/types";

interface PopupDeps {
  api: ApiClient;
  baseUrl: string;
  save: (s: Session) => Promise<void>;
  load: () => Promise<Session | null>;
}

export class PopupController {
  private session: Session | null = null;

  constructor(private deps: PopupDeps) {}

  getSession(): Session | null {
    return this.session;
  }

  async login(email: string, password: string): Promise<void> {
    const auth = await this.deps.api.login(email, password);
    this.session = {
      token: auth.access_token,
      baseUrl: this.deps.baseUrl,
      orgId: null,
      projectId: null,
    };
    await this.deps.save(this.session);
  }

  async loadProjects(): Promise<Project[]> {
    if (!this.session) {
      throw new Error("not logged in");
    }
    const me = await this.deps.api.me(this.session.token);
    const first = me.memberships[0];
    if (!first) {
      throw new Error("no organization membership");
    }
    this.session = { ...this.session, orgId: first.org_id };
    await this.deps.save(this.session);
    return this.deps.api.listProjects(this.session.token, first.org_id);
  }

  async selectProject(projectId: string): Promise<void> {
    if (!this.session) {
      throw new Error("not logged in");
    }
    this.session = { ...this.session, projectId };
    await this.deps.save(this.session);
  }
}

// Glue: wire the popup DOM. Guarded so importing under test has no side effects.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  const baseUrl = "http://localhost:8077";
  const controller = new PopupController({
    api: new ApiClient(baseUrl),
    baseUrl,
    save: saveSession,
    load: loadSession,
  });

  const $ = (id: string) => document.getElementById(id)!;
  const setStatus = (text: string) => {
    $("status").textContent = text;
  };

  async function showMain(): Promise<void> {
    $("login").classList.add("hidden");
    $("main").classList.remove("hidden");
    const projects = await controller.loadProjects();
    const select = $("project") as HTMLSelectElement;
    select.innerHTML = "";
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
    if (projects[0]) {
      await controller.selectProject(projects[0].id);
    }
  }

  $("login-btn").addEventListener("click", async () => {
    try {
      await controller.login(
        ($("email") as HTMLInputElement).value,
        ($("password") as HTMLInputElement).value,
      );
      await showMain();
    } catch (err) {
      setStatus(`Ошибка входа: ${(err as Error).message}`);
    }
  });

  ($("project") as HTMLSelectElement).addEventListener("change", async (e) => {
    await controller.selectProject((e.target as HTMLSelectElement).value);
  });

  $("start-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "start" });
    $("start-btn").classList.add("hidden");
    $("stop-btn").classList.remove("hidden");
    setStatus("Идёт запись…");
  });

  $("stop-btn").addEventListener("click", () => {
    setStatus("Собираю гайд…");
    chrome.runtime.sendMessage(
      { type: "stop", session: controller.getSession(), titleHint: null },
      (resp) => {
        $("stop-btn").classList.add("hidden");
        $("start-btn").classList.remove("hidden");
        if (resp?.ok) {
          setStatus(`Готово: гайд ${resp.guide.id} (v${resp.guide.version_number})`);
        } else {
          setStatus(`Ошибка: ${resp?.error ?? "неизвестно"}`);
        }
      },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extension && npm test -- popup`
Expected: PASS (4 passed).

- [ ] **Step 5: Run the full test suite**

Run: `cd extension && npm test`
Expected: ALL pass (smoke, domAnchor, actionText, recorder, api, storage, content, background, popup).

- [ ] **Step 6: Create `extension/README.md` (manual load + verify instructions)**

```markdown
# Self-Healing SOP Recorder (Chrome extension)

MVP browser extension: record clicks/inputs on a page → submit raw steps to the
backend `/generate` endpoint → get a clean guide. Text-only capture (no
screenshots); typed field values are never recorded.

## Develop & test

```bash
npm install
npm test        # Vitest unit tests (no build needed)
npm run build   # produces dist/ for loading in Chrome
```

## Load in Chrome (manual verification)

1. Start the backend on `http://localhost:8077` (see backend/ — run uvicorn against Postgres).
2. `npm run build`, then open `chrome://extensions`, enable Developer mode,
   "Load unpacked", and select `extension/dist`.
3. Click the extension icon, log in with a backend account, pick a project.
4. Click "Начать запись", perform a few clicks on any page, then
   "Остановить и собрать гайд". The status line shows the created guide id.

The backend base URL is `http://localhost:8077` (hardcoded in `src/background.ts`
and `src/popup.ts` for the MVP; make it configurable in a later iteration).
```

- [ ] **Step 7: Commit**

```bash
cd extension
git add src/popup.ts tests/popup.test.ts README.md
git commit -m "feat(extension): add popup controller, DOM wiring, and dev README"
```

---

## Self-Review

**1. Spec coverage (design §4 component 1 "Браузерное расширение (capture)" and §7 funnel step 1):**
- Capture user actions → steps: content script `buildStepFromEvent` (Task 7) maps clicks/inputs to `RawStep`. ✅
- DOM anchor (role/text/hierarchy, not brittle xpath) per §5.2: `buildAnchor` (Task 2). ✅
- Produce a guide from one recording (§7 "записывает 1 процесс → получает готовый гайд"): recorder (Task 4) + service worker generate (Task 8) + popup flow (Task 9) calling `/generate`. ✅
- Auth + project selection so the guide lands in the right tenant/project: popup `login`/`loadProjects`/`selectProject` (Task 9) over the Plan 1/2 endpoints. ✅
- Privacy/152-ФЗ (data minimization): input values never captured — `describeAction` (Task 3) and asserted in Task 7. Screenshots out of scope (text-only, stated in Global Constraints). ✅
- Offline capture (video/photo uploader) from §4 — **explicitly out of scope** for this plan (needs blob storage; deferred), consistent with the text-only MVP. No gap against the funnel-entry goal.
- Drift agent (background fingerprint capture) from §4/§5 — **Plan 5**, not here. The `dom_anchor` this plan captures is the same shape the drift engine will compare. No gap.

**2. Placeholder scan:** No TBD/TODO/"handle errors" placeholders; every code step is complete, every test has real assertions. The Chrome glue is guarded and delegates to tested functions; the README documents the one manual step (load unpacked). ✅

**3. Type consistency:** `RawStep`/`DomAnchor`/`GenerateRequest`/`Project`/`MeResponse`/`AuthResult`/`GuideDetailLite` (Task 1) are imported unchanged everywhere. `buildAnchor(el): DomAnchor` (Task 2) → consumed by `buildStepFromEvent` (Task 7). `describeAction(kind, anchor)` + `ActionKind` (Task 3) → consumed by Task 7. `Recorder` API (Task 4) → used by `RecordingService` (Task 8). `ApiClient` methods (Task 5) → used by `RecordingService` (Task 8) and `PopupController` (Task 9). `Session` + `saveSession`/`loadSession` (Task 6) → used by Tasks 8 and 9. The generate body matches Plan 2's `GenerateGuideRequest` exactly (`title_hint`, `type`, `raw_steps` of `{action_text, dom_anchor, screenshot_url}`). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-browser-extension-capture.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
