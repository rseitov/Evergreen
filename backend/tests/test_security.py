from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_round_trip():
    hashed = hash_password("hunter2")
    assert hashed != "hunter2"
    assert verify_password("hunter2", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_token_round_trip():
    token = create_access_token("user-123")
    assert decode_access_token(token) == "user-123"


def test_token_invalid_returns_none():
    assert decode_access_token("not-a-token") is None
