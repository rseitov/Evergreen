from fastapi import Depends, Header, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Membership, User
from app.roles import role_satisfies
from app.security import decode_access_token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_membership(
    org_id: str = Path(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Membership:
    membership = db.execute(
        select(Membership).where(
            Membership.org_id == org_id, Membership.user_id == user.id
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return membership


def require_role(min_role: str):
    def checker(membership: Membership = Depends(get_membership)) -> Membership:
        if not role_satisfies(membership.role, min_role):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return membership

    return checker
