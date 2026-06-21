from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Membership, Project
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/orgs/{org_id}/projects", tags=["projects"])


def get_project_or_404(db: Session, org_id: str, project_id: str) -> Project:
    project = db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == org_id)
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    org_id: str,
    payload: ProjectCreate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> Project:
    project = Project(org_id=org_id, name=payload.name, allowlist_domains=payload.allowlist_domains)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    org_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[Project]:
    return list(
        db.execute(select(Project).where(Project.org_id == org_id)).scalars().all()
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> Project:
    return get_project_or_404(db, org_id, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    org_id: str,
    project_id: str,
    payload: ProjectUpdate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> Project:
    project = get_project_or_404(db, org_id, project_id)
    if payload.name is not None:
        project.name = payload.name
    if payload.allowlist_domains is not None:
        project.allowlist_domains = payload.allowlist_domains
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> Response:
    project = get_project_or_404(db, org_id, project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=204)
