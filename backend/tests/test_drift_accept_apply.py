def _guide_with_two_steps(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "G",
            "type": "digital",
            "steps": [{"text": "Открыть карточку"}, {"text": "нажать «Сохранить»"}],
        },
        headers=h,
    ).json()
    return org_id, g["id"], g["steps"], h


def test_accept_with_draft_creates_new_version_replacing_the_step(client):
    org_id, guide_id, steps, h = _guide_with_two_steps(client)
    second_step_id = steps[1]["id"]
    # create a drift event carrying a draft for the second step
    event = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": second_step_id, "score": 0.7, "source": "passive", "draft_text": "нажать «Готово»"},
        headers=h,
    ).json()

    accept = client.post(f"/orgs/{org_id}/drift/{event['id']}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    guide = client.get(f"/orgs/{org_id}/guides/{guide_id}", headers=h).json()
    assert guide["version_number"] == 2
    assert [s["text"] for s in guide["steps"]] == ["Открыть карточку", "нажать «Готово»"]


def test_accept_without_draft_only_transitions_status(client):
    org_id, guide_id, steps, h = _guide_with_two_steps(client)
    event = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": steps[0]["id"], "score": 0.3, "source": "passive"},
        headers=h,
    ).json()

    accept = client.post(f"/orgs/{org_id}/drift/{event['id']}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    guide = client.get(f"/orgs/{org_id}/guides/{guide_id}", headers=h).json()
    assert guide["version_number"] == 1  # unchanged
