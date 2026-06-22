from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DriftCreate(BaseModel):
    step_id: str
    score: float
    source: Literal["passive", "flag"]
    fresh_fingerprint: dict | None = None
    draft_text: str | None = None


class DriftEventOut(BaseModel):
    id: str
    step_id: str
    score: float
    source: str
    status: str
    fresh_fingerprint: dict | None
    draft_text: str | None
    created_at: datetime


class ObserveRequest(BaseModel):
    step_id: str
    fresh_fingerprint: dict
    source: Literal["passive", "flag"] = "passive"


class ObserveResult(BaseModel):
    drift: bool
    score: float
    classification: str
    event_id: str | None


class FlagRequest(BaseModel):
    step_id: str
