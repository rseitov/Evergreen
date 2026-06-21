# Starting weights/thresholds per design §5.1 — calibrated on real data later.
_FIELD_WEIGHTS = {"role": 0.3, "text": 0.4, "selector": 0.3}


def score_drift(stored: dict | None, fresh: dict | None) -> float:
    """Weighted delta between two step fingerprints' dom_anchor sub-dicts, in [0,1]."""
    stored_anchor = (stored or {}).get("dom_anchor")
    fresh_anchor = (fresh or {}).get("dom_anchor")

    if stored_anchor is None and fresh_anchor is None:
        return 0.0
    if stored_anchor is None or fresh_anchor is None:
        return 1.0

    score = 0.0
    for field, weight in _FIELD_WEIGHTS.items():
        if stored_anchor.get(field) != fresh_anchor.get(field):
            score += weight
    return min(score, 1.0)


def classify(score: float) -> str:
    if score < 0.2:
        return "none"
    if score <= 0.5:
        return "soft"
    return "stale"
