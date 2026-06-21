def _org(client, email):
    b = client.post(
        "/auth/signup", json={"email": email, "password": "pw", "org_name": "Org"}
    ).json()
    return b["org_id"], {"Authorization": f"Bearer {b['access_token']}"}


def test_user_cannot_touch_other_orgs_resources(client):
    org_a, ha = _org(client, "a@x.com")
    org_b, hb = _org(client, "b@x.com")

    # A creates a project + guide
    pid = client.post(f"/orgs/{org_a}/projects", json={"name": "A-proj"}, headers=ha).json()["id"]
    gid = client.post(
        f"/orgs/{org_a}/projects/{pid}/guides",
        json={"title": "A-guide", "type": "digital", "steps": [{"text": "x"}]},
        headers=ha,
    ).json()["id"]

    # B is not a member of org A: membership dependency returns 404
    assert client.get(f"/orgs/{org_a}/projects", headers=hb).status_code == 404
    assert client.get(f"/orgs/{org_a}/projects/{pid}", headers=hb).status_code == 404
    assert client.get(f"/orgs/{org_a}/guides/{gid}", headers=hb).status_code == 404
    assert (
        client.post(
            f"/orgs/{org_a}/projects/{pid}/guides",
            json={"title": "evil", "type": "digital", "steps": [{"text": "x"}]},
            headers=hb,
        ).status_code
        == 404
    )

    # Even addressing A's guide under B's own org path must not leak it
    assert client.get(f"/orgs/{org_b}/guides/{gid}", headers=hb).status_code == 404


def test_viewer_cannot_write(client):
    org_a, ha = _org(client, "owner@x.com")
    # create a viewer user and add to org A
    client.post("/auth/signup", json={"email": "v@x.com", "password": "pw", "org_name": "Tmp"})
    client.post(f"/orgs/{org_a}/members", json={"email": "v@x.com", "role": "viewer"}, headers=ha)
    vb = client.post("/auth/login", json={"email": "v@x.com", "password": "pw"}).json()
    hv = {"Authorization": f"Bearer {vb['access_token']}"}

    # viewer can read projects but not create
    assert client.get(f"/orgs/{org_a}/projects", headers=hv).status_code == 200
    assert client.post(f"/orgs/{org_a}/projects", json={"name": "nope"}, headers=hv).status_code == 403
