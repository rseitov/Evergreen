from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    allowlist_domains: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    allowlist_domains: list[str] | None = None


class ProjectOut(BaseModel):
    id: str
    org_id: str
    name: str
    allowlist_domains: list[str]
    created_at: datetime
