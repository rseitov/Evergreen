import pytest

from app.drift.scoring import classify, score_drift


def fp(role=None, text=None, selector=None, anchor=True):
    anchor_val = {"role": role, "text": text, "selector": selector} if anchor else None
    return {"dom_anchor": anchor_val, "semantics": "s", "screenshot_url": None}


def test_identical_anchors_score_zero():
    a = fp(role="button", text="Сохранить", selector="#save")
    assert score_drift(a, a) == 0.0


def test_text_change_only():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="button", text="Готово", selector="#save")
    assert score_drift(stored, fresh) == pytest.approx(0.4)


def test_role_and_selector_change():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="link", text="Сохранить", selector="#save2")
    assert score_drift(stored, fresh) == pytest.approx(0.6)


def test_all_fields_change():
    stored = fp(role="button", text="Сохранить", selector="#save")
    fresh = fp(role="link", text="Готово", selector="#save2")
    assert score_drift(stored, fresh) == pytest.approx(1.0)


def test_anchor_appeared_or_disappeared_is_max():
    present = fp(role="button", text="Сохранить", selector="#save")
    absent = fp(anchor=False)
    assert score_drift(present, absent) == 1.0
    assert score_drift(absent, present) == 1.0


def test_both_anchors_absent_is_zero():
    assert score_drift(fp(anchor=False), fp(anchor=False)) == 0.0


def test_classify_thresholds():
    assert classify(0.19) == "none"
    assert classify(0.2) == "soft"
    assert classify(0.5) == "soft"
    assert classify(0.51) == "stale"
    assert classify(1.0) == "stale"
