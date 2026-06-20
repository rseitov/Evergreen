ROLE_RANK: dict[str, int] = {"viewer": 0, "editor": 1, "owner": 2}


def role_satisfies(have: str, need: str) -> bool:
    return ROLE_RANK.get(have, -1) >= ROLE_RANK[need]
