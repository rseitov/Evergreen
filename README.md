# Self-Healing SOP

Инструкции, которые не протухают: записал процесс один раз — AI собирает гайд и
сам замечает, когда он устарел.

Монорепозиторий из четырёх частей:

| Папка | Что это | Стек |
|---|---|---|
| `backend/` | API + модель данных + AI-пайплайн + drift-движок | Python 3.12, FastAPI, SQLAlchemy, Postgres |
| `webapp/` | Веб-приложение (библиотека гайдов, редактор, шеринг, дашборд «Что устарело») | React, Vite, TypeScript |
| `extension/` | Браузерное расширение (запись процессов + пассивный drift-агент) | TypeScript, MV3, Vite |
| `docs/` | Дизайн продукта, планы реализации, соглашения по коду | — |

> Полный дизайн — `docs/2026-06-20-self-healing-sop-design.md`. Соглашения по
> коду — `docs/conventions/code-patterns.md`. Планы — `docs/superpowers/plans/`.

---

## Быстрый старт (Docker)

Нужен только Docker (с `docker compose`). Поднимает Postgres, бэкенд (с авто-миграцией) и веб-приложение.

```bash
# из корня репозитория
docker compose up --build
```

Когда соберётся:

- **Веб-приложение:** http://localhost:5173
- **API:** http://localhost:8077 (проверка: `curl http://localhost:8077/health` → `{"status":"ok"}`)
- **Postgres:** внутри сети compose (том `pgdata` сохраняет данные между запусками)

Остановить: `Ctrl+C`, затем `docker compose down` (добавьте `-v`, чтобы стереть данные БД).

### Переменные окружения (опционально)

| Переменная | Зачем | По умолчанию |
|---|---|---|
| `JWT_SECRET` | Подпись JWT — **обязательно сменить вне локалки** (≥32 байта) | dev-заглушка |
| `ANTHROPIC_API_KEY` | Нужен только для реальной AI-генерации гайдов | пусто |

```bash
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))") \
ANTHROPIC_API_KEY=sk-ant-... \
docker compose up --build
```

> Без `ANTHROPIC_API_KEY` работает всё, кроме эндпоинта AI-генерации
> (`POST /guides/generate`) и авто-черновиков дрейфа — они вызывают Claude.
> Гайды можно создавать вручную через веб-приложение и API.

---

## Первый сценарий в веб-приложении

1. Открой http://localhost:5173 → **Вход** → зарегистрируйся (signup создаёт
   организацию и владельца): любой email/пароль/название организации.
2. Через API создай проект и гайд (UI создания проекта — в дорожной карте; пока
   через `curl`, см. ниже), либо сгенерируй гайд расширением.
3. В **Библиотеке** открой гайд → смотри шаги и историю версий, создай
   **шеринг-ссылку** (публичная страница `/share/:token` без авторизации).
4. **Редактируй** гайд → сохранение создаёт новую версию.
5. Кнопка **«этого больше нет»** у шага → событие появляется в дашборде
   **«Что устарело»**, где его можно **Принять** (применит черновик новой
   версией) или **Отклонить**.

Минимальный сценарий через API:

```bash
API=http://localhost:8077
TOKEN=$(curl -s -X POST $API/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"me@acme.ru","password":"pw","org_name":"Acme"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
ORG=$(curl -s $API/auth/me -H "Authorization: Bearer $TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["memberships"][0]["org_id"])')
PID=$(curl -s -X POST $API/orgs/$ORG/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Поддержка","allowlist_domains":["crm.acme.ru"]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST $API/orgs/$ORG/projects/$PID/guides -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Возврат сделки","type":"digital","steps":[{"text":"Открыть карточку сделки","url":"https://crm.acme.ru/deals/1"},{"text":"Нажать Сохранить"}]}'
```

Интерактивная документация API (Swagger): http://localhost:8077/docs

---

## Браузерное расширение

Расширение не контейнеризуется — оно загружается в Chrome распакованным.

```bash
cd extension
npm install
npm run build      # собирает в extension/dist
```

Затем в Chrome:

1. `chrome://extensions` → включи **Developer mode**.
2. **Load unpacked** → выбери `extension/dist`.
3. Открой попап расширения → войди (тот же логин, что и в веб-приложении;
   API по умолчанию `http://localhost:8077`), выбери проект.
4. **Запись:** нажми «Начать запись», выполни процесс на сайте, «Остановить» —
   AI соберёт гайд из записанных шагов.
5. **Пассивный drift-агент:** на доменах из allowlist проекта расширение при
   загрузке страницы само пере-снимает отпечатки задокументированных шагов и
   сообщает бэкенду о расхождениях — они появляются в «Что устарело».

> Приватность (152-ФЗ): drift-агент шлёт на сервер только URL страницы; DOM
> читается только для уже задокументированных шагов на разрешённых доменах.

---

## Локальная разработка (без Docker)

### Backend

```bash
cd backend
uv sync                                  # установка зависимостей (нужен uv)
# Postgres на :5434 (см. docs); или SQLite по умолчанию для быстрого старта
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5434/selfhealing uv run alembic upgrade head
DATABASE_URL=... JWT_SECRET=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))") \
  uv run uvicorn app.main:app --port 8077
uv run pytest                            # тесты (in-memory SQLite, БД не нужна)
```

### Web app

```bash
cd webapp
npm install
npm run dev        # http://localhost:5173, ждёт бэкенд на :8077
npm test           # Vitest + Testing Library (headless)
```

### Extension

```bash
cd extension
npm install
npm test           # Vitest
npm run build      # extension/dist для загрузки в Chrome
```

---

## Архитектура и петли анти-устаревания

- **Генерация:** расширение записывает сырые шаги → бэкенд замазывает ПДн →
  Claude собирает чистый русский гайд → версия 1.
- **Версионность first-class:** любое редактирование = новая иммутабельная
  версия (история = аудит регламента).
- **Петля A (пассивный дрейф):** расширение на allowlist-доменах пере-снимает
  отпечатки → бэкенд считает drift-score (пороги `<0.2` / `0.2–0.5` / `>0.5`) →
  при «устарел» делает AI-черновик → дашборд «Что устарело».
- **Петля C (флаг потребителя):** кнопка «этого больше нет» у шага.
- **Применение:** «Принять» в дашборде создаёт новую версию с обновлённым шагом.

---

## Структура

```
backend/    FastAPI app (app/), Alembic (alembic/), tests/, Dockerfile
webapp/     React+Vite SPA (src/), tests/, Dockerfile + nginx.conf
extension/  MV3 extension (src/), tests/
docs/       дизайн, планы, соглашения
docker-compose.yml   Postgres + backend + web
```
