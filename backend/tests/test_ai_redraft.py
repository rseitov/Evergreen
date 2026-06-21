import json
from types import SimpleNamespace

import pytest

from app.ai.client import AnthropicAIClient
from app.ai.errors import AIGenerationError
from app.ai.prompts import build_redraft_prompt


def test_build_redraft_prompt_includes_old_and_new():
    prompt = build_redraft_prompt("нажать «Сохранить»", {"role": "link", "text": "Готово"})
    assert "нажать «Сохранить»" in prompt
    assert "Готово" in prompt


def _response(*, content, stop_reason="end_turn"):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


class _FakeMessages:
    def __init__(self, response):
        self._response = response

    def create(self, **kwargs):
        return self._response


class _FakeAnthropic:
    def __init__(self, response):
        self.messages = _FakeMessages(response)


def _client(response):
    return AnthropicAIClient(_FakeAnthropic(response), model="claude-opus-4-8", max_tokens=4096)


def test_redraft_returns_text():
    payload = json.dumps({"text": "нажать «Готово»"})
    client = _client(_response(content=[SimpleNamespace(type="text", text=payload)]))
    assert client.redraft_step("нажать «Сохранить»", {"role": "link", "text": "Готово"}) == "нажать «Готово»"


def test_redraft_refusal_raises():
    client = _client(_response(content=[], stop_reason="refusal"))
    with pytest.raises(AIGenerationError):
        client.redraft_step("x", None)
