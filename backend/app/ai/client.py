from typing import Protocol

import anthropic
from pydantic import ValidationError

from app.ai.errors import AIGenerationError
from app.ai.prompts import GUIDE_SYSTEM_PROMPT_V1, build_user_prompt
from app.ai.schemas import GeneratedGuide, RawStep
from app.config import settings


class AIClient(Protocol):
    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide: ...


class AnthropicAIClient:
    def __init__(self, client: anthropic.Anthropic, model: str, max_tokens: int):
        self._client = client
        self._model = model
        self._max_tokens = max_tokens

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        user_prompt = build_user_prompt(steps, title_hint, guide_type)
        response = self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=GUIDE_SYSTEM_PROMPT_V1,
            messages=[{"role": "user", "content": user_prompt}],
            output_config={
                "format": {"type": "json_schema", "schema": GeneratedGuide.model_json_schema()}
            },
        )
        stop_reason = getattr(response, "stop_reason", None)
        if stop_reason == "refusal":
            raise AIGenerationError("model refused the request")
        if stop_reason == "max_tokens":
            raise AIGenerationError("model response was truncated (max_tokens)")

        text = next((block.text for block in response.content if block.type == "text"), None)
        if text is None:
            raise AIGenerationError("model returned no text block")
        try:
            return GeneratedGuide.model_validate_json(text)
        except ValidationError as exc:
            raise AIGenerationError("model returned malformed output") from exc


_singleton: AnthropicAIClient | None = None


def get_ai_client() -> AIClient:
    global _singleton
    if _singleton is None:
        _singleton = AnthropicAIClient(
            anthropic.Anthropic(
                api_key=settings.anthropic_api_key or None,
                timeout=settings.ai_timeout_seconds,
                max_retries=settings.ai_max_retries,
            ),
            model=settings.ai_model,
            max_tokens=settings.ai_max_tokens,
        )
    return _singleton
