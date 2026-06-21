def _guide(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "v1 step"}]},
        headers=h,
    ).json()
    return org_id, g["id"], g["current_version_id"], h


def test_new_version_is_immutable_snapshot(client):
    org_id, gid, v1_id, h = _guide(client)

    resp = client.post(
        f"/orgs/{org_id}/guides/{gid}/versions",
        json={"steps": [{"text": "v2 step a"}, {"text": "v2 step b"}]},
        headers=h,
    )
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["version_number"] == 2
    assert detail["current_version_id"] != v1_id
    assert len(detail["steps"]) == 2

    # current guide now reflects v2
    current = client.get(f"/orgs/{org_id}/guides/{gid}", headers=h).json()
    assert current["version_number"] == 2
    assert current["steps"][0]["text"] == "v2 step a"

    # history has both versions, newest first, v1 not current
    hist = client.get(f"/orgs/{org_id}/guides/{gid}/versions", headers=h).json()
    assert [v["version_number"] for v in hist] == [2, 1]
    by_num = {v["version_number"]: v for v in hist}
    assert by_num[2]["is_current"] is True
    assert by_num[1]["is_current"] is False
