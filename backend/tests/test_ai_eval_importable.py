import json
import pathlib


def test_eval_harness_imports_without_calling_api():
    import scripts.ai_eval as ai_eval

    assert hasattr(ai_eval, "run_eval")


def test_golden_sample_is_valid():
    path = pathlib.Path(__file__).parent.parent / "scripts" / "ai_eval_golden.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["type"] in {"digital", "offline"}
    assert len(data["raw_steps"]) >= 1
    assert all("action_text" in s for s in data["raw_steps"])
