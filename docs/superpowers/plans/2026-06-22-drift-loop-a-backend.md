# Drift Loop A — Backend Foundation Implementation Plan (Plan 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the backend what loop A's (future) extension passive-agent needs — store the page URL on each step, and expose an "observable steps for this URL" lookup that returns documented steps on allowlisted domains so the agent can re-observe them and call `/drift/observe`.

**Architecture:** Add a queryable nullable `Step.url` column (populated at guide creation and AI generation, alongside the URL already inside the fingerprint). A new `GET /orgs/{org_id}/steps/observable?url=...` endpoint returns the steps of guides' **current** versions whose `url` matches, gated server-side by the owning project's domain allowlist (design §5.3). All backend, fully endpoint-tested; the extension agent that consumes this is a separate deferred plan.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, pytest + Starlette TestClient, uv.

## Global Constraints

- Python 3.12; uv (`uv run pytest` from `backend/`).
- This plan is **backend only**. The extension passive agent (re-capture → call `/drift/observe`) is a separate deferred plan; this lays its server-side foundation.
- `Step.url` is a nullable `String(1000)` column — queryable (unlike a value buried in the JSON fingerprint). Steps created before this plan have `url = NULL`.
- URL is captured/stored forward-looking: AI generation and manual guide creation set it when provided; existing data is unaffected.
- The observable lookup enforces design §5.3 **server-side**: a step is only returned if the **host** of the requested URL is in the owning project's `allowlist_domains`. Host match is **exact** (`urlparse(url).hostname in allowlist_domains`) for v1.
- Only steps in a guide's **current version** are observable (we never re-observe superseded versions).
- Multi-tenant isolation: the lookup is scoped to the path `org_id`; SQLAlchemy 2.0 `select()`; reuse existing helpers/models.
- Reuse, don't reimplement: `Step`/`Guide`/`Project` models, `app.routers.guides._create_version`/`build_guide_detail`, `app.schemas.guide.{StepInput, StepOut}`, `app.routers.generate._build_fingerprint`, `app.ai.schemas.RawStep`, `app.deps.get_membership`.

---

## File Structure

```
backend/
  app/
    models/step.py             # MODIFY: add url column
    schemas/guide.py           # MODIFY: StepInput + StepOut gain url; add ObservableStep
    routers/guides.py          # MODIFY: _create_version sets Step.url; build_guide_detail returns url; add observable endpoint
    ai/schemas.py              # MODIFY: RawStep gains url
    routers/generate.py        # MODIFY: map raw url into StepInput + fingerprint
  alembic/versions/
    <id>_add_step_url.py       # NEW migration adding steps.url
  tests/
    test_step_url.py           # NEW (Task 1)
    test_generate.py           # MODIFY (Task 2: url stored through generation)
    test_observable_steps.py   # NEW (Task 3)
```

---

### Task 1: Add `Step.url` (model + migration + schemas + create/read wiring)

**Files:**
- Modify: `backend/app/models/step.py`
- Modify: `backend/app/schemas/guide.py`
- Modify: `backend/app/routers/guides.py`
- Create: `backend/alembic/versions/9a1c7e2b4d10_add_step_url.py`
- Create: `backend/tests/test_step_url.py`

**Interfaces:**
- Consumes: existing `Step`, `StepInput`, `StepOut`, `_create_version`, `build_guide_detail`.
- Produces:
  - `Step.url: Mapped[str | None]` (`String(1000)`, nullable).
  - `StepInput` gains `url: str | None = None`; `StepOut` gains `url: str | None`.
  - `_create_version` persists `Step.url` from `StepInput.url`; `build_guide_detail` returns `url` in each `StepOut`.
  - Alembic migration `9a1c7e2b4d10` (down_revision `7c39f94cfd69`) adding `steps.url`.

- [ ] **Step 1: Write the failing test — `backend/tests/test_step_url.py`**

```python
def _owner(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    return org_id, pid, h


def test_step_url_round_trips_through_guide_creation(client):
    org_id, pid, h = _owner(client)
    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "G",
            "type": "digital",
            "steps": [
                {"text": "Открыть сделку", "url": "https://crm.acme.ru/deals/1"},
                {"text": "Сохранить"},
            ],
        },
        headers=h,
    )
    assert resp.status_code == 201
    steps = resp.json()["steps"]
    assert steps[0]["url"] == "https://crm.acme.ru/deals/1"
    assert steps[1]["url"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_step_url.py -v`
Expected: FAIL — `StepInput`/`StepOut` have no `url` (validation/KeyError or the response lacks `url`).

- [ ] **Step 3: Add the column — modify `backend/app/models/step.py`**

Add the `url` column to the `Step` model (after `media_url`):

```python
    media_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
```

- [ ] **Step 4: Add `url` to the schemas — modify `backend/app/schemas/guide.py`**

In `StepInput` add `url`:

```python
class StepInput(BaseModel):
    text: str
    media_url: str | None = None
    fingerprint: dict | None = None
    url: str | None = None
```

In `StepOut` add `url`:

```python
class StepOut(BaseModel):
    id: str
    order_index: int
    text: str
    media_url: str | None
    fingerprint: dict | None
    url: str | None
```

- [ ] **Step 5: Wire create + read — modify `backend/app/routers/guides.py`**

In `_create_version`, set `url` when constructing each `Step`:

```python
        db.add(
            Step(
                version_id=version.id,
                order_index=idx,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
                url=s.url,
            )
        )
```

In `build_guide_detail`, include `url` in each `StepOut`:

```python
            StepOut(
                id=s.id,
                order_index=s.order_index,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
                url=s.url,
            )
```

- [ ] **Step 6: Add the Alembic migration — create `backend/alembic/versions/9a1c7e2b4d10_add_step_url.py`**

```python
"""add steps.url

Revision ID: 9a1c7e2b4d10
Revises: 7c39f94cfd69
Create Date: 2026-06-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9a1c7e2b4d10"
down_revision: Union[str, None] = "7c39f94cfd69"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("steps", sa.Column("url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("steps", "url")
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_step_url.py -v`
Expected: PASS (1 passed). Tests use SQLite `create_all`, which picks up the new column automatically; the migration is for Postgres.

- [ ] **Step 8: Run the full suite (no regressions)**

Run: `cd backend && uv run pytest -q`
Expected: ALL pass (existing guide/version/generate tests still pass — `StepOut.url` is additive; older tests don't assert it).

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/models/step.py app/schemas/guide.py app/routers/guides.py alembic/versions/9a1c7e2b4d10_add_step_url.py tests/test_step_url.py
git commit -m "feat(drift): add queryable step url column and wire it through create/read"
```

---

### Task 2: Store the URL through AI generation

**Files:**
- Modify: `backend/app/ai/schemas.py`
- Modify: `backend/app/routers/generate.py`
- Modify: `backend/tests/test_generate.py`

**Interfaces:**
- Consumes: `RawStep` (ai), `_build_fingerprint`, `StepInput` (now with `url`).
- Produces: `RawStep` gains `url: str | None = None`; `generate_guide` maps each raw step's `url` into both the created `StepInput.url` and the fingerprint dict (`_build_fingerprint` adds `"url"`).

- [ ] **Step 1: Add `url` to RawStep — modify `backend/app/ai/schemas.py`**

```python
class RawStep(BaseModel):
    action_text: str
    dom_anchor: dict | None = None
    screenshot_url: str | None = None
    url: str | None = None
```

- [ ] **Step 2: Write the failing test — add to `backend/tests/test_generate.py`**

Add this test (the `_owner_with_project`, `_use_fake`, and `_clear_ai_override` helpers already exist in this file):

```python
def test_generate_stores_step_url_and_fingerprint(client):
    org_id, pid, h = _owner_with_project(client)
    _use_fake(
        GeneratedGuide(title="G", steps=[GeneratedStep(text="Открыть сделку")])
    )
    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides/generate",
        json={
            "type": "digital",
            "raw_steps": [
                {"action_text": "клик по сделке", "url": "https://crm.acme.ru/deals/1"}
            ],
        },
        headers=h,
    )
    assert resp.status_code == 201
    step = resp.json()["steps"][0]
    assert step["url"] == "https://crm.acme.ru/deals/1"
    assert step["fingerprint"]["url"] == "https://crm.acme.ru/deals/1"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_generate.py::test_generate_stores_step_url_and_fingerprint -v`
Expected: FAIL — `step["url"]` is `None` / `fingerprint` has no `url`.

- [ ] **Step 4: Map the URL — modify `backend/app/routers/generate.py`**

Update `_build_fingerprint` to include the URL:

```python
def _build_fingerprint(raw: RawStep, generated_text: str) -> dict:
    return {
        "dom_anchor": raw.dom_anchor,
        "semantics": generated_text,
        "screenshot_url": raw.screenshot_url,
        "url": raw.url,
    }
```

Update the `StepInput` construction in `generate_guide` to carry the URL:

```python
    steps = [
        StepInput(
            text=g.text,
            media_url=r.screenshot_url,
            fingerprint=_build_fingerprint(r, g.text),
            url=r.url,
        )
        for g, r in zip(generated.steps, redacted)
    ]
```

> The `redacted` RawStep list already preserves `url` — redaction only rewrites `action_text`. If the redaction comprehension in `generate_guide` constructs `RawStep(...)` explicitly, make sure it also passes `url=s.url`:
>
> ```python
>     redacted = [
>         RawStep(
>             action_text=redact_pii(s.action_text),
>             dom_anchor=s.dom_anchor,
>             screenshot_url=s.screenshot_url,
>             url=s.url,
>         )
>         for s in payload.raw_steps
>     ]
> ```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_generate.py -v`
Expected: PASS (all generate tests, including the new one).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/ai/schemas.py app/routers/generate.py tests/test_generate.py
git commit -m "feat(drift): carry captured step url through AI generation"
```

---

### Task 3: Observable-steps lookup endpoint

**Files:**
- Modify: `backend/app/schemas/guide.py`
- Modify: `backend/app/routers/guides.py`
- Create: `backend/tests/test_observable_steps.py`

**Interfaces:**
- Consumes: `Step`, `Guide`, `Project` models; `app.deps.get_membership`; `urllib.parse.urlparse`.
- Produces:
  - Schema `ObservableStep(step_id: str, guide_id: str, url: str | None, fingerprint: dict | None)`.
  - `GET /orgs/{org_id}/steps/observable?url=<url>` (any member) — returns the steps of **current** versions of the org's guides whose `Step.url == url` AND whose owning project's `allowlist_domains` contains the URL's host. Returns `[]` when the host isn't allowlisted or nothing matches.

- [ ] **Step 1: Add the schema — modify `backend/app/schemas/guide.py`**

```python
class ObservableStep(BaseModel):
    step_id: str
    guide_id: str
    url: str | None
    fingerprint: dict | None
```

- [ ] **Step 2: Write the failing test — `backend/tests/test_observable_steps.py`**

```python
def _guide_with_url(client, allowlist, step_url):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(
        f"/orgs/{org_id}/projects",
        json={"name": "P", "allowlist_domains": allowlist},
        headers=h,
    ).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "Открыть", "url": step_url}]},
        headers=h,
    ).json()
    return org_id, g["id"], h


def test_observable_returns_step_on_allowlisted_domain(client):
    url = "https://crm.acme.ru/deals/1"
    org_id, guide_id, h = _guide_with_url(client, ["crm.acme.ru"], url)
    resp = client.get(f"/orgs/{org_id}/steps/observable", params={"url": url}, headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["guide_id"] == guide_id
    assert body[0]["url"] == url


def test_observable_excludes_non_allowlisted_domain(client):
    url = "https://crm.acme.ru/deals/1"
    # project allowlist does NOT include the url's host
    org_id, _gid, h = _guide_with_url(client, ["other.acme.ru"], url)
    resp = client.get(f"/orgs/{org_id}/steps/observable", params={"url": url}, headers=h)
    assert resp.status_code == 200
    assert resp.json() == []


def test_observable_excludes_other_org(client):
    url = "https://crm.acme.ru/deals/1"
    _org_a, _gid, _ha = _guide_with_url(client, ["crm.acme.ru"], url)
    b = client.post(
        "/auth/signup", json={"email": "b@x.ru", "password": "pw", "org_name": "OrgB"}
    ).json()
    hb = {"Authorization": f"Bearer {b['access_token']}"}
    org_b = b["org_id"]
    resp = client.get(f"/orgs/{org_b}/steps/observable", params={"url": url}, headers=hb)
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_observable_steps.py -v`
Expected: FAIL with 404 (route not registered).

- [ ] **Step 4: Add the endpoint — modify `backend/app/routers/guides.py`**

Extend the imports at the top of the file:

```python
from urllib.parse import urlparse

from app.models import Guide, GuideVersion, Membership, Project, Step
from app.schemas.guide import (
    GuideCreate,
    GuideDetail,
    GuideSummary,
    NewVersionRequest,
    ObservableStep,
    StepInput,
    StepOut,
    VersionSummary,
)
```

> Keep the existing imports; add `Project` to the models import and `urlparse` + `ObservableStep` as shown. `Membership`/`GuideVersion` are already imported.

Append the endpoint:

```python
@router.get("/steps/observable", response_model=list[ObservableStep])
def list_observable_steps(
    org_id: str,
    url: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[ObservableStep]:
    host = urlparse(url).hostname
    if not host:
        return []
    rows = db.execute(
        select(Step, Guide)
        .join(Guide, Guide.current_version_id == Step.version_id)
        .where(Guide.org_id == org_id, Step.url == url)
    ).all()
    out: list[ObservableStep] = []
    for step, guide in rows:
        project = db.get(Project, guide.project_id)
        if project is not None and host in (project.allowlist_domains or []):
            out.append(
                ObservableStep(
                    step_id=step.id,
                    guide_id=guide.id,
                    url=step.url,
                    fingerprint=step.fingerprint,
                )
            )
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_observable_steps.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/schemas/guide.py app/routers/guides.py tests/test_observable_steps.py
git commit -m "feat(drift): add observable-steps lookup gated by project allowlist"
```

---

## Self-Review

**1. Spec coverage (design §5 loop A foundation + §5.3 privacy):**
- "Расширение знает, какие URL/экраны относятся к существующим гайдам" → `Step.url` (Task 1) + the observable lookup (Task 3) give the agent exactly that. ✅
- Fingerprint carries the URL for the agent's fresh comparison → generation stores `url` in the fingerprint (Task 2). ✅
- §5.3 "drift-агент работает только на доменах, явно добавленных в проект (allowlist)" → enforced **server-side** in the observable endpoint (host must be in the project's `allowlist_domains`) (Task 3). ✅
- Only current-version steps are observable → the `Guide.current_version_id == Step.version_id` join (Task 3). ✅
- The agent then re-captures and calls the existing `POST /drift/observe` (Plan 5) — no change needed here.
- The extension passive agent itself (re-capture loop, calling these endpoints) → **deferred separate plan**, stated. No gap against this plan's backend-foundation goal.

**2. Placeholder scan:** No TBD/empty steps; every code step is complete; the migration is hand-authored with a concrete revision/down_revision; tests assert real behavior (round-trip, allowlist inclusion/exclusion, org isolation). ✅

**3. Type consistency:** `Step.url` (Task 1 model) ↔ `StepInput.url`/`StepOut.url` (Task 1 schemas) ↔ `_create_version`/`build_guide_detail` (Task 1) ↔ `RawStep.url` + generate mapping (Task 2) ↔ `ObservableStep`/lookup (Task 3) all use the same `url: str | None`. The migration `down_revision="7c39f94cfd69"` matches the existing initial-schema head. `Project.allowlist_domains` is the Plan 1 field (`list`), used with `in`. Reused names (`_create_version`, `build_guide_detail`, `get_membership`, `Step`/`Guide`/`Project`) are exact. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-drift-loop-a-backend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
