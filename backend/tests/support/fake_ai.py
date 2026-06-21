from app.ai.schemas import GeneratedGuide, RawStep


class FakeAIClient:
    """Test double for AIClient. Records received steps; returns a preset guide."""

    def __init__(self, result: GeneratedGuide | None = None, redraft_result: str = "обновлённый шаг"):
        self._result = result
        self._redraft_result = redraft_result
        self.received_steps: list[RawStep] | None = None
        self.received_title_hint: str | None = None
        self.received_guide_type: str | None = None
        self.redraft_calls: list[tuple[str, dict | None]] = []

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        self.received_steps = steps
        self.received_title_hint = title_hint
        self.received_guide_type = guide_type
        assert self._result is not None
        return self._result

    def redraft_step(self, old_text: str, fresh_anchor: dict | None) -> str:
        self.redraft_calls.append((old_text, fresh_anchor))
        return self._redraft_result


class RaisingAIClient:
    """Test double for AIClient that raises a preset exception."""

    def __init__(self, exc: Exception):
        self._exc = exc

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        raise self._exc
