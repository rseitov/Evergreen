from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Membership, User
from app.schemas.member import AddMemberRequest, MemberOut

router = APIRouter(prefix="/orgs/{org_id}/members", tags=["members"])


@router.post("", response_model=MemberOut, status_code=201)
def add_member(
    org_id: str,
    payload: AddMemberRequest,
    _owner: Membership = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> MemberOut:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    exists = db.execute(
        select(Membership).where(Membership.org_id == org_id, Membership.user_id == user.id)
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Already a member")
    member = Membership(org_id=org_id, user_id=user.id, role=payload.role)
    db.add(member)
    db.commit()
    return MemberOut(user_id=user.id, email=user.email, role=member.role)


@router.get("", response_model=list[MemberOut])
def list_members(
    org_id: str,
    _member: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    rows = db.execute(
        select(Membership, User).join(User, User.id == Membership.user_id).where(
            Membership.org_id == org_id
        )
    ).all()
    return [MemberOut(user_id=u.id, email=u.email, role=m.role) for m, u in rows]
