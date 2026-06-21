from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import DriftEvent, Guide, GuideVersion, Membership, Step
from app.schemas.drift import DriftCreate, DriftEventOut

router = APIRouter(prefix="/orgs/{org_id}/drift", tags=["drift"])


def _step_in_org_or_404(db: Session, org_id: str, step_id: str) -> Step:
    step = db.execute(
        select(Step)
        .join(GuideVersion, GuideVersion.id == Step.version_id)
        .join(Guide, Guide.id == GuideVersion.guide_id)
        .where(Step.id == step_id, Guide.org_id == org_id)
    ).scalar_one_or_none()
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


def _get_event_or_404(db: Session, org_id: str, event_id: str) -> DriftEvent:
    event = db.execute(
        select(DriftEvent).where(DriftEvent.id == event_id, DriftEvent.org_id == org_id)
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Drift event not found")
    return event


def _to_out(event: DriftEvent) -> DriftEventOut:
    return DriftEventOut(
        id=event.id,
        step_id=event.step_id,
        score=event.score,
        source=event.source,
        status=event.status,
        fresh_fingerprint=event.fresh_fingerprint,
        draft_text=event.draft_text,
        created_at=event.created_at,
    )


@router.post("", response_model=DriftEventOut, status_code=201)
def create_drift(
    org_id: str,
    payload: DriftCreate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    _step_in_org_or_404(db, org_id, payload.step_id)
    event = DriftEvent(
        org_id=org_id,
        step_id=payload.step_id,
        score=payload.score,
        source=payload.source,
        fresh_fingerprint=payload.fresh_fingerprint,
        draft_text=payload.draft_text,
        status="open",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.get("", response_model=list[DriftEventOut])
def list_drift(
    org_id: str,
    status: str | None = None,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[DriftEventOut]:
    query = select(DriftEvent).where(DriftEvent.org_id == org_id)
    if status is not None:
        query = query.where(DriftEvent.status == status)
    rows = db.execute(query.order_by(DriftEvent.created_at.desc())).scalars().all()
    return [_to_out(e) for e in rows]


@router.post("/{event_id}/accept", response_model=DriftEventOut)
def accept_drift(
    org_id: str,
    event_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    event = _get_event_or_404(db, org_id, event_id)
    event.status = "accepted"
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.post("/{event_id}/dismiss", response_model=DriftEventOut)
def dismiss_drift(
    org_id: str,
    event_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    event = _get_event_or_404(db, org_id, event_id)
    event.status = "dismissed"
    db.commit()
    db.refresh(event)
    return _to_out(event)
