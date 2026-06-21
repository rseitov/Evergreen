import json
from types import SimpleNamespace

import pytest

from app.ai.client import AnthropicAIClient
from app.ai.errors import AIGenerationError
from app.ai.prompts import build_user_prompt
from app.ai.schemas import GeneratedGuide, RawStep


def test_build_user_prompt_includes_steps_and_hint():
    prompt = build_user_prompt(
        [RawStep(action_text="открыть карточку"), RawStep(action_text="нажать Сохранить")],
        title_hint="Возврат",
        guide_type="digital",
    )
    assert "открыть карточку" in prompt
    assert "нажать Сохранить" in prompt
    assert "Возврат" in prompt
    assert "digital" in prompt


def _response(*, content, stop_reason="end_turn"):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


class _FakeMessages:
    def __init__(self, response):
        self._response = response
        self.last_kwargs: dict | None = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return self._response


class _FakeAnthropic:
    def __init__(self, response):
        self.messages = _FakeMessages(response)


def _steps():
    return [RawStep(action_text="x"), RawStep(action_text="y")]


def test_anthropic_client_parses_structured_output():
    payload = json.dumps(
        {"title": "Возврат сделки", "steps": [{"text": "Открыть карточку"}, {"text": "Нажать Сохранить"}]}
    )
    fake = _FakeAnthropic(_response(content=[SimpleNamespace(type="text", text=payload)]))
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)

    result = client.generate_guide(_steps(), title_hint=None, guide_type="digital")

    assert isinstance(result, GeneratedGuide)
    assert result.title == "Возврат сделки"
    assert [s.text for s in result.steps] == ["Открыть карточку", "Нажать Сохранить"]
    assert fake.messages.last_kwargs["model"] == "claude-opus-4-8"
    assert "output_config" in fake.messages.last_kwargs


def test_refusal_raises_generation_error():
    fake = _FakeAnthropic(_response(content=[], stop_reason="refusal"))
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)
    with pytest.raises(AIGenerationError):
        client.generate_guide(_steps(), title_hint=None, guide_type="digital")


def test_max_tokens_truncation_raises_generation_error():
    payload = json.dumps({"title": "x", "steps": [{"text": "a"}]})
    fake = _FakeAnthropic(_response(content=[SimpleNamespace(type="text", text=payload)], stop_reason="max_tokens"))
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)
    with pytest.raises(AIGenerationError):
        client.generate_guide(_steps(), title_hint=None, guide_type="digital")


def test_missing_text_block_raises_generation_error():
    fake = _FakeAnthropic(_response(content=[SimpleNamespace(type="tool_use")]))
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)
    with pytest.raises(AIGenerationError):
        client.generate_guide(_steps(), title_hint=None, guide_type="digital")


def test_malformed_json_raises_generation_error():
    fake = _FakeAnthropic(_response(content=[SimpleNamespace(type="text", text="not json at all")]))
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)
    with pytest.raises(AIGenerationError):
        client.generate_guide(_steps(), title_hint=None, guide_type="digital")
