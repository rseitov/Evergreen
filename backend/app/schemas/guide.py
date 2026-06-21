from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StepInput(BaseModel):
    text: str
    media_url: str | None = None
    fingerprint: dict | None = None


class StepOut(BaseModel):
    id: str
    order_index: int
    text: str
    media_url: str | None
    fingerprint: dict | None


class GuideCreate(BaseModel):
    title: str
    type: Literal["digital", "offline"]
    steps: list[StepInput]


class GuideSummary(BaseModel):
    id: str
    title: str
    type: str
    project_id: str
    current_version_id: str | None
    created_at: datetime


class GuideDetail(BaseModel):
    id: str
    title: str
    type: str
    project_id: str
    version_number: int
    current_version_id: str
    steps: list[StepOut]
    created_at: datetime


class NewVersionRequest(BaseModel):
    steps: list[StepInput]


class VersionSummary(BaseModel):
    id: str
    version_number: int
    created_by: str
    created_at: datetime
    is_current: bool
