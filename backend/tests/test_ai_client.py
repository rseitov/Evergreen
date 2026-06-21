import json
from types import SimpleNamespace

from app.ai.client import AnthropicAIClient
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


class _FakeMessages:
    def __init__(self, payload: str):
        self._payload = payload
        self.last_kwargs: dict | None = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._payload)])


class _FakeAnthropic:
    def __init__(self, payload: str):
        self.messages = _FakeMessages(payload)


def test_anthropic_client_parses_structured_output():
    payload = json.dumps(
        {"title": "Возврат сделки", "steps": [{"text": "Открыть карточку"}, {"text": "Нажать Сохранить"}]}
    )
    fake = _FakeAnthropic(payload)
    client = AnthropicAIClient(fake, model="claude-opus-4-8", max_tokens=4096)

    result = client.generate_guide(
        [RawStep(action_text="x"), RawStep(action_text="y")], title_hint=None, guide_type="digital"
    )

    assert isinstance(result, GeneratedGuide)
    assert result.title == "Возврат сделки"
    assert [s.text for s in result.steps] == ["Открыть карточку", "Нажать Сохранить"]
    # the SDK was called with the configured model and an output_config schema constraint
    assert fake.messages.last_kwargs["model"] == "claude-opus-4-8"
    assert "output_config" in fake.messages.last_kwargs
