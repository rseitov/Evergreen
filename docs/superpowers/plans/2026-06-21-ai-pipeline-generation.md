# AI Pipeline — Generation Service Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI generation service that turns raw captured steps into a clean Russian guide via Claude — redacting PII before the model ever sees it — and exposes it as a `POST .../guides/generate` endpoint that creates the guide using Plan 1's versioning.

**Architecture:** A small, isolated `app/ai/` package sits behind an `AIClient` Protocol (Clean Architecture — the router depends on the abstraction, not the Anthropic SDK). The router redacts PII from raw step text, hands the redacted steps to the injected `AIClient`, receives a validated `GeneratedGuide` (structured output), maps it to Plan 1's `StepInput`s (clean text + the original screenshot URL + a drift fingerprint), and creates the guide through the existing `_create_version` path. Tests inject a fake `AIClient`; the real Anthropic client is exercised only by a manual eval harness, never in CI.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, the official `anthropic` SDK (Claude `claude-opus-4-8`, structured outputs), pytest + Starlette TestClient, uv.

## Global Constraints

- Python 3.12 floor; dependency manager **uv** (`uv run ...`, `uv sync`).
- AI access goes through the **official `anthropic` SDK only** — never raw HTTP, never another provider.
- Default model is **`claude-opus-4-8`** (configurable via `settings.ai_model`). Use this exact id string; do not append date suffixes.
- **PII is redacted from step text BEFORE it is sent to the model** (152-ФЗ). The `AIClient` only ever receives already-redacted text.
- **v1 is text-only:** screenshots are stored (`media_url`) but never sent to the model. No vision calls in this plan.
- The `AIClient` is consumed via the `get_ai_client` FastAPI dependency and is overridden with a fake in every test — **no test calls the real Claude API**.
- Structured output: request a JSON-schema-constrained response and validate it with Pydantic (`GeneratedGuide.model_validate_json`). Validate the model's output at the boundary; a malformed or mismatched response is a `502`, never a crash.
- Reuse Plan 1's seams verbatim — `app.routers.guides._create_version`, `build_guide_detail`, `app.routers.projects.get_project_or_404`, `app.schemas.guide.StepInput`, `app.models.Guide`. Do NOT reimplement guide/version/step creation.
- Multi-tenant isolation: `org_id`/`project_id` from the PATH; create gated `require_role("editor")`. SQLAlchemy 2.0 `select()`. IDs/timestamps via existing `new_id`/`utcnow`.
- Prompts are versioned constants in `app/ai/prompts.py` (e.g. `GUIDE_SYSTEM_PROMPT_V1`), not inline strings in business logic.

---

## File Structure

```
backend/
  app/
    config.py                  # MODIFY: add anthropic_api_key, ai_model, ai_max_tokens, ai_timeout_seconds
    ai/
      __init__.py              # NEW empty package marker
      schemas.py               # NEW RawStep, GeneratedStep, GeneratedGuide (Pydantic)
      redaction.py             # NEW redact_pii(text) -> str
      prompts.py               # NEW GUIDE_SYSTEM_PROMPT_V1, build_user_prompt(...)
      client.py                # NEW AIClient Protocol, AnthropicAIClient, get_ai_client dependency
    schemas/
      generate.py              # NEW GenerateGuideRequest (reuses RawStep)
    routers/
      generate.py              # NEW POST /orgs/{org_id}/projects/{project_id}/guides/generate
    main.py                    # MODIFY: register generate router
  scripts/
    ai_eval.py                 # NEW manual eval harness (not run in CI)
  tests/
    support/
      __init__.py              # NEW
      fake_ai.py               # NEW FakeAIClient (records inputs, returns canned output)
    test_ai_redaction.py       # NEW
    test_ai_client.py          # NEW (mocks the anthropic SDK client; no network)
    test_generate.py           # NEW (endpoint flow with FakeAIClient override)
```

Each `app/ai/*` file has one responsibility: `schemas` = data shapes, `redaction` = the PII pre-filter, `prompts` = versioned prompt text, `client` = the model boundary. The router orchestrates; it owns no model details.

---

### Task 1: AI package scaffolding — dependency, config, schemas

**Files:**
- Modify: `backend/pyproject.toml` (add `anthropic` dependency)
- Modify: `backend/app/config.py`
- Create: `backend/app/ai/__init__.py` (empty)
- Create: `backend/app/ai/schemas.py`
- Create: `backend/tests/test_ai_schemas.py`

**Interfaces:**
- Consumes: `pydantic.BaseModel`.
- Produces:
  - `app.config.settings` gains `anthropic_api_key: str = ""`, `ai_model: str = "claude-opus-4-8"`, `ai_max_tokens: int = 4096`, `ai_timeout_seconds: float = 60.0`.
  - `app.ai.schemas.RawStep(action_text: str, dom_anchor: dict | None = None, screenshot_url: str | None = None)`.
  - `app.ai.schemas.GeneratedStep(text: str)`.
  - `app.ai.schemas.GeneratedGuide(title: str, steps: list[GeneratedStep])`.

- [ ] **Step 1: Add the `anthropic` dependency**

In `backend/pyproject.toml`, add `"anthropic>=0.40"` to the `dependencies` array (alongside `fastapi`, etc.). Then run `cd backend && uv sync` to install it and update the lockfile.

- [ ] **Step 2: Add AI config fields — modify `backend/app/config.py`**

Add the four fields to the `Settings` class (keep existing fields unchanged):

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 1440
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-4-8"
    ai_max_tokens: int = 4096
    ai_timeout_seconds: float = 60.0
```

- [ ] **Step 3: Create `backend/app/ai/__init__.py`** (empty file).

- [ ] **Step 4: Write the failing test — `backend/tests/test_ai_schemas.py`**

```python
from app.ai.schemas import GeneratedGuide, GeneratedStep, RawStep


def test_raw_step_defaults():
    s = RawStep(action_text="нажать Сохранить")
    assert s.action_text == "нажать Сохранить"
    assert s.dom_anchor is None
    assert s.screenshot_url is None


def test_generated_guide_round_trip():
    guide = GeneratedGuide.model_validate(
        {"title": "Возврат сделки", "steps": [{"text": "Открыть карточку"}, {"text": "Нажать Сохранить"}]}
    )
    assert guide.title == "Возврат сделки"
    assert [s.text for s in guide.steps] == ["Открыть карточку", "Нажать Сохранить"]
    assert isinstance(guide.steps[0], GeneratedStep)
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ai_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ai.schemas'`.

- [ ] **Step 6: Create `backend/app/ai/schemas.py`**

```python
from pydantic import BaseModel


class RawStep(BaseModel):
    action_text: str
    dom_anchor: dict | None = None
    screenshot_url: str | None = None


class GeneratedStep(BaseModel):
    text: str


class GeneratedGuide(BaseModel):
    title: str
    steps: list[GeneratedStep]
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai_schemas.py -v`
Expected: PASS (2 passed).

- [ ] **Step 8: Commit**

```bash
cd backend
git add pyproject.toml uv.lock app/config.py app/ai/__init__.py app/ai/schemas.py tests/test_ai_schemas.py
git commit -m "feat(ai): scaffold ai package, config, and generation schemas"
```

---

### Task 2: PII redaction (pre-send filter)

**Files:**
- Create: `backend/app/ai/redaction.py`
- Create: `backend/tests/test_ai_redaction.py`

**Interfaces:**
- Consumes: nothing (pure function, stdlib `re`).
- Produces: `app.ai.redaction.redact_pii(text: str) -> str` — replaces email addresses with `[email]` and phone numbers with `[phone]`; leaves other text unchanged.

- [ ] **Step 1: Write the failing test — `backend/tests/test_ai_redaction.py`**

```python
from app.ai.redaction import redact_pii


def test_redacts_email():
    assert redact_pii("пишите на ivan@acme.ru сегодня") == "пишите на [email] сегодня"


def test_redacts_phone():
    assert redact_pii("звоните +7 999 123-45-67 утром") == "звоните [phone] утром"
    assert redact_pii("тел 8(999)1234567") == "тел [phone]"


def test_leaves_plain_text_untouched():
    assert redact_pii("нажать кнопку Сохранить в карточке") == "нажать кнопку Сохранить в карточке"


def test_redacts_multiple_in_one_string():
    out = redact_pii("a@b.ru и +79991234567")
    assert "[email]" in out and "[phone]" in out
    assert "@" not in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ai_redaction.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ai.redaction'`.

- [ ] **Step 3: Create `backend/app/ai/redaction.py`**

```python
import re

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Phone: optional +, then 10-15 digits possibly separated by spaces, dashes, parens.
_PHONE_RE = re.compile(r"\+?\d[\d\s\-()]{8,}\d")


def redact_pii(text: str) -> str:
    """Replace emails and phone numbers with placeholders before sending text to the model.

    Email is redacted first so an email's digits are never re-matched as a phone.
    """
    text = _EMAIL_RE.sub("[email]", text)
    text = _PHONE_RE.sub("[phone]", text)
    return text
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai_redaction.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/ai/redaction.py tests/test_ai_redaction.py
git commit -m "feat(ai): add PII redaction pre-send filter"
```

---

### Task 3: Prompts + AIClient protocol + Anthropic implementation

**Files:**
- Create: `backend/app/ai/prompts.py`
- Create: `backend/app/ai/client.py`
- Create: `backend/tests/test_ai_client.py`

**Interfaces:**
- Consumes: `app.ai.schemas.{RawStep, GeneratedGuide}`, `app.config.settings`, the `anthropic` SDK.
- Produces:
  - `app.ai.prompts.GUIDE_SYSTEM_PROMPT_V1: str` and `app.ai.prompts.build_user_prompt(steps: list[RawStep], title_hint: str | None, guide_type: str) -> str`.
  - `app.ai.client.AIClient` — a `Protocol` with `generate_guide(self, steps: list[RawStep], title_hint: str | None, guide_type: str) -> GeneratedGuide`.
  - `app.ai.client.AnthropicAIClient` — concrete impl taking an injected `anthropic.Anthropic` client plus `model: str` and `max_tokens: int`.
  - `app.ai.client.get_ai_client() -> AIClient` — FastAPI dependency returning a lazily-built `AnthropicAIClient` singleton from settings.

- [ ] **Step 1: Create `backend/app/ai/prompts.py`**

```python
from app.ai.schemas import RawStep

GUIDE_SYSTEM_PROMPT_V1 = (
    "Ты — технический писатель. По сырым действиям пользователя в веб-интерфейсе "
    "составь короткий, понятный пошаговый регламент на русском языке. "
    "Верни ровно один очищенный шаг на каждый входной шаг, в том же порядке. "
    "Пиши шаги в повелительном наклонении, кратко и по делу, без воды. "
    "Не выдумывай шаги, которых нет во входных данных. "
    "Заголовок — короткая формулировка цели всего процесса."
)


def build_user_prompt(steps: list[RawStep], title_hint: str | None, guide_type: str) -> str:
    lines: list[str] = [f"Тип процесса: {guide_type}."]
    if title_hint:
        lines.append(f"Подсказка к заголовку: {title_hint}")
    lines.append("Сырые шаги (по одному на строку, в порядке выполнения):")
    for i, s in enumerate(steps, start=1):
        anchor = f" [элемент: {s.dom_anchor}]" if s.dom_anchor else ""
        lines.append(f"{i}. {s.action_text}{anchor}")
    return "\n".join(lines)
```

- [ ] **Step 2: Write the failing test — `backend/tests/test_ai_client.py`**

```python
import json
from types import SimpleNamespace

from app.ai.client import AnthropicAIClient
from app.ai.prompts import build_user_prompt
from app.ai.schemas import GeneratedGuide, RawStep


def test_build_user_prompt_includes_steps_and_hint():
    prompt = build_user_prompt(
        [RawStep(action_text="открыть карточку"), RawStep(action_text="нажать Сохранить")],
        title_hint="Возврат",
        guide_type="digital",
    )
    assert "открыть карточку" in prompt
    assert "нажать Сохранить" in prompt
    assert "Возврат" in prompt
    assert "digital" in prompt


class _FakeMessages:
    def __init__(self, payload: str):
        self._payload = payload
        self.last_kwargs: dict | None = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._payload)])


class _FakeAnthropic:
    def __init__(self, payload: str):
        self.messages = _FakeMessages(payload)


def test_anthropic_client_parses_structured_output():
    payload = json.dumps(
        {"title": "Возврат сделки", "steps": [{"text": "Открыть карточку"}, {"text": "Нажать Сохранить"}]}
    )
    fake = _FakeAnthropic(payload)
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)

    result = client.generate_guide(
        [RawStep(action_text="x"), RawStep(action_text="y")], title_hint=None, guide_type="digital"
    )

    assert isinstance(result, GeneratedGuide)
    assert result.title == "Возврат сделки"
    assert [s.text for s in result.steps] == ["Открыть карточку", "Нажать Сохранить"]
    # the SDK was called with the configured model and an output_config schema constraint
    assert fake.messages.last_kwargs["model"] == "claude-opus-4-8"
    assert "output_config" in fake.messages.last_kwargs
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ai_client.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.ai.client'`.

- [ ] **Step 4: Create `backend/app/ai/client.py`**

```python
from typing import Protocol

import anthropic

from app.ai.prompts import GUIDE_SYSTEM_PROMPT_V1, build_user_prompt
from app.ai.schemas import GeneratedGuide, RawStep
from app.config import settings


class AIClient(Protocol):
    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide: ...


class AnthropicAIClient:
    def __init__(self, client: anthropic.Anthropic, model: str, max_tokens: int):
        self._client = client
        self._model = model
        self._max_tokens = max_tokens

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        user_prompt = build_user_prompt(steps, title_hint, guide_type)
        response = self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=GUIDE_SYSTEM_PROMPT_V1,
            messages=[{"role": "user", "content": user_prompt}],
            output_config={
                "format": {"type": "json_schema", "schema": GeneratedGuide.model_json_schema()}
            },
        )
        text = next(block.text for block in response.content if block.type == "text")
        return GeneratedGuide.model_validate_json(text)


_singleton: AnthropicAIClient | None = None


def get_ai_client() -> AIClient:
    global _singleton
    if _singleton is None:
        _singleton = AnthropicAIClient(
            anthropic.Anthropic(api_key=settings.anthropic_api_key or None),
            model=settings.ai_model,
            max_tokens=settings.ai_max_tokens,
        )
    return _singleton
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai_client.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/ai/prompts.py app/ai/client.py tests/test_ai_client.py
git commit -m "feat(ai): add prompts and AIClient protocol with Anthropic implementation"
```

---

### Task 4: Generate endpoint (redact → generate → create guide)

**Files:**
- Create: `backend/app/schemas/generate.py`
- Create: `backend/app/routers/generate.py`
- Create: `backend/tests/support/__init__.py` (empty)
- Create: `backend/tests/support/fake_ai.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_generate.py`

**Interfaces:**
- Consumes: `app.ai.client.get_ai_client`, `app.ai.redaction.redact_pii`, `app.ai.schemas.RawStep`, `app.deps.require_role`, `app.db.get_db`, `app.routers.projects.get_project_or_404`, `app.routers.guides.{_create_version, build_guide_detail}`, `app.models.Guide`, `app.schemas.guide.{StepInput, GuideDetail}`.
- Produces:
  - `app.schemas.generate.GenerateGuideRequest(title_hint: str | None = None, type: Literal["digital","offline"], raw_steps: list[RawStep])`.
  - `POST /orgs/{org_id}/projects/{project_id}/guides/generate` (editor+) → 201 `GuideDetail`. Redacts each raw step's `action_text`, calls the AI client, creates a guide (version 1) whose steps carry the AI text, the original `screenshot_url` as `media_url`, and a fingerprint dict. Returns 502 if the model returns a different number of steps than were sent; 404 if the project isn't in the org.
  - Helper `_build_fingerprint(raw: RawStep, generated_text: str) -> dict` in `app/routers/generate.py`.
  - `tests.support.fake_ai.FakeAIClient` — records the steps it received and returns a preset `GeneratedGuide`.

- [ ] **Step 1: Create `backend/app/schemas/generate.py`**

```python
from typing import Literal

from pydantic import BaseModel

from app.ai.schemas import RawStep


class GenerateGuideRequest(BaseModel):
    title_hint: str | None = None
    type: Literal["digital", "offline"]
    raw_steps: list[RawStep]
```

- [ ] **Step 2: Create `backend/tests/support/__init__.py` (empty) and `backend/tests/support/fake_ai.py`**

```python
from app.ai.schemas import GeneratedGuide, RawStep


class FakeAIClient:
    """Test double for AIClient. Records received steps; returns a preset guide."""

    def __init__(self, result: GeneratedGuide):
        self._result = result
        self.received_steps: list[RawStep] | None = None
        self.received_title_hint: str | None = None
        self.received_guide_type: str | None = None

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        self.received_steps = steps
        self.received_title_hint = title_hint
        self.received_guide_type = guide_type
        return self._result
```

- [ ] **Step 3: Write the failing test — `backend/tests/test_generate.py`**

```python
import pytest

from app.ai.client import get_ai_client
from app.ai.schemas import GeneratedGuide, GeneratedStep
from app.main import app
from tests.support.fake_ai import FakeAIClient


def _owner_with_project(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "Support"}, headers=h).json()["id"]
    return org_id, pid, h


def _use_fake(result: GeneratedGuide) -> FakeAIClient:
    fake = FakeAIClient(result)
    app.dependency_overrides[get_ai_client] = lambda: fake
    return fake


@pytest.fixture(autouse=True)
def _clear_ai_override():
    yield
    app.dependency_overrides.pop(get_ai_client, None)


def test_generate_creates_guide_from_clean_ai_output(client):
    org_id, pid, h = _owner_with_project(client)
    fake = _use_fake(
        GeneratedGuide(title="Возврат сделки", steps=[GeneratedStep(text="Открыть карточку"), GeneratedStep(text="Нажать Сохранить")])
    )

    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides/generate",
        json={
            "title_hint": "возврат",
            "type": "digital",
            "raw_steps": [
                {"action_text": "клик по сделке ivan@acme.ru", "dom_anchor": {"role": "link"}, "screenshot_url": "https://cdn/1.png"},
                {"action_text": "сохранить", "screenshot_url": "https://cdn/2.png"},
            ],
        },
        headers=h,
    )

    assert resp.status_code == 201
    detail = resp.json()
    assert detail["title"] == "Возврат сделки"
    assert [s["text"] for s in detail["steps"]] == ["Открыть карточку", "Нажать Сохранить"]
    assert detail["steps"][0]["media_url"] == "https://cdn/1.png"
    assert detail["steps"][0]["order_index"] == 0
    assert detail["steps"][1]["order_index"] == 1
    # fingerprint carries the dom anchor and the generated semantics
    assert detail["steps"][0]["fingerprint"]["dom_anchor"] == {"role": "link"}
    assert detail["steps"][0]["fingerprint"]["semantics"] == "Открыть карточку"
    # PII was redacted BEFORE the model saw it
    assert "ivan@acme.ru" not in fake.received_steps[0].action_text
    assert "[email]" in fake.received_steps[0].action_text


def test_generate_rejects_step_count_mismatch_with_502(client):
    org_id, pid, h = _owner_with_project(client)
    _use_fake(GeneratedGuide(title="X", steps=[GeneratedStep(text="only one")]))  # 1 step for 2 inputs

    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides/generate",
        json={"type": "digital", "raw_steps": [{"action_text": "a"}, {"action_text": "b"}]},
        headers=h,
    )
    assert resp.status_code == 502


def test_generate_requires_editor(client):
    org_id, pid, h = _owner_with_project(client)
    # create a viewer in this org
    client.post("/auth/signup", json={"email": "v@acme.com", "password": "pw", "org_name": "Tmp"})
    client.post(f"/orgs/{org_id}/members", json={"email": "v@acme.com", "role": "viewer"}, headers=h)
    vb = client.post("/auth/login", json={"email": "v@acme.com", "password": "pw"}).json()
    hv = {"Authorization": f"Bearer {vb['access_token']}"}
    _use_fake(GeneratedGuide(title="X", steps=[GeneratedStep(text="s")]))

    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides/generate",
        json={"type": "digital", "raw_steps": [{"action_text": "a"}]},
        headers=hv,
    )
    assert resp.status_code == 403


def test_generate_unknown_project_404(client):
    org_id, _pid, h = _owner_with_project(client)
    _use_fake(GeneratedGuide(title="X", steps=[GeneratedStep(text="s")]))
    resp = client.post(
        f"/orgs/{org_id}/projects/nope/guides/generate",
        json={"type": "digital", "raw_steps": [{"action_text": "a"}]},
        headers=h,
    )
    assert resp.status_code == 404
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_generate.py -v`
Expected: FAIL with 404 (route not registered) / import errors for the router.

- [ ] **Step 5: Create `backend/app/routers/generate.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.client import AIClient, get_ai_client
from app.ai.redaction import redact_pii
from app.ai.schemas import RawStep
from app.db import get_db
from app.deps import require_role
from app.models import Guide, Membership
from app.routers.guides import _create_version, build_guide_detail
from app.routers.projects import get_project_or_404
from app.schemas.generate import GenerateGuideRequest
from app.schemas.guide import GuideDetail, StepInput

router = APIRouter(prefix="/orgs/{org_id}", tags=["generate"])


def _build_fingerprint(raw: RawStep, generated_text: str) -> dict:
    return {
        "dom_anchor": raw.dom_anchor,
        "semantics": generated_text,
        "screenshot_url": raw.screenshot_url,
    }


@router.post(
    "/projects/{project_id}/guides/generate", response_model=GuideDetail, status_code=201
)
def generate_guide(
    org_id: str,
    project_id: str,
    payload: GenerateGuideRequest,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
    ai: AIClient = Depends(get_ai_client),
) -> GuideDetail:
    get_project_or_404(db, org_id, project_id)

    redacted = [
        RawStep(
            action_text=redact_pii(s.action_text),
            dom_anchor=s.dom_anchor,
            screenshot_url=s.screenshot_url,
        )
        for s in payload.raw_steps
    ]

    generated = ai.generate_guide(redacted, payload.title_hint, payload.type)
    if len(generated.steps) != len(redacted):
        raise HTTPException(status_code=502, detail="AI returned a mismatched step count")

    guide = Guide(org_id=org_id, project_id=project_id, title=generated.title, type=payload.type)
    db.add(guide)
    db.flush()

    steps = [
        StepInput(
            text=g.text,
            media_url=r.screenshot_url,
            fingerprint=_build_fingerprint(r, g.text),
        )
        for g, r in zip(generated.steps, redacted)
    ]
    _create_version(db, guide, steps, membership.user_id, version_number=1)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)
```

- [ ] **Step 6: Register the router — modify `backend/app/main.py`**

Add `generate` to the routers import and register it:

```python
from app.routers import auth, drift, generate, guides, members, projects, share

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(guides.router)
app.include_router(share.org_router)
app.include_router(share.public_router)
app.include_router(drift.router)
app.include_router(generate.router)
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_generate.py -v`
Expected: PASS (4 passed).

- [ ] **Step 8: Run the full suite to confirm no regressions**

Run: `cd backend && uv run pytest -q`
Expected: all tests pass (Plan 1's 25 + the new AI tests).

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/schemas/generate.py app/routers/generate.py app/main.py tests/support/ tests/test_generate.py
git commit -m "feat(ai): add guide generation endpoint with PII redaction"
```

---

### Task 5: Manual eval harness (golden sample, not run in CI)

**Files:**
- Create: `backend/scripts/ai_eval.py`
- Create: `backend/scripts/ai_eval_golden.json`
- Create: `backend/tests/test_ai_eval_importable.py`

**Interfaces:**
- Consumes: `app.ai.client.AnthropicAIClient`, `app.ai.redaction.redact_pii`, `app.ai.schemas.RawStep`, `app.config.settings`, the `anthropic` SDK.
- Produces: `scripts.ai_eval.run_eval() -> None` — loads the golden sample, redacts it, calls the REAL Anthropic client, and prints the generated guide for human review. Intended to be run manually with a real `ANTHROPIC_API_KEY`; it is never invoked by the automated suite.

- [ ] **Step 1: Create `backend/scripts/ai_eval_golden.json`**

```json
{
  "title_hint": "возврат денег по сделке",
  "type": "digital",
  "raw_steps": [
    {"action_text": "открыть карточку сделки клиента ivan@acme.ru", "dom_anchor": {"role": "link", "text": "Сделка"}},
    {"action_text": "перейти на вкладку Оплаты"},
    {"action_text": "нажать кнопку Вернуть деньги"},
    {"action_text": "подтвердить сумму и нажать Сохранить"}
  ]
}
```

- [ ] **Step 2: Create `backend/scripts/ai_eval.py`**

```python
"""Manual eval harness for the AI generation pipeline.

Run with a real key:  cd backend && ANTHROPIC_API_KEY=sk-... uv run python scripts/ai_eval.py
This is NOT part of the automated test suite — it calls the real Claude API.
"""

import json
import pathlib

import anthropic

from app.ai.client import AnthropicAIClient
from app.ai.redaction import redact_pii
from app.ai.schemas import RawStep
from app.config import settings

GOLDEN = pathlib.Path(__file__).parent / "ai_eval_golden.json"


def run_eval() -> None:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    raw = [
        RawStep(
            action_text=redact_pii(s["action_text"]),
            dom_anchor=s.get("dom_anchor"),
            screenshot_url=s.get("screenshot_url"),
        )
        for s in data["raw_steps"]
    ]
    client = AnthropicAIClient(
        anthropic.Anthropic(api_key=settings.anthropic_api_key or None),
        model=settings.ai_model,
        max_tokens=settings.ai_max_tokens,
    )
    guide = client.generate_guide(raw, data.get("title_hint"), data["type"])
    print(f"TITLE: {guide.title}")
    for i, step in enumerate(guide.steps, start=1):
        print(f"  {i}. {step.text}")


if __name__ == "__main__":
    run_eval()
```

- [ ] **Step 3: Write the failing test — `backend/tests/test_ai_eval_importable.py`**

This test only guards that the harness imports and the golden file is valid JSON — it never calls the API.

```python
import json
import pathlib


def test_eval_harness_imports_without_calling_api():
    import scripts.ai_eval as ai_eval

    assert hasattr(ai_eval, "run_eval")


def test_golden_sample_is_valid():
    path = pathlib.Path(__file__).parent.parent / "scripts" / "ai_eval_golden.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["type"] in {"digital", "offline"}
    assert len(data["raw_steps"]) >= 1
    assert all("action_text" in s for s in data["raw_steps"])
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_ai_eval_importable.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts'` (or scripts.ai_eval).

> If the import fails because `scripts` isn't a package, create an empty `backend/scripts/__init__.py` so `import scripts.ai_eval` resolves, and add it to the commit.

- [ ] **Step 5: Make the harness importable**

Create empty `backend/scripts/__init__.py`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_ai_eval_importable.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd backend
git add scripts/ tests/test_ai_eval_importable.py
git commit -m "feat(ai): add manual eval harness with golden sample"
```

---

## Self-Review

**1. Spec coverage (against design §4 component 3 "AI-пайплайн" and §5 fingerprint, plus conventions §21):**
- "из сырых шагов/скриншотов → чистый русский текст шага" → Task 3/4 (clean Russian step text from raw actions). ✅
- "заголовки" → `GeneratedGuide.title`, Task 3/4. ✅
- "авто-замазывание перс-данных" → Task 2 redaction, applied before send in Task 4. ✅ (text-only; screenshot/vision redaction explicitly deferred — see Global Constraints.)
- Fingerprint triplet (§5.2: DOM-якорь, скриншот, семантика) → `_build_fingerprint` stores `dom_anchor`, `screenshot_url`, `semantics` (the generated step text) — the seam Plan 5 drift-scoring consumes. ✅
- "сравнение отпечатков для drift-скоринга, авто-черновик" → **out of scope here by design**: that is Plan 5 (drift engine), which will reuse this plan's `AIClient`/`AnthropicAIClient`. No gap.
- Conventions §21 (SDK-only, model id, redact-before-send, structured output, versioned prompts, eval harness, isolated behind interface) → all honored across Tasks 1–5. ✅

**2. Placeholder scan:** No TBD/TODO/"handle errors" placeholders; every code step is complete. The 502 guard, project 404, and editor gate are concrete. ✅

**3. Type consistency:** `RawStep`/`GeneratedStep`/`GeneratedGuide` (Task 1) are used unchanged in Tasks 3–5. `AIClient.generate_guide(steps, title_hint, guide_type) -> GeneratedGuide` has one signature across `AnthropicAIClient` (Task 3), `FakeAIClient` (Task 4), and the eval harness (Task 5). The endpoint reuses Plan 1's exact names: `StepInput(text, media_url, fingerprint)`, `_create_version(db, guide, steps, user_id, version_number)`, `build_guide_detail(db, guide)`, `get_project_or_404(db, org_id, project_id)`, `Guide(org_id, project_id, title, type)`, `GuideDetail`. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-ai-pipeline-generation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review (spec + quality) between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
