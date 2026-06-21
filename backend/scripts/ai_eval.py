"""Manual eval harness for the AI generation pipeline.

Run with a real key:  cd backend && ANTHROPIC_API_KEY=sk-... uv run python scripts/ai_eval.py
This is NOT part of the automated test suite — it calls the real Claude API.
"""

import json
import pathlib

import anthropic

from app.ai.client import AnthropicAIClient
from app.ai.redaction import redact_pii
from app.ai.schemas import RawStep
from app.config import settings

GOLDEN = pathlib.Path(__file__).parent / "ai_eval_golden.json"


def run_eval() -> None:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    raw = [
        RawStep(
            action_text=redact_pii(s["action_text"]),
            dom_anchor=s.get("dom_anchor"),
            screenshot_url=s.get("screenshot_url"),
        )
        for s in data["raw_steps"]
    ]
    client = AnthropicAIClient(
        anthropic.Anthropic(api_key=settings.anthropic_api_key or None),
        model=settings.ai_model,
        max_tokens=settings.ai_max_tokens,
    )
    guide = client.generate_guide(raw, data.get("title_hint"), data["type"])
    print(f"TITLE: {guide.title}")
    for i, step in enumerate(guide.steps, start=1):
        print(f"  {i}. {step.text}")


if __name__ == "__main__":
    run_eval()
