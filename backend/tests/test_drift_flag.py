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
