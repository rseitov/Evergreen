from sqlalchemy import select

from app.models import Membership, Organization, User


def test_can_persist_org_user_membership(db_session):
    org = Organization(name="Acme")
    user = User(email="a@example.com", password_hash="x")
    db_session.add_all([org, user])
    db_session.flush()

    member = Membership(org_id=org.id, user_id=user.id, role="owner")
    db_session.add(member)
    db_session.flush()

    loaded = db_session.execute(select(Membership)).scalar_one()
    assert loaded.role == "owner"
    assert loaded.org_id == org.id
    assert loaded.user_id == user.id
    assert len(org.id) == 32
