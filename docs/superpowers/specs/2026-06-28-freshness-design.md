# Freshness Score & Dashboard — Design (v1)

**Дата:** 2026-06-28
**Статус:** дизайн согласован (брейншторм завершён, план реализации ещё не написан)
**Автор:** Renat + Claude

> Бизнес-фича поверх существующего продукта Self-Healing SOP (Планы 1–8). Делает
> анти-устаревание **измеримым и видимым**: команда видит, какой процент
> регламентов актуален и что требует ревью. Это и есть «момент апгрейда» из §7
> дизайна продукта.

---

## 1. Краткая суть

Каждый гайд получает **статус свежести** (`fresh` / `needs_review`), организация
— **ролл-ап** («87% регламентов актуальны, 12 требуют ревью») на отдельной
странице «Свежесть». Гайд требует ревью, если **сместился** (есть открытый
DriftEvent) **или просрочен** (давно не подтверждали актуальность). Владелец
может в один клик **«Подтвердить актуальность»**. Готовится сводка-дайджест для
будущей рассылки (доставка — отдельный план).

**Зачем:** превратить невидимую пользу анти-устаревания в число, которое видит
руководитель и за которое платит (тариф Team, §7). Покрывает и offline-гайды
(ревью по времени), где машинного drift-сигнала нет.

---

## 2. Решения (зафиксированы в брейншторме)

- **Сигнал несвежести:** дрейф **И** ревью-по-времени (два независимых триггера).
- **Дайджест:** in-app сейчас (данные + summary-эндпоинт), реальная доставка
  email/Telegram — **отдельный план**.
- **Подход:** лёгкая модель — `reviewed_at` на гайде + интервал на проекте,
  статус свежести вычисляется на чтении (не материализуется). Переиспользует
  существующий `DriftEvent`.

---

## 3. Модель данных (изменения)

Две новые колонки (одна Alembic-миграция, down_revision = текущий head
`9a1c7e2b4d10`):

- `Guide.reviewed_at: datetime` (NOT NULL) — когда гайд последний раз
  подтвердили актуальным или обновили.
  - При создании гайда = `utcnow()` (новый гайд свеж).
  - Существующие строки в миграции: `reviewed_at = created_at`.
  - Выставляется в `now` при: создании новой версии (`_create_version`),
    явном подтверждении актуальности (`/confirm`).
- `Project.review_interval_days: int` (NOT NULL, default `90`) — цикл ревью
  проекта. Существующие строки: `90`.

`reviewed_at` отдаётся в `GuideDetail` и `GuideSummary` (аддитивно).

> Принятие дрейфа (`accept_drift`) уже создаёт новую версию через
> `_create_version`, поэтому `reviewed_at` обновится автоматически. Отклонение
> (`dismiss`) и подтверждение — разные действия: подтверждение сбрасывает таймер
> времени, но **не** скрывает открытый дрейф.

---

## 4. Вычисление свежести (чистая функция)

Модуль `app/freshness/scoring.py`, чистые тестируемые функции:

```
guide_status(open_drift_count: int, days_since_review: int, interval_days: int)
    -> tuple[str, list[str]]
```

- reason `"drift"` если `open_drift_count > 0`.
- reason `"overdue"` если `days_since_review > interval_days`.
- `status = "needs_review"` если есть хотя бы одна причина, иначе `"fresh"`.
- Возвращает `(status, reasons)` — `reasons` ⊆ `["drift", "overdue"]`.

Граничные правила (для тестов): `days_since_review == interval_days` → НЕ overdue
(строго больше); `open_drift_count == 0` и в срок → `fresh` с пустыми reasons.

«Открытый дрейф гайда» = число `DriftEvent` со `status="open"`, чьи шаги
принадлежат **текущей версии** гайда (join Step→DriftEvent по `step_id`, фильтр
`Step.version_id == Guide.current_version_id`).

---

## 5. Backend-эндпоинты

Все под существующей мультитенантной изоляцией (`org_id` из пути, проверка
membership; SQLAlchemy 2.0; cross-org → 404).

1. **`GET /orgs/{org_id}/freshness`** (любой участник) → ролл-ап организации:
   ```json
   {
     "total": 14, "fresh": 11, "needs_review": 3, "percent_current": 79,
     "guides": [
       {"guide_id": "...", "title": "...", "project_id": "...",
        "status": "needs_review", "reasons": ["drift"],
        "open_drift_count": 2, "days_since_review": 5}
     ]
   }
   ```
   `percent_current = round(fresh / total * 100)` (0 если `total == 0`).
   Для каждого гайда берётся `review_interval_days` его проекта.

2. **`POST /orgs/{org_id}/guides/{guide_id}/confirm`** (editor+) → выставляет
   `reviewed_at = now`, возвращает свежесть гайда:
   `{guide_id, status, reasons, open_drift_count, days_since_review}`.
   404 если гайд не в орг.

3. **`GET /orgs/{org_id}/freshness/digest?since_days=7`** (любой участник) →
   сводка для будущей рассылки (доставка отложена):
   ```json
   {
     "since_days": 7,
     "drift_opened": [{"guide_id","title","step_id","score","created_at"}],
     "overdue_guides": [{"guide_id","title","days_since_review"}]
   }
   ```
   `drift_opened` — DriftEvent со `status="open"`, `created_at >= now - since_days`,
   в орг. `overdue_guides` — гайды орг, у которых `days_since_review > interval`.

Схемы (Pydantic v2) в `app/schemas/freshness.py`:
`GuideFreshness`, `FreshnessRollup`, `DigestItem`, `OverdueItem`, `FreshnessDigest`.

---

## 6. Web (React)

`ApiClient` получает: `getFreshness(token, orgId)`, `confirmGuide(token, orgId, guideId)`,
`getDigest(token, orgId, sinceDays?)`. Типы в `types.ts`.

- **GuidePage:** под заголовком — чип свежести:
  - `fresh` → «Свежий» (зелёный).
  - `needs_review` → «Требует ревью» + причины («сместился» / «просрочен»)
    (rust). Кнопка **«Подтвердить актуальность»** → `confirmGuide` → обновляет чип.
- **Новая страница «Свежесть»** (`/freshness`, пункт сайдбара между «Библиотека»
  и «Что устарело»): крупный `percent_current` + счётчики
  (`fresh` / `needs_review`), затем список гайдов, требующих ревью, с бейджами
  причин и ссылкой на каждый (`/guides/:id`). Пустое состояние: «Все регламенты
  актуальны.»

Стиль — существующая дизайн-система (моно-чипы, рампа свежести зелёный→rust).

---

## 7. Тестирование

- `guide_status` — юнит-тесты: только дрейф; только просрочен; оба; свеж;
  граница `days == interval`.
- Эндпоинты — endpoint-тесты (без AI): ролл-ап считает статусы и %; confirm
  сбрасывает таймер (просроченный → fresh, но с открытым дрейфом остаётся
  needs_review); digest на окне; cross-org → 404; org-изоляция.
- Web — RTL с мок-`ApiClient`: чип и confirm на GuidePage; страница «Свежесть»
  рендерит % и список; пустое состояние.

---

## 8. Что НЕ делаем в v1 (YAGNI)

- ❌ Реальная доставка дайджеста (email/Telegram) и планировщик — отдельный план.
- ❌ Непрерывный %-скор по гайду (только статус + причины).
- ❌ Per-guide интервал ревью (только per-project).
- ❌ Материализованный статус-столбец / таблица аудита ревью.
- ❌ Уведомления в реальном времени.

**Граница MVP одной фразой:** `reviewed_at` + интервал проекта, чистая функция
свежести, три эндпоинта (ролл-ап / подтвердить / дайджест-сводка), чип+кнопка на
гайде и страница «Свежесть».

---

## 9. Следующий шаг

Написать план реализации (skill `writing-plans`): миграция+модель → функция
свежести → эндпоинты → web. Технический порядок задач — в плане.
