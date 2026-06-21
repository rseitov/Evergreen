import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models import Membership, ShareLink
from app.routers.guides import build_guide_detail, get_guide_or_404
from app.schemas.guide import GuideDetail
from app.schemas.share import ShareLinkOut


def make_token() -> str:
    return secrets.token_urlsafe(24)


org_router = APIRouter(prefix="/orgs/{org_id}/guides/{guide_id}", tags=["share"])
public_router = APIRouter(prefix="/share", tags=["share"])


@org_router.post("/share", response_model=ShareLinkOut, status_code=201)
def create_share_link(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> ShareLinkOut:
    guide = get_guide_or_404(db, org_id, guide_id)
    token = make_token()
    db.add(ShareLink(org_id=org_id, guide_id=guide.id, token=token))
    db.commit()
    return ShareLinkOut(token=token, url_path=f"/share/{token}")


@public_router.get("/{token}", response_model=GuideDetail)
def read_shared_guide(token: str, db: Session = Depends(get_db)) -> GuideDetail:
    link = db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    guide = get_guide_or_404(db, link.org_id, link.guide_id)
    return build_guide_detail(db, guide)
