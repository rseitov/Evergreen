def _guide_with_url(client, allowlist, step_url):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(
        f"/orgs/{org_id}/projects",
        json={"name": "P", "allowlist_domains": allowlist},
        headers=h,
    ).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "Открыть", "url": step_url}]},
        headers=h,
    ).json()
    return org_id, g["id"], h


def test_observable_returns_step_on_allowlisted_domain(client):
    url = "https://crm.acme.ru/deals/1"
    org_id, guide_id, h = _guide_with_url(client, ["crm.acme.ru"], url)
    resp = client.get(f"/orgs/{org_id}/steps/observable", params={"url": url}, headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["guide_id"] == guide_id
    assert body[0]["url"] == url


def test_observable_excludes_non_allowlisted_domain(client):
    url = "https://crm.acme.ru/deals/1"
    # project allowlist does NOT include the url's host
    org_id, _gid, h = _guide_with_url(client, ["other.acme.ru"], url)
    resp = client.get(f"/orgs/{org_id}/steps/observable", params={"url": url}, headers=h)
    assert resp.status_code == 200
    assert resp.json() == []


def test_observable_excludes_other_org(client):
    url = "https://crm.acme.ru/deals/1"
    _org_a, _gid, _ha = _guide_with_url(client, ["crm.acme.ru"], url)
    b = client.post(
        "/auth/signup", json={"email": "b@x.ru", "password": "pw", "org_name": "OrgB"}
    ).json()
    hb = {"Authorization": f"Bearer {b['access_token']}"}
    org_b = b["org_id"]
    resp = client.get(f"/orgs/{org_b}/steps/observable", params={"url": url}, headers=hb)
    assert resp.status_code == 200
    assert resp.json() == []
