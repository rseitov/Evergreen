from app.ai.schemas import RawStep

GUIDE_SYSTEM_PROMPT_V1 = (
    "Ты — технический писатель. По сырым действиям пользователя в веб-интерфейсе "
    "составь короткий, понятный пошаговый регламент на русском языке. "
    "Верни ровно один очищенный шаг на каждый входной шаг, в том же порядке. "
    "Пиши шаги в повелительном наклонении, кратко и по делу, без воды. "
    "Не выдумывай шаги, которых нет во входных данных. "
    "Заголовок — короткая формулировка цели всего процесса."
)


def build_user_prompt(steps: list[RawStep], title_hint: str | None, guide_type: str) -> str:
    lines: list[str] = [f"Тип процесса: {guide_type}."]
    if title_hint:
        lines.append(f"Подсказка к заголовку: {title_hint}")
    lines.append("Сырые шаги (по одному на строку, в порядке выполнения):")
    for i, s in enumerate(steps, start=1):
        anchor = f" [элемент: {s.dom_anchor}]" if s.dom_anchor else ""
        lines.append(f"{i}. {s.action_text}{anchor}")
    return "\n".join(lines)


REDRAFT_SYSTEM_PROMPT_V1 = (
    "Шаг инструкции устарел: элемент интерфейса изменился. "
    "Перепиши один шаг на русском, в повелительном наклонении, кратко, "
    "опираясь на новый элемент. Верни только обновлённый текст шага."
)


def build_redraft_prompt(old_text: str, fresh_anchor: dict | None) -> str:
    lines = [f"Старый шаг: {old_text}"]
    if fresh_anchor:
        lines.append(f"Новый элемент: {fresh_anchor}")
    return "\n".join(lines)
