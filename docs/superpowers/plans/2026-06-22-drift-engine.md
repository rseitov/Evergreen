# Drift Engine (Anti-Staleness) Implementation Plan (Plan 5 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend drift engine — score a fresh fingerprint against a step's stored one, raise a DriftEvent when it has drifted (auto-drafting a replacement when it's clearly stale), let users flag a step that's gone, and make "accept" apply the draft as a new guide version.

**Architecture:** A pure scoring module (`app/drift/scoring.py`) computes a weighted delta between two fingerprints and classifies it against the design's thresholds. A new `POST /drift/observe` endpoint scores a re-observed step and, above threshold, creates a DriftEvent — calling the existing Plan 2 `AIClient` to draft a replacement step when the drift is severe. `POST /drift/flag` is the consumer "this is gone" path (loop C). "Accept" is upgraded to apply a draft as a new immutable version via Plan 1's `_create_version`. Everything is unit/endpoint-tested with the AI client faked — no real model calls in CI.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, the existing `anthropic`-backed `AIClient` (Plan 2), pytest + Starlette TestClient, uv.

## Global Constraints

- Python 3.12; uv (`uv run pytest` from `backend/`).
- This plan is **backend only** — it extends `backend/`. Client wiring (the extension's passive drift agent for loop A, and a web "этого больше нет" button) is **explicitly deferred to a follow-up**; the engine exposes `/drift/observe` and `/drift/flag` for them to call. Active synthetic monitoring (design approach B) is out of scope.
- Drift loops implemented: **A (passive)** via `/drift/observe`, **C (consumer flag)** via `/drift/flag` — per design §5.
- A fingerprint is the dict shape produced by Plan 2: `{"dom_anchor": {"role","text","selector"} | null, "semantics": str, "screenshot_url": str | null}`. Drift is scored from the `dom_anchor` delta only (text-only v1 — no screenshot diffing, consistent with Plans 2–4).
- **Scoring weights and thresholds are starting values, calibrated later** (design §5.1): anchor field weights role=0.3, text=0.4, selector=0.3; thresholds `< 0.2` → none, `0.2–0.5` → soft flag, `> 0.5` → stale.
- Observation is matched to a step by **`step_id` supplied by the caller** — the backend does not do URL→step matching (that lives in the deferred client agent).
- Multi-tenant isolation: the observed/flagged step must belong to the path `org_id` (reuse the join check); cross-org → 404. SQLAlchemy 2.0 `select()`. IDs/timestamps via existing helpers.
- Reuse, don't reimplement: `app.routers.drift._step_in_org_or_404`/`_get_event_or_404`/`_to_out`, `app.routers.guides._create_version`, `app.schemas.guide.StepInput`, `app.ai.client.{AIClient, get_ai_client}`, `app.ai.errors.AIGenerationError`.
- AI access stays behind `AIClient`; the new `redraft_step` method is added to the protocol and faked in tests. No real Claude call in the automated suite.

---

## File Structure

```
backend/
  app/
    drift/
      __init__.py            # NEW empty package marker
      scoring.py             # NEW score_drift(stored, fresh) -> float; classify(score) -> str
    ai/
      schemas.py             # MODIFY: add RedraftedStep
      prompts.py             # MODIFY: add REDRAFT_SYSTEM_PROMPT_V1 + build_redraft_prompt
      client.py              # MODIFY: AIClient.redraft_step + AnthropicAIClient.redraft_step
    schemas/
      drift.py               # MODIFY: add ObserveRequest, ObserveResult, FlagRequest
    routers/
      drift.py               # MODIFY: add /observe and /flag; upgrade /accept to apply drafts
  tests/
    support/
      fake_ai.py             # MODIFY: FakeAIClient gains redraft_step
    test_drift_scoring.py    # NEW
    test_ai_redraft.py       # NEW
    test_drift_observe.py    # NEW
    test_drift_flag.py       # NEW
    test_drift_accept_apply.py  # NEW
```

---

### Task 1: Drift scoring

**Files:**
- Create: `backend/app/drift/__init__.py` (empty)
- Create: `backend/app/drift/scoring.py`
- Create: `backend/tests/test_drift_scoring.py`

**Interfaces:**
- Consumes: nothing (pure functions, stdlib only).
- Produces:
  - `score_drift(stored: dict | None, fresh: dict | None) -> float` — compares the two fingerprints' `dom_anchor` sub-dicts. Both `dom_anchor` None → `0.0`. Exactly one `dom_anchor` present → `1.0`. Otherwise sum the weights of the anchor fields that differ (`role`=0.3, `text`=0.4, `selector`=0.3), clamped to `[0.0, 1.0]`.
  - `classify(score: float) -> str` — `"none"` if `< 0.2`, `"soft"` if `<= 0.5`, else `"stale"`.

- [ ] **Step 1: Write the failing test — `backend/tests/test_drift_scoring.py`**

```python
import pytest

from app.drift.scoring import classify, score_drift


def fp(role=None, text=None, selector=None, anchor=True):
    anchor_val = {"role": role, "text": text, "selector": selector} if anchor else None
    return {"dom_anchor": anchor_val, "semantics": "s", "screenshot_url": None}


def test_identical_anchors_score_zero():
    a = fp(role="button", text="Сохранить", selector="#save")
    assert score_drift(a, a) == 0.0


def test_text_change_only():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="button", text="Готово", selector="#save")
    assert score_drift(stored, fresh) == pytest.approx(0.4)


def test_role_and_selector_change():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="link", text="Сохранить", selector="#save2")
    assert score_drift(stored, fresh) == pytest.approx(0.6)


def test_all_fields_change():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="link", text="Готово", selector="#save2")
    assert score_drift(stored, fresh) == pytest.approx(1.0)


def test_anchor_appeared_or_disappeared_is_max():
    present = fp(role="button", text="Сохранить", selector="#save")
    absent = fp(anchor=False)
    assert score_drift(present, absent) == 1.0
    assert score_drift(absent, present) == 1.0


def test_both_anchors_absent_is_zero():
    assert score_drift(fp(anchor=False), fp(anchor=False)) == 0.0


def test_classify_thresholds():
    assert classify(0.19) == "none"
    assert classify(0.2) == "soft"
    assert classify(0.5) == "soft"
    assert classify(0.51) == "stale"
    assert classify(1.0) == "stale"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_drift_scoring.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.drift.scoring'`.

- [ ] **Step 3: Create `backend/app/drift/__init__.py` (empty) and `backend/app/drift/scoring.py`**

`backend/app/drift/__init__.py`: empty file.

`backend/app/drift/scoring.py`:

```python
# Starting weights/thresholds per design §5.1 — calibrated on real data later.
_FIELD_WEIGHTS = {"role": 0.3, "text": 0.4, "selector": 0.3}


def score_drift(stored: dict | None, fresh: dict | None) -> float:
    """Weighted delta between two step fingerprints' dom_anchor sub-dicts, in [0,1]."""
    stored_anchor = (stored or {}).get("dom_anchor")
    fresh_anchor = (fresh or {}).get("dom_anchor")

    if stored_anchor is None and fresh_anchor is None:
        return 0.0
    if stored_anchor is None or fresh_anchor is None:
        return 1.0

    score = 0.0
    for field, weight in _FIELD_WEIGHTS.items():
        if stored_anchor.get(field) != fresh_anchor.get(field):
            score += weight
    return min(score, 1.0)


def classify(score: float) -> str:
    if score < 0.2:
        return "none"
    if score <= 0.5:
        return "soft"
    return "stale"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_drift_scoring.py -v`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/drift/ tests/test_drift_scoring.py
git commit -m "feat(drift): add fingerprint drift scoring and classification"
```

---

### Task 2: AI redraft of a stale step

**Files:**
- Modify: `backend/app/ai/schemas.py`
- Modify: `backend/app/ai/prompts.py`
- Modify: `backend/app/ai/client.py`
- Create: `backend/tests/test_ai_redraft.py`

**Interfaces:**
- Consumes: `anthropic` SDK, `app.config.settings`, `app.ai.errors.AIGenerationError`.
- Produces:
  - `app.ai.schemas.RedraftedStep(text: str)`.
  - `app.ai.prompts.REDRAFT_SYSTEM_PROMPT_V1: str` and `build_redraft_prompt(old_text: str, fresh_anchor: dict | None) -> str`.
  - `AIClient.redraft_step(self, old_text: str, fresh_anchor: dict | None) -> str` added to the Protocol.
  - `AnthropicAIClient.redraft_step(...)` — structured-output call returning the new step text; raises `AIGenerationError` on refusal / missing text / malformed output (same guards as `generate_guide`).

- [ ] **Step 1: Add the schema — append to `backend/app/ai/schemas.py`**

```python
class RedraftedStep(BaseModel):
    text: str
```

- [ ] **Step 2: Add prompts — append to `backend/app/ai/prompts.py`**

```python
REDRAFT_SYSTEM_PROMPT_V1 = (
    "Шаг инструкции устарел: элемент интерфейса изменился. "
    "Перепиши один шаг на русском, в повелительном наклонении, кратко, "
    "опираясь на новый элемент. Верни только обновлённый текст шага."
)


def build_redraft_prompt(old_text: str, fresh_anchor: dict | None) -> str:
    lines = [f"Старый шаг: {old_text}"]
    if fresh_anchor:
        lines.append(f"Новый элемент: {fresh_anchor}")
    return "\n".join(lines)
```

- [ ] **Step 3: Write the failing test — `backend/tests/test_ai_redraft.py`**

```python
import json
from types import SimpleNamespace

import pytest

from app.ai.client import AnthropicAIClient
from app.ai.errors import AIGenerationError
from app.ai.prompts import build_redraft_prompt


def test_build_redraft_prompt_includes_old_and_new():
    prompt = build_redraft_prompt("нажать «Сохранить»", {"role": "link", "text": "Готово"})
    assert "нажать «Сохранить»" in prompt
    assert "Готово" in prompt


def _response(*, content, stop_reason="end_turn"):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


class _FakeMessages:
    def __init__(self, response):
        self._response = response

    def create(self, **kwargs):
        return self._response


class _FakeAnthropic:
    def __init__(self, response):
        self.messages = _FakeMessages(response)


def _client(response):
    return AnthropicAIClient(_FakeAnthropic(response), model="claude-opus-4-8", max_tokens=4096)


def test_redraft_returns_text():
    payload = json.dumps({"text": "нажать «Готово»"})
    client = _client(_response(content=[SimpleNamespace(type="text", text=payload)]))
    assert client.redraft_step("нажать «Сохранить»", {"role": "link", "text": "Готово"}) == "нажать «Готово»"


def test_redraft_refusal_raises():
    client = _client(_response(content=[], stop_reason="refusal"))
    with pytest.raises(AIGenerationError):
        client.redraft_step("x", None)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ai_redraft.py -v`
Expected: FAIL with `ImportError`/`AttributeError` (no `redraft_step`).

- [ ] **Step 5: Modify `backend/app/ai/client.py`**

Update the imports at the top to also bring in the new prompt/schema names:

```python
from app.ai.prompts import (
    GUIDE_SYSTEM_PROMPT_V1,
    REDRAFT_SYSTEM_PROMPT_V1,
    build_redraft_prompt,
    build_user_prompt,
)
from app.ai.schemas import GeneratedGuide, RawStep, RedraftedStep
```

Add the method to the `AIClient` Protocol (alongside `generate_guide`):

```python
    def redraft_step(self, old_text: str, fresh_anchor: dict | None) -> str: ...
```

Add the implementation to `AnthropicAIClient` (after `generate_guide`):

```python
    def redraft_step(self, old_text: str, fresh_anchor: dict | None) -> str:
        user_prompt = build_redraft_prompt(old_text, fresh_anchor)
        response = self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=REDRAFT_SYSTEM_PROMPT_V1,
            messages=[{"role": "user", "content": user_prompt}],
            output_config={
                "format": {"type": "json_schema", "schema": RedraftedStep.model_json_schema()}
            },
        )
        stop_reason = getattr(response, "stop_reason", None)
        if stop_reason == "refusal":
            raise AIGenerationError("model refused the request")
        if stop_reason == "max_tokens":
            raise AIGenerationError("model response was truncated (max_tokens)")
        text = next((block.text for block in response.content if block.type == "text"), None)
        if text is None:
            raise AIGenerationError("model returned no text block")
        try:
            return RedraftedStep.model_validate_json(text).text
        except ValidationError as exc:
            raise AIGenerationError("model returned malformed output") from exc
```

(`ValidationError` is already imported in `client.py` from Plan 2's reliability work.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai_redraft.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/ai/schemas.py app/ai/prompts.py app/ai/client.py tests/test_ai_redraft.py
git commit -m "feat(ai): add redraft_step for regenerating a stale step"
```

---

### Task 3: Observe endpoint (passive drift ingestion, loop A)

**Files:**
- Modify: `backend/app/schemas/drift.py`
- Modify: `backend/app/routers/drift.py`
- Modify: `backend/tests/support/fake_ai.py`
- Create: `backend/tests/test_drift_observe.py`

**Interfaces:**
- Consumes: `app.drift.scoring.{score_drift, classify}`, `app.ai.client.{AIClient, get_ai_client}`, `app.ai.errors.AIGenerationError`, existing `_step_in_org_or_404`/`_to_out` and the `DriftEvent`/`Step` models, `app.deps.require_role`.
- Produces:
  - Schemas `ObserveRequest(step_id: str, fresh_fingerprint: dict, source: Literal["passive","flag"] = "passive")` and `ObserveResult(drift: bool, score: float, classification: str, event_id: str | None)`.
  - `POST /orgs/{org_id}/drift/observe` (editor+) — validates the step is in the org; scores `fresh_fingerprint` against `step.fingerprint`; if classification is `"none"` (or the step has no stored fingerprint) returns `{drift: false, ...}` and creates nothing; otherwise creates a `DriftEvent` (status `"open"`), and when `"stale"` also fills `draft_text` via `ai.redraft_step`. Returns `ObserveResult`.
  - `FakeAIClient.redraft_step` returning a preset string (test double).

- [ ] **Step 1: Add schemas — append to `backend/app/schemas/drift.py`**

```python
class ObserveRequest(BaseModel):
    step_id: str
    fresh_fingerprint: dict
    source: Literal["passive", "flag"] = "passive"


class ObserveResult(BaseModel):
    drift: bool
    score: float
    classification: str
    event_id: str | None
```

(`Literal` and `BaseModel` are already imported in `drift.py` schemas from Plan 1.)

- [ ] **Step 2: Extend the test double — modify `backend/tests/support/fake_ai.py`**

Add a `redraft_step` method and a preset to `FakeAIClient` (keep the existing `generate_guide`):

```python
class FakeAIClient:
    """Test double for AIClient. Records received steps; returns a preset guide."""

    def __init__(self, result: GeneratedGuide | None = None, redraft_result: str = "обновлённый шаг"):
        self._result = result
        self._redraft_result = redraft_result
        self.received_steps: list[RawStep] | None = None
        self.received_title_hint: str | None = None
        self.received_guide_type: str | None = None
        self.redraft_calls: list[tuple[str, dict | None]] = []

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        self.received_steps = steps
        self.received_title_hint = title_hint
        self.received_guide_type = guide_type
        assert self._result is not None
        return self._result

    def redraft_step(self, old_text: str, fresh_anchor: dict | None) -> str:
        self.redraft_calls.append((old_text, fresh_anchor))
        return self._redraft_result
```

- [ ] **Step 3: Write the failing test — `backend/tests/test_drift_observe.py`**

```python
from app.ai.client import get_ai_client
from app.main import app
from tests.support.fake_ai import FakeAIClient


def _guide_with_step(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "G",
            "type": "digital",
            "steps": [
                {
                    "text": "нажать «Сохранить»",
                    "fingerprint": {
                        "dom_anchor": {"role": "button", "text": "Сохранить", "selector": "#save"},
                        "semantics": "нажать «Сохранить»",
                        "screenshot_url": None,
                    },
                }
            ],
        },
        headers=h,
    ).json()
    return org_id, g["steps"][0]["id"], h


def _use_fake(redraft="нажать «Готово»") -> FakeAIClient:
    fake = FakeAIClient(redraft_result=redraft)
    app.dependency_overrides[get_ai_client] = lambda: fake
    return fake


def _clear():
    app.dependency_overrides.pop(get_ai_client, None)


def test_no_drift_when_fingerprint_matches(client):
    org_id, step_id, h = _guide_with_step(client)
    _use_fake()
    try:
        resp = client.post(
            f"/orgs/{org_id}/drift/observe",
            json={
                "step_id": step_id,
                "fresh_fingerprint": {
                    "dom_anchor": {"role": "button", "text": "Сохранить", "selector": "#save"},
                    "semantics": "x",
                    "screenshot_url": None,
                },
            },
            headers=h,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["drift"] is False
        assert body["event_id"] is None
        assert len(client.get(f"/orgs/{org_id}/drift", headers=h).json()) == 0
    finally:
        _clear()


def test_stale_drift_creates_event_with_ai_draft(client):
    org_id, step_id, h = _guide_with_step(client)
    fake = _use_fake(redraft="нажать «Готово»")
    try:
        resp = client.post(
            f"/orgs/{org_id}/drift/observe",
            json={
                "step_id": step_id,
                "fresh_fingerprint": {
                    "dom_anchor": {"role": "link", "text": "Готово", "selector": "#done"},
                    "semantics": "x",
                    "screenshot_url": None,
                },
            },
            headers=h,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["drift"] is True
        assert body["classification"] == "stale"
        assert body["event_id"]
        assert len(fake.redraft_calls) == 1

        events = client.get(f"/orgs/{org_id}/drift?status=open", headers=h).json()
        assert len(events) == 1
        assert events[0]["draft_text"] == "нажать «Готово»"
        assert events[0]["source"] == "passive"
    finally:
        _clear()


def test_soft_drift_creates_event_without_draft(client):
    org_id, step_id, h = _guide_with_step(client)
    fake = _use_fake()
    try:
        resp = client.post(
            f"/orgs/{org_id}/drift/observe",
            json={
                "step_id": step_id,
                "fresh_fingerprint": {
                    "dom_anchor": {"role": "button", "text": "Готово", "selector": "#save"},
                    "semantics": "x",
                    "screenshot_url": None,
                },
            },
            headers=h,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["classification"] == "soft"
        assert len(fake.redraft_calls) == 0
        events = client.get(f"/orgs/{org_id}/drift", headers=h).json()
        assert events[0]["draft_text"] is None
    finally:
        _clear()


def test_observe_unknown_step_404(client):
    org_id, _step_id, h = _guide_with_step(client)
    _use_fake()
    try:
        resp = client.post(
            f"/orgs/{org_id}/drift/observe",
            json={"step_id": "nope", "fresh_fingerprint": {"dom_anchor": None}},
            headers=h,
        )
        assert resp.status_code == 404
    finally:
        _clear()
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_drift_observe.py -v`
Expected: FAIL (route not registered → 404/422 mismatches).

- [ ] **Step 5: Add the endpoint — modify `backend/app/routers/drift.py`**

Extend the imports at the top of the file:

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import AIClient, get_ai_client
from app.ai.errors import AIGenerationError
from app.db import get_db
from app.deps import get_membership, require_role
from app.drift.scoring import classify, score_drift
from app.models import DriftEvent, Guide, GuideVersion, Membership, Step
from app.schemas.drift import DriftCreate, DriftEventOut, FlagRequest, ObserveRequest, ObserveResult
```

> Keep the existing imports that were already present; the lines above are the full set this router needs after Tasks 3–5. `Response` is needed in case of 204s elsewhere; `FlagRequest` is added in Task 4 — if implementing strictly task-by-task, add `FlagRequest` to this import line in Task 4.

Append the observe endpoint (after the existing `dismiss_drift`):

```python
@router.post("/observe", response_model=ObserveResult)
def observe_drift(
    org_id: str,
    payload: ObserveRequest,
    response: Response,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
    ai: AIClient = Depends(get_ai_client),
) -> ObserveResult:
    step = _step_in_org_or_404(db, org_id, payload.step_id)

    score = score_drift(step.fingerprint, payload.fresh_fingerprint)
    cls = classify(score)
    if cls == "none":
        return ObserveResult(drift=False, score=score, classification=cls, event_id=None)

    draft_text: str | None = None
    if cls == "stale":
        try:
            draft_text = ai.redraft_step(step.text, payload.fresh_fingerprint.get("dom_anchor"))
        except AIGenerationError:
            draft_text = None

    event = DriftEvent(
        org_id=org_id,
        step_id=payload.step_id,
        score=score,
        source=payload.source,
        fresh_fingerprint=payload.fresh_fingerprint,
        draft_text=draft_text,
        status="open",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    response.status_code = 201
    return ObserveResult(drift=True, score=score, classification=cls, event_id=event.id)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_drift_observe.py -v`
Expected: PASS (4 passed).

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/schemas/drift.py app/routers/drift.py tests/support/fake_ai.py tests/test_drift_observe.py
git commit -m "feat(drift): add observe endpoint scoring drift and auto-drafting stale steps"
```

---

### Task 4: Consumer-flag endpoint (loop C)

**Files:**
- Modify: `backend/app/schemas/drift.py`
- Modify: `backend/app/routers/drift.py`
- Create: `backend/tests/test_drift_flag.py`

**Interfaces:**
- Consumes: `_step_in_org_or_404`/`_to_out`, `DriftEvent`, `require_role`.
- Produces:
  - Schema `FlagRequest(step_id: str)`.
  - `POST /orgs/{org_id}/drift/flag` (editor+) — validates the step is in the org, creates a `DriftEvent(source="flag", score=1.0, status="open", fresh_fingerprint=None, draft_text=None)` for the step, returns `DriftEventOut`.

- [ ] **Step 1: Add the schema — append to `backend/app/schemas/drift.py`**

```python
class FlagRequest(BaseModel):
    step_id: str
```

- [ ] **Step 2: Write the failing test — `backend/tests/test_drift_flag.py`**

```python
def _guide_with_step(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "нажать «Сохранить»"}]},
        headers=h,
    ).json()
    return org_id, g["steps"][0]["id"], h


def test_flag_creates_open_event(client):
    org_id, step_id, h = _guide_with_step(client)
    resp = client.post(f"/orgs/{org_id}/drift/flag", json={"step_id": step_id}, headers=h)
    assert resp.status_code == 201
    body = resp.json()
    assert body["source"] == "flag"
    assert body["status"] == "open"
    assert body["step_id"] == step_id

    events = client.get(f"/orgs/{org_id}/drift?status=open", headers=h).json()
    assert len(events) == 1


def test_flag_unknown_step_404(client):
    org_id, _step_id, h = _guide_with_step(client)
    resp = client.post(f"/orgs/{org_id}/drift/flag", json={"step_id": "nope"}, headers=h)
    assert resp.status_code == 404
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_drift_flag.py -v`
Expected: FAIL (route not registered).

- [ ] **Step 4: Add the endpoint — modify `backend/app/routers/drift.py`**

Ensure `FlagRequest` is in the `app.schemas.drift` import line (see Task 3's import block), then append:

```python
@router.post("/flag", response_model=DriftEventOut, status_code=201)
def flag_drift(
    org_id: str,
    payload: FlagRequest,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    _step_in_org_or_404(db, org_id, payload.step_id)
    event = DriftEvent(
        org_id=org_id,
        step_id=payload.step_id,
        score=1.0,
        source="flag",
        fresh_fingerprint=None,
        draft_text=None,
        status="open",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_out(event)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_drift_flag.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/schemas/drift.py app/routers/drift.py tests/test_drift_flag.py
git commit -m "feat(drift): add consumer flag endpoint (this step is gone)"
```

---

### Task 5: Accept applies the draft as a new version

**Files:**
- Modify: `backend/app/routers/drift.py`
- Create: `backend/tests/test_drift_accept_apply.py`

**Interfaces:**
- Consumes: `_get_event_or_404`/`_to_out`, `DriftEvent`/`Step`/`GuideVersion`/`Guide` models, `app.routers.guides._create_version`, `app.schemas.guide.StepInput`.
- Produces: an upgraded `accept_drift` — when the event has a `draft_text`, it creates a new immutable guide version with the drifted step's text replaced by the draft (matched by `order_index` within the guide's current version), then marks the event `"accepted"`. When there is no draft, it only transitions the status (unchanged behavior).

- [ ] **Step 1: Write the failing test — `backend/tests/test_drift_accept_apply.py`**

```python
def _guide_with_two_steps(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "G",
            "type": "digital",
            "steps": [{"text": "Открыть карточку"}, {"text": "нажать «Сохранить»"}],
        },
        headers=h,
    ).json()
    return org_id, g["id"], g["steps"], h


def test_accept_with_draft_creates_new_version_replacing_the_step(client):
    org_id, guide_id, steps, h = _guide_with_two_steps(client)
    second_step_id = steps[1]["id"]
    # create a drift event carrying a draft for the second step
    event = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": second_step_id, "score": 0.7, "source": "passive", "draft_text": "нажать «Готово»"},
        headers=h,
    ).json()

    accept = client.post(f"/orgs/{org_id}/drift/{event['id']}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    guide = client.get(f"/orgs/{org_id}/guides/{guide_id}", headers=h).json()
    assert guide["version_number"] == 2
    assert [s["text"] for s in guide["steps"]] == ["Открыть карточку", "нажать «Готово»"]


def test_accept_without_draft_only_transitions_status(client):
    org_id, guide_id, steps, h = _guide_with_two_steps(client)
    event = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": steps[0]["id"], "score": 0.3, "source": "passive"},
        headers=h,
    ).json()

    accept = client.post(f"/orgs/{org_id}/drift/{event['id']}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    guide = client.get(f"/orgs/{org_id}/guides/{guide_id}", headers=h).json()
    assert guide["version_number"] == 1  # unchanged
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_drift_accept_apply.py -v`
Expected: FAIL — the first test fails (current accept doesn't create a new version, so `version_number` stays 1).

- [ ] **Step 3: Upgrade `accept_drift` — modify `backend/app/routers/drift.py`**

Add imports for the reused helpers near the top (with the other imports):

```python
from app.routers.guides import _create_version
from app.schemas.guide import StepInput
```

Add a private helper and replace the body of `accept_drift`:

```python
def _apply_draft_as_new_version(db: Session, event: DriftEvent, user_id: str) -> None:
    drifted = db.get(Step, event.step_id)
    if drifted is None:
        return
    version = db.get(GuideVersion, drifted.version_id)
    guide = db.get(Guide, version.guide_id)
    current_steps = db.execute(
        select(Step)
        .where(Step.version_id == guide.current_version_id)
        .order_by(Step.order_index)
    ).scalars().all()

    new_steps = [
        StepInput(
            text=event.draft_text if s.order_index == drifted.order_index else s.text,
            media_url=s.media_url,
            fingerprint=s.fingerprint,
        )
        for s in current_steps
    ]
    last = db.execute(
        select(GuideVersion)
        .where(GuideVersion.guide_id == guide.id)
        .order_by(GuideVersion.version_number.desc())
    ).scalars().first()
    next_number = (last.version_number + 1) if last else 1
    _create_version(db, guide, new_steps, user_id, version_number=next_number)


@router.post("/{event_id}/accept", response_model=DriftEventOut)
def accept_drift(
    org_id: str,
    event_id: str,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    event = _get_event_or_404(db, org_id, event_id)
    if event.draft_text:
        _apply_draft_as_new_version(db, event, membership.user_id)
    event.status = "accepted"
    db.commit()
    db.refresh(event)
    return _to_out(event)
```

> This replaces the previous `accept_drift` (which only set status). The `dismiss_drift` endpoint is unchanged. `membership` is now bound (was `_m`) so its `user_id` can author the new version.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_drift_accept_apply.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: ALL pass (the prior drift tests still pass — `accept` without a draft is unchanged).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/routers/drift.py tests/test_drift_accept_apply.py
git commit -m "feat(drift): apply accepted draft as a new guide version"
```

---

## Self-Review

**1. Spec coverage (design §5 — the anti-staleness engine, loops A + C):**
- Step fingerprint triplet → already stored (Plan 2); scored here. ✅
- Loop A passive drift: re-observe → drift-score → thresholds → flag/stale + auto-draft → `POST /drift/observe` (Task 3) using `score_drift`/`classify` (Task 1) and `redraft_step` (Task 2). ✅
- Thresholds `<0.2 / 0.2–0.5 / >0.5` → `classify` (Task 1), wired in observe. ✅
- Auto-draft of the new step for stale → `redraft_step` + observe (Tasks 2–3). ✅
- Owner reviews in "что устарело" → existing web dashboard (Plan 4) lists these events; **accept now applies the draft as a new version** (Task 5). ✅
- Loop C consumer flag ("этого больше нет") → `POST /drift/flag` (Task 4). ✅
- Approach B (active synthetic monitoring) → **out of scope** (design defers it; stated). No gap.
- Privacy/allowlist (§5.3): the drift-agent runs only on allowlisted domains — that gating lives in the **deferred client agent**, not the backend engine; the backend simply scores what it's given for steps in the caller's org. Stated in Global Constraints as deferred. No gap against the engine's responsibility.
- Client wiring (extension passive agent, web flag button) → **explicitly deferred follow-up**; the engine endpoints exist for them.

**2. Placeholder scan:** No TBD/"handle errors"/empty steps; every code step is complete, every test asserts real behavior (scores, classifications, event creation, version application). The AI redraft failure path degrades to `draft_text=None` rather than failing the observation. ✅

**3. Type consistency:** `score_drift(stored, fresh) -> float` / `classify(score) -> str` (Task 1) consumed by observe (Task 3). `redraft_step(old_text, fresh_anchor) -> str` defined on the protocol + `AnthropicAIClient` (Task 2), implemented on `FakeAIClient` (Task 3), called in observe (Task 3). `ObserveRequest`/`ObserveResult`/`FlagRequest` (Tasks 3–4) match their endpoint usage. Reused Plan 1/2 names are exact: `_step_in_org_or_404`, `_get_event_or_404`, `_to_out`, `DriftEvent`, `Step`, `GuideVersion`, `Guide`, `_create_version(db, guide, steps, user_id, version_number)`, `StepInput`, `get_ai_client`, `AIGenerationError`. The `accept_drift` upgrade keeps its route/response_model and only changes the body. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-22-drift-engine.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
