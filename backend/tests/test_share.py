def _guide(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "Public guide", "type": "digital", "steps": [{"text": "do it"}]},
        headers=h,
    ).json()
    return org_id, g["id"], h


def test_share_link_public_read(client):
    org_id, gid, h = _guide(client)
    share = client.post(f"/orgs/{org_id}/guides/{gid}/share", headers=h)
    assert share.status_code == 201
    token = share.json()["token"]
    assert share.json()["url_path"] == f"/share/{token}"

    # public, no auth header
    public = client.get(f"/share/{token}")
    assert public.status_code == 200
    assert public.json()["title"] == "Public guide"
    assert public.json()["steps"][0]["text"] == "do it"


def test_unknown_share_token_404(client):
    assert client.get("/share/does-not-exist").status_code == 404
