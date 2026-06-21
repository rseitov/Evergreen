class AIGenerationError(Exception):
    """Raised when the model returns an unusable result (refusal, truncation,
    missing text, or malformed output). The HTTP layer maps this to a 502."""
