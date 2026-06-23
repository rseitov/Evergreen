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
