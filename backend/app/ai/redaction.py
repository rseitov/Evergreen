import re

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Phone: optional +, then 10-15 digits possibly separated by spaces, dashes, parens.
_PHONE_RE = re.compile(r"\+?\d[\d\s\-()]{8,}\d")


def redact_pii(text: str) -> str:
    """Replace emails and phone numbers with placeholders before sending text to the model.

    Email is redacted first so an email's digits are never re-matched as a phone.
    """
    text = _EMAIL_RE.sub("[email]", text)
    text = _PHONE_RE.sub("[phone]", text)
    return text
