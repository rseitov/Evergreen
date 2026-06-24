import pytest

from app.ai.client import get_ai_client
from app.ai.errors import AIGenerationError
from app.ai.schemas import GeneratedGuide, GeneratedStep
from app.main import app
from tests.support.fake_ai import FakeAIClient, RaisingAIClient


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


def test_generate_ai_generation_error_returns_502(client):
    org_id, pid, h = _owner_with_project(client)
    app.dependency_overrides[get_ai_client] = lambda: RaisingAIClient(
        AIGenerationError("model refused the request")
    )
    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides/generate",
        json={"type": "digital", "raw_steps": [{"action_text": "a"}]},
        headers=h,
    )
    assert resp.status_code == 502
