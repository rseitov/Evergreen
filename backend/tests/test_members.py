def _signup(client, email, org="Acme"):
    r = client.post("/auth/signup", json={"email": email, "password": "pw", "org_name": org})
    return r.json()


def test_owner_can_add_existing_user_as_member(client):
    owner = _signup(client, "owner@acme.com")
    # second user signs up (creates their own org but exists as a user)
    _signup(client, "ops@acme.com", org="Temp")

    org_id = owner["org_id"]
    h = {"Authorization": f"Bearer {owner['access_token']}"}

    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "ops@acme.com", "role": "editor"}, headers=h
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "editor"

    listing = client.get(f"/orgs/{org_id}/members", headers=h)
    emails = {m["email"] for m in listing.json()}
    assert {"owner@acme.com", "ops@acme.com"} <= emails


def test_add_unknown_user_returns_404(client):
    owner = _signup(client, "owner@acme.com")
    org_id = owner["org_id"]
    h = {"Authorization": f"Bearer {owner['access_token']}"}
    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "ghost@acme.com", "role": "viewer"}, headers=h
    )
    assert resp.status_code == 404


def test_editor_cannot_add_members(client):
    owner = _signup(client, "owner@acme.com")
    _signup(client, "ed@acme.com", org="Temp")
    org_id = owner["org_id"]
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    client.post(f"/orgs/{org_id}/members", json={"email": "ed@acme.com", "role": "editor"}, headers=oh)

    ed_login = client.post("/auth/login", json={"email": "ed@acme.com", "password": "pw"}).json()
    eh = {"Authorization": f"Bearer {ed_login['access_token']}"}
    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "owner@acme.com", "role": "viewer"}, headers=eh
    )
    assert resp.status_code == 403
