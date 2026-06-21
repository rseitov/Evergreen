def _owner(client, email="owner@acme.com"):
    r = client.post("/auth/signup", json={"email": email, "password": "pw", "org_name": "Acme"})
    b = r.json()
    return b["org_id"], {"Authorization": f"Bearer {b['access_token']}"}


def test_project_crud(client):
    org_id, h = _owner(client)

    create = client.post(
        f"/orgs/{org_id}/projects",
        json={"name": "Support", "allowlist_domains": ["crm.acme.ru"]},
        headers=h,
    )
    assert create.status_code == 201
    pid = create.json()["id"]
    assert create.json()["allowlist_domains"] == ["crm.acme.ru"]

    listing = client.get(f"/orgs/{org_id}/projects", headers=h)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    get_one = client.get(f"/orgs/{org_id}/projects/{pid}", headers=h)
    assert get_one.status_code == 200

    patch = client.patch(
        f"/orgs/{org_id}/projects/{pid}",
        json={"allowlist_domains": ["crm.acme.ru", "lk.acme.ru"]},
        headers=h,
    )
    assert patch.status_code == 200
    assert patch.json()["allowlist_domains"] == ["crm.acme.ru", "lk.acme.ru"]
    assert patch.json()["name"] == "Support"

    delete = client.delete(f"/orgs/{org_id}/projects/{pid}", headers=h)
    assert delete.status_code == 204
    assert client.get(f"/orgs/{org_id}/projects/{pid}", headers=h).status_code == 404


def test_unknown_project_returns_404(client):
    org_id, h = _owner(client, email="owner2@acme.com")
    assert client.get(f"/orgs/{org_id}/projects/nope", headers=h).status_code == 404
