from app.ai.schemas import GeneratedGuide, GeneratedStep, RawStep


def test_raw_step_defaults():
    s = RawStep(action_text="нажать Сохранить")
    assert s.action_text == "нажать Сохранить"
    assert s.dom_anchor is None
    assert s.screenshot_url is None


def test_generated_guide_round_trip():
    guide = GeneratedGuide.model_validate(
        {"title": "Возврат сделки", "steps": [{"text": "Открыть карточку"}, {"text": "Нажать Сохранить"}]}
    )
    assert guide.title == "Возврат сделки"
    assert [s.text for s in guide.steps] == ["Открыть карточку", "Нажать Сохранить"]
    assert isinstance(guide.steps[0], GeneratedStep)
