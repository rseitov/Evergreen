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
