from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.ai.client import AIClient, get_ai_client
from app.ai.errors import AIGenerationError
from app.ai.redaction import redact_pii
from app.ai.schemas import RawStep
from app.db import get_db
from app.deps import require_role
from app.models import Guide, Membership
from app.routers.guides import _create_version, build_guide_detail
from app.routers.projects import get_project_or_404
from app.schemas.generate import GenerateGuideRequest
from app.schemas.guide import GuideDetail, StepInput

router = APIRouter(prefix="/orgs/{org_id}", tags=["generate"])


def _build_fingerprint(raw: RawStep, generated_text: str) -> dict:
    return {
        "dom_anchor": raw.dom_anchor,
        "semantics": generated_text,
        "screenshot_url": raw.screenshot_url,
    }


@router.post(
    "/projects/{project_id}/guides/generate", response_model=GuideDetail, status_code=201
)
def generate_guide(
    org_id: str,
    project_id: str,
    payload: GenerateGuideRequest,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
    ai: AIClient = Depends(get_ai_client),
) -> GuideDetail:
    get_project_or_404(db, org_id, project_id)

    redacted = [
        RawStep(
            action_text=redact_pii(s.action_text),
            dom_anchor=s.dom_anchor,
            screenshot_url=s.screenshot_url,
        )
        for s in payload.raw_steps
    ]

    try:
        generated = ai.generate_guide(redacted, payload.title_hint, payload.type)
    except AIGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if len(generated.steps) != len(redacted):
        raise HTTPException(status_code=502, detail="AI returned a mismatched step count")

    guide = Guide(org_id=org_id, project_id=project_id, title=generated.title, type=payload.type)
    db.add(guide)
    db.flush()

    steps = [
        StepInput(
            text=g.text,
            media_url=r.screenshot_url,
            fingerprint=_build_fingerprint(r, g.text),
        )
        for g, r in zip(generated.steps, redacted)
    ]
    _create_version(db, guide, steps, membership.user_id, version_number=1)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)
