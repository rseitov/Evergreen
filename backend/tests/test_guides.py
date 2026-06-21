def _owner_with_project(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    p = client.post(f"/orgs/{org_id}/projects", json={"name": "Support"}, headers=h).json()
    return org_id, p["id"], h


def test_create_and_get_guide(client):
    org_id, pid, h = _owner_with_project(client)
    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "Refund a deal",
            "type": "digital",
            "steps": [
                {"text": "Open the deal card", "fingerprint": {"anchor": "deal-card"}},
                {"text": "Click Save", "media_url": "https://cdn/x.png"},
            ],
        },
        headers=h,
    )
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["version_number"] == 1
    assert detail["current_version_id"] == detail["current_version_id"]
    assert len(detail["steps"]) == 2
    assert detail["steps"][0]["order_index"] == 0
    assert detail["steps"][1]["order_index"] == 1

    gid = detail["id"]
    got = client.get(f"/orgs/{org_id}/guides/{gid}", headers=h)
    assert got.status_code == 200
    assert got.json()["steps"][0]["text"] == "Open the deal card"

    listing = client.get(f"/orgs/{org_id}/projects/{pid}/guides", headers=h)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_unknown_guide_404(client):
    org_id, pid, h = _owner_with_project(client)
    assert client.get(f"/orgs/{org_id}/guides/nope", headers=h).status_code == 404
