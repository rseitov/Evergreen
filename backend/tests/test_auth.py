def test_signup_then_login_then_me(client):
    resp = client.post(
        "/auth/signup",
        json={"email": "owner@acme.com", "password": "pw", "org_name": "Acme"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["org_id"]

    dup = client.post(
        "/auth/signup",
        json={"email": "owner@acme.com", "password": "pw", "org_name": "Acme2"},
    )
    assert dup.status_code == 409

    login = client.post("/auth/login", json={"email": "owner@acme.com", "password": "pw"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    bad = client.post("/auth/login", json={"email": "owner@acme.com", "password": "nope"})
    assert bad.status_code == 401

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    me_body = me.json()
    assert me_body["email"] == "owner@acme.com"
    assert me_body["memberships"][0]["role"] == "owner"


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401
