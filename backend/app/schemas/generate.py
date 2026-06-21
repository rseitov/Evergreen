from typing import Literal

from pydantic import BaseModel

from app.ai.schemas import RawStep


class GenerateGuideRequest(BaseModel):
    title_hint: str | None = None
    type: Literal["digital", "offline"]
    raw_steps: list[RawStep]
