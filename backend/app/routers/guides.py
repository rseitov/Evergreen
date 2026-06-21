from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Guide, GuideVersion, Membership, Step
from app.routers.projects import get_project_or_404
from app.schemas.guide import (
    GuideCreate,
    GuideDetail,
    GuideSummary,
    NewVersionRequest,
    StepInput,
    StepOut,
    VersionSummary,
)

router = APIRouter(prefix="/orgs/{org_id}", tags=["guides"])


def get_guide_or_404(db: Session, org_id: str, guide_id: str) -> Guide:
    guide = db.execute(
        select(Guide).where(Guide.id == guide_id, Guide.org_id == org_id)
    ).scalar_one_or_none()
    if guide is None:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide


def _create_version(db: Session, guide: Guide, steps: list[StepInput], user_id: str, version_number: int) -> GuideVersion:
    version = GuideVersion(guide_id=guide.id, version_number=version_number, created_by=user_id)
    db.add(version)
    db.flush()
    for idx, s in enumerate(steps):
        db.add(
            Step(
                version_id=version.id,
                order_index=idx,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
            )
        )
    guide.current_version_id = version.id
    return version


def build_guide_detail(db: Session, guide: Guide) -> GuideDetail:
    version = db.get(GuideVersion, guide.current_version_id)
    steps = db.execute(
        select(Step).where(Step.version_id == version.id).order_by(Step.order_index)
    ).scalars().all()
    return GuideDetail(
        id=guide.id,
        title=guide.title,
        type=guide.type,
        project_id=guide.project_id,
        version_number=version.version_number,
        current_version_id=version.id,
        steps=[
            StepOut(
                id=s.id,
                order_index=s.order_index,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
            )
            for s in steps
        ],
        created_at=guide.created_at,
    )


@router.post("/projects/{project_id}/guides", response_model=GuideDetail, status_code=201)
def create_guide(
    org_id: str,
    project_id: str,
    payload: GuideCreate,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> GuideDetail:
    get_project_or_404(db, org_id, project_id)
    guide = Guide(org_id=org_id, project_id=project_id, title=payload.title, type=payload.type)
    db.add(guide)
    db.flush()
    _create_version(db, guide, payload.steps, membership.user_id, version_number=1)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)


@router.get("/guides/{guide_id}", response_model=GuideDetail)
def get_guide(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> GuideDetail:
    guide = get_guide_or_404(db, org_id, guide_id)
    return build_guide_detail(db, guide)


@router.get("/projects/{project_id}/guides", response_model=list[GuideSummary])
def list_guides(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[GuideSummary]:
    rows = db.execute(
        select(Guide).where(Guide.org_id == org_id, Guide.project_id == project_id)
    ).scalars().all()
    return [
        GuideSummary(
            id=g.id,
            title=g.title,
            type=g.type,
            project_id=g.project_id,
            current_version_id=g.current_version_id,
            created_at=g.created_at,
        )
        for g in rows
    ]


@router.post("/guides/{guide_id}/versions", response_model=GuideDetail, status_code=201)
def create_version(
    org_id: str,
    guide_id: str,
    payload: NewVersionRequest,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> GuideDetail:
    guide = get_guide_or_404(db, org_id, guide_id)
    last = db.execute(
        select(GuideVersion)
        .where(GuideVersion.guide_id == guide.id)
        .order_by(GuideVersion.version_number.desc())
    ).scalars().first()
    next_number = (last.version_number + 1) if last else 1
    _create_version(db, guide, payload.steps, membership.user_id, version_number=next_number)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)


@router.get("/guides/{guide_id}/versions", response_model=list[VersionSummary])
def list_versions(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[VersionSummary]:
    guide = get_guide_or_404(db, org_id, guide_id)
    rows = db.execute(
        select(GuideVersion)
        .where(GuideVersion.guide_id == guide.id)
        .order_by(GuideVersion.version_number.desc())
    ).scalars().all()
    return [
        VersionSummary(
            id=v.id,
            version_number=v.version_number,
            created_by=v.created_by,
            created_at=v.created_at,
            is_current=(v.id == guide.current_version_id),
        )
        for v in rows
    ]
