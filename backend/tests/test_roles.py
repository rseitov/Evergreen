from app.roles import ROLE_RANK, role_satisfies


def test_role_rank_order():
    assert ROLE_RANK["viewer"] < ROLE_RANK["editor"] < ROLE_RANK["owner"]


def test_role_satisfies():
    assert role_satisfies("owner", "editor") is True
    assert role_satisfies("editor", "editor") is True
    assert role_satisfies("viewer", "editor") is False
