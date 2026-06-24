from pydantic import BaseModel


class RawStep(BaseModel):
    action_text: str
    dom_anchor: dict | None = None
    screenshot_url: str | None = None
    url: str | None = None


class GeneratedStep(BaseModel):
    text: str


class GeneratedGuide(BaseModel):
    title: str
    steps: list[GeneratedStep]


class RedraftedStep(BaseModel):
    text: str
