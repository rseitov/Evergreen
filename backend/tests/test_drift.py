def _guide_with_step(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "click save"}]},
        headers=h,
    ).json()
    return org_id, g["steps"][0]["id"], h


def test_drift_lifecycle(client):
    org_id, step_id, h = _guide_with_step(client)

    create = client.post(
        f"/orgs/{org_id}/drift",
        json={
            "step_id": step_id,
            "score": 0.7,
            "source": "passive",
            "fresh_fingerprint": {"anchor": "save-btn-v2"},
            "draft_text": "click the new Save button",
        },
        headers=h,
    )
    assert create.status_code == 201
    event_id = create.json()["id"]
    assert create.json()["status"] == "open"

    open_list = client.get(f"/orgs/{org_id}/drift?status=open", headers=h)
    assert open_list.status_code == 200
    assert len(open_list.json()) == 1

    accept = client.post(f"/orgs/{org_id}/drift/{event_id}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    assert len(client.get(f"/orgs/{org_id}/drift?status=open", headers=h).json()) == 0


def test_drift_for_unknown_step_404(client):
    org_id, _step_id, h = _guide_with_step(client)
    resp = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": "nope", "score": 0.9, "source": "flag"},
        headers=h,
    )
    assert resp.status_code == 404


def test_dismiss(client):
    org_id, step_id, h = _guide_with_step(client)
    event_id = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": step_id, "score": 0.3, "source": "flag"},
        headers=h,
    ).json()["id"]
    resp = client.post(f"/orgs/{org_id}/drift/{event_id}/dismiss", headers=h)
    assert resp.status_code == 200
    assert resp.json()["status"] == "dismissed"
