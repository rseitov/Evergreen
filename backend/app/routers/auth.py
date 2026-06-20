from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Membership, Organization, User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    MembershipOut,
    SignupRequest,
    TokenResponse,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    org = Organization(name=payload.org_name)
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add_all([org, user])
    db.flush()
    db.add(Membership(org_id=org.id, user_id=user.id, role="owner"))
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id), user_id=user.id, org_id=org.id
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id), user_id=user.id)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    rows = db.execute(select(Membership).where(Membership.user_id == user.id)).scalars().all()
    return MeResponse(
        user_id=user.id,
        email=user.email,
        memberships=[MembershipOut(org_id=m.org_id, role=m.role) for m in rows],
    )
