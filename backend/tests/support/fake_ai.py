from app.ai.schemas import GeneratedGuide, RawStep


class FakeAIClient:
    """Test double for AIClient. Records received steps; returns a preset guide."""

    def __init__(self, result: GeneratedGuide):
        self._result = result
        self.received_steps: list[RawStep] | None = None
        self.received_title_hint: str | None = None
        self.received_guide_type: str | None = None

    def generate_guide(
        self, steps: list[RawStep], title_hint: str | None, guide_type: str
    ) -> GeneratedGuide:
        self.received_steps = steps
        self.received_title_hint = title_hint
        self.received_guide_type = guide_type
        return self._result
