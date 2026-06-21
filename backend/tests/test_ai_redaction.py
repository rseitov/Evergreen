from app.ai.redaction import redact_pii


def test_redacts_email():
    assert redact_pii("пишите на ivan@acme.ru сегодня") == "пишите на [email] сегодня"


def test_redacts_phone():
    assert redact_pii("звоните +7 999 123-45-67 утром") == "звоните [phone] утром"
    assert redact_pii("тел 8(999)1234567") == "тел [phone]"


def test_leaves_plain_text_untouched():
    assert redact_pii("нажать кнопку Сохранить в карточке") == "нажать кнопку Сохранить в карточке"


def test_redacts_multiple_in_one_string():
    out = redact_pii("a@b.ru и +79991234567")
    assert "[email]" in out and "[phone]" in out
    assert "@" not in out
