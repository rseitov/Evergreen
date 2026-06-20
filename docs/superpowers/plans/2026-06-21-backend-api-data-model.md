# Backend API + Data Model Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-tenant Backend API and data model for the Self-Healing SOP product — organizations, users/roles, projects, guides with immutable versions and steps, share links, and the DriftEvent data layer that Plan 5 (drift engine) will drive.

**Architecture:** A FastAPI application backed by SQLAlchemy 2.0 (synchronous). All tenant-scoped data is isolated by `org_id`, enforced by request dependencies that resolve the caller's membership before any query runs. Guides are versioned first-class: editing a guide creates a new immutable `GuideVersion` snapshot rather than mutating steps in place. The AI pipeline (Plan 2), browser extension (Plan 3), web-app (Plan 4), and drift engine (Plan 5) are all clients of this API.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (sync), Alembic, PostgreSQL (prod) / SQLite (tests), Pydantic v2 + pydantic-settings, PyJWT, passlib[bcrypt], pytest + Starlette TestClient, uv (dependency/venv manager).

## Global Constraints

- Python version floor: **3.12**.
- All persisted IDs are **UUID4 hex strings** (`str`, length 32), generated in Python — never DB-native UUID/serial — so the same models run on PostgreSQL and SQLite unchanged.
- All JSON-shaped columns (`allowlist_domains`, `fingerprint`, `fresh_fingerprint`) use SQLAlchemy's portable `JSON` type, never PostgreSQL-only `JSONB`.
- Every tenant-scoped query MUST filter by `org_id` taken from the request path and validated against the caller's membership. No endpoint trusts an `org_id` from the request body.
- Role hierarchy is fixed: `viewer` < `editor` < `owner`. Rank map: `{"viewer": 0, "editor": 1, "owner": 2}`.
- `GuideVersion` and its `Step` rows are **immutable** after creation. "Editing" a guide always creates a new version; existing versions are never mutated.
- All timestamps are timezone-naive UTC via `datetime.utcnow`.
- User-facing API error messages are in English (internal API); product copy localization is out of scope for the backend.
- Dependency management is **uv**; run commands with `uv run ...`.

---

## File Structure

```
backend/
  pyproject.toml              # project metadata + deps (uv)
  alembic.ini                 # alembic config (points at app metadata)
  .env.example                # documented env vars
  app/
    __init__.py
    main.py                   # FastAPI app + router registration
    config.py                 # Settings (pydantic-settings)
    db.py                     # engine, SessionLocal, Base, get_db
    security.py               # password hashing + JWT encode/decode
    deps.py                   # auth/membership/role dependencies
    roles.py                  # ROLE_RANK + role helpers
    models/
      __init__.py             # imports all models so metadata is complete
      organization.py
      user.py
      membership.py
      project.py
      guide.py
      guide_version.py
      step.py
      drift_event.py
      share_link.py
    schemas/
      __init__.py
      auth.py
      member.py
      project.py
      guide.py
      drift.py
      share.py
    routers/
      __init__.py
      auth.py
      members.py
      projects.py
      guides.py
      share.py
      drift.py
  alembic/
    env.py
    versions/                 # generated migration files live here
  tests/
    __init__.py
    conftest.py               # app + db fixtures, auth helpers
    test_health.py
    test_auth.py
    test_members.py
    test_projects.py
    test_guides.py
    test_versions.py
    test_share.py
    test_drift.py
    test_isolation.py
```

Each file has one responsibility: models hold persistence, schemas hold request/response shapes, routers hold HTTP + business rules, `deps.py` holds cross-cutting access control. Tests mirror routers one-to-one, plus a dedicated cross-tenant isolation suite.

---

### Task 1: Project scaffolding, config, DB session, health endpoint

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `app.config.Settings` with fields `database_url: str`, `jwt_secret: str`, `jwt_algorithm: str = "HS256"`, `access_token_ttl_minutes: int = 1440`; module-level `settings = Settings()`.
  - `app.db.Base` (DeclarativeBase), `app.db.engine`, `app.db.SessionLocal`, `app.db.get_db() -> Iterator[Session]`.
  - `app.main.app` (FastAPI instance) with `GET /health -> {"status": "ok"}`.
  - `tests/conftest.py` fixtures: `db_session` (function-scoped SQLite session) and `client` (TestClient with `get_db` overridden to use the test session).

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "selfhealing-backend"
version = "0.1.0"
description = "Self-Healing SOP backend API"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "psycopg[binary]>=3.1",
    "pydantic>=2.7",
    "pydantic-settings>=2.3",
    "pyjwt>=2.8",
    "passlib[bcrypt]>=1.7",
    "python-multipart>=0.0.9",
]

[dependency-groups]
dev = [
    "pytest>=8.2",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"
```

- [ ] **Step 2: Create `backend/.env.example`**

```bash
# Production uses PostgreSQL, e.g.:
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/selfhealing
# Secret for signing JWTs. Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
JWT_SECRET=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_TTL_MINUTES=1440
```

- [ ] **Step 3: Create `backend/app/__init__.py` (empty) and `backend/app/config.py`**

`backend/app/__init__.py`: empty file.

`backend/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 1440


settings = Settings()
```

- [ ] **Step 4: Create `backend/app/db.py`**

```python
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite needs check_same_thread=False for the TestClient; Postgres ignores it.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 5: Create `backend/app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="Self-Healing SOP API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/tests/__init__.py` (empty) and `backend/tests/conftest.py`**

`backend/tests/__init__.py`: empty file.

`backend/tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
import app.models  # noqa: F401  ensures all models are registered on Base.metadata


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

> Note: `import app.models` will fail until Task 2 creates that package. Create a temporary empty `backend/app/models/__init__.py` now so this task's test runs; Task 2 fills it in.

Create `backend/app/models/__init__.py` as an empty file for now.

- [ ] **Step 7: Write the failing test — `backend/tests/test_health.py`**

```python
def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: PASS (1 passed). If `uv` is not initialized, run `uv sync` first.

- [ ] **Step 9: Commit**

```bash
cd backend
git add pyproject.toml .env.example app/ tests/
git commit -m "feat(backend): scaffold FastAPI app, config, db session, health endpoint"
```

---

### Task 2: Core tenant models — Organization, User, Membership + Alembic

**Files:**
- Create: `backend/app/models/organization.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/membership.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.db.Base`.
- Produces:
  - `Organization(id, name, created_at)`.
  - `User(id, email, password_hash, created_at)` with unique `email`.
  - `Membership(id, org_id, user_id, role, created_at)` with unique `(org_id, user_id)`; `role` is one of `"owner" | "editor" | "viewer"`.
  - A reusable `new_id() -> str` helper and `utcnow()` helper in `app/models/_base.py`.

- [ ] **Step 1: Create `backend/app/models/_base.py`**

```python
import uuid
from datetime import datetime


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.utcnow()
```

- [ ] **Step 2: Create `backend/app/models/organization.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 3: Create `backend/app/models/user.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 4: Create `backend/app/models/membership.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_membership_org_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # owner | editor | viewer
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 5: Replace `backend/app/models/__init__.py`**

```python
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership

__all__ = ["Organization", "User", "Membership"]
```

- [ ] **Step 6: Create `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql+psycopg://postgres:postgres@localhost:5432/selfhealing

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

- [ ] **Step 7: Create `backend/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.db import Base
import app.models  # noqa: F401  register all models on Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 8: Write the failing test — `backend/tests/test_models.py`**

```python
from sqlalchemy import select

from app.models import Membership, Organization, User


def test_can_persist_org_user_membership(db_session):
    org = Organization(name="Acme")
    user = User(email="a@example.com", password_hash="x")
    db_session.add_all([org, user])
    db_session.flush()

    member = Membership(org_id=org.id, user_id=user.id, role="owner")
    db_session.add(member)
    db_session.flush()

    loaded = db_session.execute(select(Membership)).scalar_one()
    assert loaded.role == "owner"
    assert loaded.org_id == org.id
    assert loaded.user_id == user.id
    assert len(org.id) == 32
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: PASS (1 passed).

- [ ] **Step 10: Generate the initial migration (against a running Postgres)**

Run: `cd backend && uv run alembic revision --autogenerate -m "core tenant tables"`
Expected: a new file under `alembic/versions/` creating `organizations`, `users`, `memberships`. (Requires a reachable Postgres at `DATABASE_URL`; if unavailable locally, generate this during deployment setup — tests use SQLite `create_all` and do not depend on Alembic.)

- [ ] **Step 11: Commit**

```bash
cd backend
git add app/models/ alembic.ini alembic/ tests/test_models.py
git commit -m "feat(backend): add Organization, User, Membership models and Alembic setup"
```

---

### Task 3: Security primitives — password hashing and JWT

**Files:**
- Create: `backend/app/security.py`
- Create: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `app.config.settings`.
- Produces:
  - `hash_password(plain: str) -> str`
  - `verify_password(plain: str, hashed: str) -> bool`
  - `create_access_token(user_id: str) -> str`
  - `decode_access_token(token: str) -> str | None` (returns the user id, or `None` if invalid/expired).

- [ ] **Step 1: Write the failing test — `backend/tests/test_security.py`**

```python
from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_round_trip():
    hashed = hash_password("hunter2")
    assert hashed != "hunter2"
    assert verify_password("hunter2", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_token_round_trip():
    token = create_access_token("user-123")
    assert decode_access_token(token) == "user-123"


def test_token_invalid_returns_none():
    assert decode_access_token("not-a-token") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_security.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.security'`.

- [ ] **Step 3: Create `backend/app/security.py`**

```python
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_security.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/security.py tests/test_security.py
git commit -m "feat(backend): add password hashing and JWT helpers"
```

---

### Task 4: Roles helper + access-control dependencies

**Files:**
- Create: `backend/app/roles.py`
- Create: `backend/app/deps.py`
- Create: `backend/tests/test_roles.py`

**Interfaces:**
- Consumes: `app.db.get_db`, `app.security.decode_access_token`, `app.models.{User, Membership}`.
- Produces:
  - `app.roles.ROLE_RANK: dict[str, int]` and `app.roles.role_satisfies(have: str, need: str) -> bool`.
  - `app.deps.get_current_user(...) -> User` (FastAPI dependency; 401 on missing/invalid bearer token).
  - `app.deps.get_membership(org_id, ...) -> Membership` (404 if the current user is not a member of `org_id`).
  - `app.deps.require_role(min_role: str)` — returns a dependency that yields the caller's `Membership` and raises 403 if its role rank is below `min_role`.

- [ ] **Step 1: Write the failing test — `backend/tests/test_roles.py`**

```python
from app.roles import ROLE_RANK, role_satisfies


def test_role_rank_order():
    assert ROLE_RANK["viewer"] < ROLE_RANK["editor"] < ROLE_RANK["owner"]


def test_role_satisfies():
    assert role_satisfies("owner", "editor") is True
    assert role_satisfies("editor", "editor") is True
    assert role_satisfies("viewer", "editor") is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_roles.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.roles'`.

- [ ] **Step 3: Create `backend/app/roles.py`**

```python
ROLE_RANK: dict[str, int] = {"viewer": 0, "editor": 1, "owner": 2}


def role_satisfies(have: str, need: str) -> bool:
    return ROLE_RANK.get(have, -1) >= ROLE_RANK[need]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_roles.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Create `backend/app/deps.py`**

```python
from fastapi import Depends, Header, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Membership, User
from app.roles import role_satisfies
from app.security import decode_access_token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_membership(
    org_id: str = Path(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Membership:
    membership = db.execute(
        select(Membership).where(
            Membership.org_id == org_id, Membership.user_id == user.id
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return membership


def require_role(min_role: str):
    def checker(membership: Membership = Depends(get_membership)) -> Membership:
        if not role_satisfies(membership.role, min_role):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return membership

    return checker
```

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/roles.py app/deps.py tests/test_roles.py
git commit -m "feat(backend): add role helper and auth/membership/role dependencies"
```

---

### Task 5: Auth endpoints — signup, login, me

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `app.security.*`, `app.deps.get_current_user`, `app.models.*`, `app.db.get_db`.
- Produces:
  - `POST /auth/signup` body `{email, password, org_name}` → 201 `{access_token, org_id, user_id}`; creates Organization + User + owner Membership atomically. 409 if email already exists.
  - `POST /auth/login` body `{email, password}` → 200 `{access_token, user_id}`; 401 on bad credentials.
  - `GET /auth/me` (bearer) → 200 `{user_id, email, memberships: [{org_id, role}]}`.
  - Schemas: `SignupRequest`, `LoginRequest`, `TokenResponse`, `MeResponse`, `MembershipOut`.

- [ ] **Step 1: Create `backend/app/schemas/__init__.py` (empty) and `backend/app/schemas/auth.py`**

`backend/app/schemas/__init__.py`: empty file.

`backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    org_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    user_id: str
    org_id: str | None = None


class MembershipOut(BaseModel):
    org_id: str
    role: str


class MeResponse(BaseModel):
    user_id: str
    email: str
    memberships: list[MembershipOut]
```

> `EmailStr` requires the `email-validator` package. Add `"email-validator>=2.1"` to `dependencies` in `pyproject.toml`, then run `uv sync`.

- [ ] **Step 2: Write the failing test — `backend/tests/test_auth.py`**

```python
def test_signup_then_login_then_me(client):
    resp = client.post(
        "/auth/signup",
        json={"email": "owner@acme.com", "password": "pw", "org_name": "Acme"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["org_id"]

    dup = client.post(
        "/auth/signup",
        json={"email": "owner@acme.com", "password": "pw", "org_name": "Acme2"},
    )
    assert dup.status_code == 409

    login = client.post("/auth/login", json={"email": "owner@acme.com", "password": "pw"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    bad = client.post("/auth/login", json={"email": "owner@acme.com", "password": "nope"})
    assert bad.status_code == 401

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    me_body = me.json()
    assert me_body["email"] == "owner@acme.com"
    assert me_body["memberships"][0]["role"] == "owner"


def test_me_requires_auth(client):
    assert client.get("/auth/me").status_code == 401
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth.py -v`
Expected: FAIL with 404 (routes not registered yet).

- [ ] **Step 4: Create `backend/app/routers/__init__.py` (empty) and `backend/app/routers/auth.py`**

`backend/app/routers/__init__.py`: empty file.

`backend/app/routers/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Membership, Organization, User
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    MembershipOut,
    SignupRequest,
    TokenResponse,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    org = Organization(name=payload.org_name)
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add_all([org, user])
    db.flush()
    db.add(Membership(org_id=org.id, user_id=user.id, role="owner"))
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id), user_id=user.id, org_id=org.id
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id), user_id=user.id)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    rows = db.execute(select(Membership).where(Membership.user_id == user.id)).scalars().all()
    return MeResponse(
        user_id=user.id,
        email=user.email,
        memberships=[MembershipOut(org_id=m.org_id, role=m.role) for m in rows],
    )
```

- [ ] **Step 5: Register the router — modify `backend/app/main.py`**

```python
from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_auth.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/schemas/ app/routers/ app/main.py tests/test_auth.py pyproject.toml
git commit -m "feat(backend): add signup/login/me auth endpoints"
```

---

### Task 6: Member management — add member by email

**Files:**
- Create: `backend/app/schemas/member.py`
- Create: `backend/app/routers/members.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_members.py`

**Interfaces:**
- Consumes: `app.deps.{require_role, get_membership}`, `app.models.*`, `app.db.get_db`.
- Produces:
  - `POST /orgs/{org_id}/members` (owner only) body `{email, role}` → 201 `{user_id, org_id, role}`. The target user must already exist (created via signup elsewhere); 404 if not. 409 if already a member. `role` must be one of `viewer|editor|owner`.
  - `GET /orgs/{org_id}/members` (any member) → 200 `[{user_id, email, role}]`.
  - Schemas: `AddMemberRequest`, `MemberOut`.

- [ ] **Step 1: Create `backend/app/schemas/member.py`**

```python
from typing import Literal

from pydantic import BaseModel, EmailStr


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Literal["viewer", "editor", "owner"]


class MemberOut(BaseModel):
    user_id: str
    email: str
    role: str
```

- [ ] **Step 2: Write the failing test — `backend/tests/test_members.py`**

```python
def _signup(client, email, org="Acme"):
    r = client.post("/auth/signup", json={"email": email, "password": "pw", "org_name": org})
    return r.json()


def test_owner_can_add_existing_user_as_member(client):
    owner = _signup(client, "owner@acme.com")
    # second user signs up (creates their own org but exists as a user)
    _signup(client, "ops@acme.com", org="Temp")

    org_id = owner["org_id"]
    h = {"Authorization": f"Bearer {owner['access_token']}"}

    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "ops@acme.com", "role": "editor"}, headers=h
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "editor"

    listing = client.get(f"/orgs/{org_id}/members", headers=h)
    emails = {m["email"] for m in listing.json()}
    assert {"owner@acme.com", "ops@acme.com"} <= emails


def test_add_unknown_user_returns_404(client):
    owner = _signup(client, "owner@acme.com")
    org_id = owner["org_id"]
    h = {"Authorization": f"Bearer {owner['access_token']}"}
    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "ghost@acme.com", "role": "viewer"}, headers=h
    )
    assert resp.status_code == 404


def test_editor_cannot_add_members(client):
    owner = _signup(client, "owner@acme.com")
    _signup(client, "ed@acme.com", org="Temp")
    org_id = owner["org_id"]
    oh = {"Authorization": f"Bearer {owner['access_token']}"}
    client.post(f"/orgs/{org_id}/members", json={"email": "ed@acme.com", "role": "editor"}, headers=oh)

    ed_login = client.post("/auth/login", json={"email": "ed@acme.com", "password": "pw"}).json()
    eh = {"Authorization": f"Bearer {ed_login['access_token']}"}
    resp = client.post(
        f"/orgs/{org_id}/members", json={"email": "owner@acme.com", "role": "viewer"}, headers=eh
    )
    assert resp.status_code == 403
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_members.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 4: Create `backend/app/routers/members.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Membership, User
from app.schemas.member import AddMemberRequest, MemberOut

router = APIRouter(prefix="/orgs/{org_id}/members", tags=["members"])


@router.post("", response_model=MemberOut, status_code=201)
def add_member(
    org_id: str,
    payload: AddMemberRequest,
    _owner: Membership = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> MemberOut:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    exists = db.execute(
        select(Membership).where(Membership.org_id == org_id, Membership.user_id == user.id)
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Already a member")
    member = Membership(org_id=org_id, user_id=user.id, role=payload.role)
    db.add(member)
    db.commit()
    return MemberOut(user_id=user.id, email=user.email, role=member.role)


@router.get("", response_model=list[MemberOut])
def list_members(
    org_id: str,
    _member: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    rows = db.execute(
        select(Membership, User).join(User, User.id == Membership.user_id).where(
            Membership.org_id == org_id
        )
    ).all()
    return [MemberOut(user_id=u.id, email=u.email, role=m.role) for m, u in rows]
```

- [ ] **Step 5: Register the router — modify `backend/app/main.py`**

Change the imports and registration block to:

```python
from app.routers import auth, members

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_members.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/schemas/member.py app/routers/members.py app/main.py tests/test_members.py
git commit -m "feat(backend): add member management endpoints"
```

---

### Task 7: Project model + CRUD with allowlist domains

**Files:**
- Create: `backend/app/models/project.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/routers/projects.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_projects.py`

**Interfaces:**
- Consumes: `app.deps.*`, `app.db.get_db`, `app.models.*`.
- Produces:
  - `Project(id, org_id, name, allowlist_domains: list[str], created_at)`.
  - `POST /orgs/{org_id}/projects` (editor+) body `{name, allowlist_domains}` → 201 `ProjectOut`.
  - `GET /orgs/{org_id}/projects` (any member) → `[ProjectOut]`.
  - `GET /orgs/{org_id}/projects/{project_id}` (any member) → `ProjectOut` (404 if not in org).
  - `PATCH /orgs/{org_id}/projects/{project_id}` (editor+) body `{name?, allowlist_domains?}` → `ProjectOut`.
  - `DELETE /orgs/{org_id}/projects/{project_id}` (owner) → 204.
  - Schemas: `ProjectCreate`, `ProjectUpdate`, `ProjectOut`.
  - Helper `get_project_or_404(db, org_id, project_id) -> Project` defined in `app/routers/projects.py` for reuse by Task 8.

- [ ] **Step 1: Create `backend/app/models/project.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base
from app.models._base import new_id, utcnow


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    allowlist_domains: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 2: Register the model — modify `backend/app/models/__init__.py`**

```python
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership
from app.models.project import Project

__all__ = ["Organization", "User", "Membership", "Project"]
```

- [ ] **Step 3: Create `backend/app/schemas/project.py`**

```python
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    allowlist_domains: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    allowlist_domains: list[str] | None = None


class ProjectOut(BaseModel):
    id: str
    org_id: str
    name: str
    allowlist_domains: list[str]
    created_at: datetime
```

- [ ] **Step 4: Write the failing test — `backend/tests/test_projects.py`**

```python
def _owner(client, email="owner@acme.com"):
    r = client.post("/auth/signup", json={"email": email, "password": "pw", "org_name": "Acme"})
    b = r.json()
    return b["org_id"], {"Authorization": f"Bearer {b['access_token']}"}


def test_project_crud(client):
    org_id, h = _owner(client)

    create = client.post(
        f"/orgs/{org_id}/projects",
        json={"name": "Support", "allowlist_domains": ["crm.acme.ru"]},
        headers=h,
    )
    assert create.status_code == 201
    pid = create.json()["id"]
    assert create.json()["allowlist_domains"] == ["crm.acme.ru"]

    listing = client.get(f"/orgs/{org_id}/projects", headers=h)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    get_one = client.get(f"/orgs/{org_id}/projects/{pid}", headers=h)
    assert get_one.status_code == 200

    patch = client.patch(
        f"/orgs/{org_id}/projects/{pid}",
        json={"allowlist_domains": ["crm.acme.ru", "lk.acme.ru"]},
        headers=h,
    )
    assert patch.status_code == 200
    assert patch.json()["allowlist_domains"] == ["crm.acme.ru", "lk.acme.ru"]
    assert patch.json()["name"] == "Support"

    delete = client.delete(f"/orgs/{org_id}/projects/{pid}", headers=h)
    assert delete.status_code == 204
    assert client.get(f"/orgs/{org_id}/projects/{pid}", headers=h).status_code == 404


def test_unknown_project_returns_404(client):
    org_id, h = _owner(client)
    assert client.get(f"/orgs/{org_id}/projects/nope", headers=h).status_code == 404
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_projects.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 6: Create `backend/app/routers/projects.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Membership, Project
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/orgs/{org_id}/projects", tags=["projects"])


def get_project_or_404(db: Session, org_id: str, project_id: str) -> Project:
    project = db.execute(
        select(Project).where(Project.id == project_id, Project.org_id == org_id)
    ).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    org_id: str,
    payload: ProjectCreate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> Project:
    project = Project(org_id=org_id, name=payload.name, allowlist_domains=payload.allowlist_domains)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    org_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[Project]:
    return list(
        db.execute(select(Project).where(Project.org_id == org_id)).scalars().all()
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> Project:
    return get_project_or_404(db, org_id, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    org_id: str,
    project_id: str,
    payload: ProjectUpdate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> Project:
    project = get_project_or_404(db, org_id, project_id)
    if payload.name is not None:
        project.name = payload.name
    if payload.allowlist_domains is not None:
        project.allowlist_domains = payload.allowlist_domains
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> Response:
    project = get_project_or_404(db, org_id, project_id)
    db.delete(project)
    db.commit()
    return Response(status_code=204)
```

- [ ] **Step 7: Register the router — modify `backend/app/main.py`**

```python
from app.routers import auth, members, projects

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_projects.py -v`
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/models/ app/schemas/project.py app/routers/projects.py app/main.py tests/test_projects.py
git commit -m "feat(backend): add Project model and CRUD with domain allowlist"
```

---

### Task 8: Guide, GuideVersion, Step models + guide creation

**Files:**
- Create: `backend/app/models/guide.py`
- Create: `backend/app/models/guide_version.py`
- Create: `backend/app/models/step.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/guide.py`
- Create: `backend/app/routers/guides.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_guides.py`

**Interfaces:**
- Consumes: `app.deps.*`, `app.routers.projects.get_project_or_404`, `app.models.*`.
- Produces:
  - `Guide(id, org_id, project_id, title, type, current_version_id, created_at)`; `type` is `"digital" | "offline"`.
  - `GuideVersion(id, guide_id, version_number, created_by, created_at)` — immutable.
  - `Step(id, version_id, order_index, text, media_url, fingerprint, created_at)` — `fingerprint` is nullable JSON.
  - `POST /orgs/{org_id}/projects/{project_id}/guides` (editor+) body `{title, type, steps: [StepInput]}` → 201 `GuideDetail`. Creates Guide + version 1 + steps, sets `current_version_id`.
  - `GET /orgs/{org_id}/guides/{guide_id}` (any member) → 200 `GuideDetail` (guide + current version's steps).
  - `GET /orgs/{org_id}/projects/{project_id}/guides` (any member) → `[GuideSummary]`.
  - Schemas: `StepInput`, `StepOut`, `GuideCreate`, `GuideDetail`, `GuideSummary`.
  - Helper `get_guide_or_404(db, org_id, guide_id) -> Guide` and `build_guide_detail(db, guide) -> GuideDetail` in `app/routers/guides.py` for reuse by Tasks 9–10.

- [ ] **Step 1: Create `backend/app/models/guide.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class Guide(Base):
    __tablename__ = "guides"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # digital | offline
    current_version_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 2: Create `backend/app/models/guide_version.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class GuideVersion(Base):
    __tablename__ = "guide_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    guide_id: Mapped[str] = mapped_column(String(32), ForeignKey("guides.id"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 3: Create `backend/app/models/step.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base
from app.models._base import new_id, utcnow


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(String(32), ForeignKey("guide_versions.id"), nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    media_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    fingerprint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 4: Register the models — modify `backend/app/models/__init__.py`**

```python
from app.models.organization import Organization
from app.models.user import User
from app.models.membership import Membership
from app.models.project import Project
from app.models.guide import Guide
from app.models.guide_version import GuideVersion
from app.models.step import Step

__all__ = [
    "Organization",
    "User",
    "Membership",
    "Project",
    "Guide",
    "GuideVersion",
    "Step",
]
```

- [ ] **Step 5: Create `backend/app/schemas/guide.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StepInput(BaseModel):
    text: str
    media_url: str | None = None
    fingerprint: dict | None = None


class StepOut(BaseModel):
    id: str
    order_index: int
    text: str
    media_url: str | None
    fingerprint: dict | None


class GuideCreate(BaseModel):
    title: str
    type: Literal["digital", "offline"]
    steps: list[StepInput]


class GuideSummary(BaseModel):
    id: str
    title: str
    type: str
    project_id: str
    current_version_id: str | None
    created_at: datetime


class GuideDetail(BaseModel):
    id: str
    title: str
    type: str
    project_id: str
    version_number: int
    current_version_id: str
    steps: list[StepOut]
    created_at: datetime
```

- [ ] **Step 6: Write the failing test — `backend/tests/test_guides.py`**

```python
def _owner_with_project(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    p = client.post(f"/orgs/{org_id}/projects", json={"name": "Support"}, headers=h).json()
    return org_id, p["id"], h


def test_create_and_get_guide(client):
    org_id, pid, h = _owner_with_project(client)
    resp = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={
            "title": "Refund a deal",
            "type": "digital",
            "steps": [
                {"text": "Open the deal card", "fingerprint": {"anchor": "deal-card"}},
                {"text": "Click Save", "media_url": "https://cdn/x.png"},
            ],
        },
        headers=h,
    )
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["version_number"] == 1
    assert detail["current_version_id"] == detail["current_version_id"]
    assert len(detail["steps"]) == 2
    assert detail["steps"][0]["order_index"] == 0
    assert detail["steps"][1]["order_index"] == 1

    gid = detail["id"]
    got = client.get(f"/orgs/{org_id}/guides/{gid}", headers=h)
    assert got.status_code == 200
    assert got.json()["steps"][0]["text"] == "Open the deal card"

    listing = client.get(f"/orgs/{org_id}/projects/{pid}/guides", headers=h)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_unknown_guide_404(client):
    org_id, pid, h = _owner_with_project(client)
    assert client.get(f"/orgs/{org_id}/guides/nope", headers=h).status_code == 404
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_guides.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 8: Create `backend/app/routers/guides.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import Guide, GuideVersion, Membership, Step, User
from app.routers.projects import get_project_or_404
from app.schemas.guide import (
    GuideCreate,
    GuideDetail,
    GuideSummary,
    StepInput,
    StepOut,
)

router = APIRouter(prefix="/orgs/{org_id}", tags=["guides"])


def get_guide_or_404(db: Session, org_id: str, guide_id: str) -> Guide:
    guide = db.execute(
        select(Guide).where(Guide.id == guide_id, Guide.org_id == org_id)
    ).scalar_one_or_none()
    if guide is None:
        raise HTTPException(status_code=404, detail="Guide not found")
    return guide


def _create_version(db: Session, guide: Guide, steps: list[StepInput], user_id: str, version_number: int) -> GuideVersion:
    version = GuideVersion(guide_id=guide.id, version_number=version_number, created_by=user_id)
    db.add(version)
    db.flush()
    for idx, s in enumerate(steps):
        db.add(
            Step(
                version_id=version.id,
                order_index=idx,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
            )
        )
    guide.current_version_id = version.id
    return version


def build_guide_detail(db: Session, guide: Guide) -> GuideDetail:
    version = db.get(GuideVersion, guide.current_version_id)
    steps = db.execute(
        select(Step).where(Step.version_id == version.id).order_by(Step.order_index)
    ).scalars().all()
    return GuideDetail(
        id=guide.id,
        title=guide.title,
        type=guide.type,
        project_id=guide.project_id,
        version_number=version.version_number,
        current_version_id=version.id,
        steps=[
            StepOut(
                id=s.id,
                order_index=s.order_index,
                text=s.text,
                media_url=s.media_url,
                fingerprint=s.fingerprint,
            )
            for s in steps
        ],
        created_at=guide.created_at,
    )


@router.post("/projects/{project_id}/guides", response_model=GuideDetail, status_code=201)
def create_guide(
    org_id: str,
    project_id: str,
    payload: GuideCreate,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> GuideDetail:
    get_project_or_404(db, org_id, project_id)
    guide = Guide(org_id=org_id, project_id=project_id, title=payload.title, type=payload.type)
    db.add(guide)
    db.flush()
    _create_version(db, guide, payload.steps, membership.user_id, version_number=1)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)


@router.get("/guides/{guide_id}", response_model=GuideDetail)
def get_guide(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> GuideDetail:
    guide = get_guide_or_404(db, org_id, guide_id)
    return build_guide_detail(db, guide)


@router.get("/projects/{project_id}/guides", response_model=list[GuideSummary])
def list_guides(
    org_id: str,
    project_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[GuideSummary]:
    rows = db.execute(
        select(Guide).where(Guide.org_id == org_id, Guide.project_id == project_id)
    ).scalars().all()
    return [
        GuideSummary(
            id=g.id,
            title=g.title,
            type=g.type,
            project_id=g.project_id,
            current_version_id=g.current_version_id,
            created_at=g.created_at,
        )
        for g in rows
    ]
```

- [ ] **Step 9: Register the router — modify `backend/app/main.py`**

```python
from app.routers import auth, guides, members, projects

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(guides.router)
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_guides.py -v`
Expected: PASS (2 passed).

- [ ] **Step 11: Commit**

```bash
cd backend
git add app/models/ app/schemas/guide.py app/routers/guides.py app/main.py tests/test_guides.py
git commit -m "feat(backend): add Guide/GuideVersion/Step models and guide creation"
```

---

### Task 9: New guide versions (immutable snapshots) + version history

**Files:**
- Modify: `backend/app/routers/guides.py`
- Modify: `backend/app/schemas/guide.py`
- Create: `backend/tests/test_versions.py`

**Interfaces:**
- Consumes: helpers from Task 8 (`get_guide_or_404`, `_create_version`, `build_guide_detail`).
- Produces:
  - `POST /orgs/{org_id}/guides/{guide_id}/versions` (editor+) body `{steps: [StepInput]}` → 201 `GuideDetail`; creates the next `version_number`, leaves prior versions/steps untouched, repoints `current_version_id`.
  - `GET /orgs/{org_id}/guides/{guide_id}/versions` (any member) → `[VersionSummary]` ordered by `version_number` desc.
  - Schema: `NewVersionRequest`, `VersionSummary`.

- [ ] **Step 1: Add schemas — append to `backend/app/schemas/guide.py`**

```python
class NewVersionRequest(BaseModel):
    steps: list[StepInput]


class VersionSummary(BaseModel):
    id: str
    version_number: int
    created_by: str
    created_at: datetime
    is_current: bool
```

- [ ] **Step 2: Write the failing test — `backend/tests/test_versions.py`**

```python
def _guide(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "v1 step"}]},
        headers=h,
    ).json()
    return org_id, g["id"], g["current_version_id"], h


def test_new_version_is_immutable_snapshot(client):
    org_id, gid, v1_id, h = _guide(client)

    resp = client.post(
        f"/orgs/{org_id}/guides/{gid}/versions",
        json={"steps": [{"text": "v2 step a"}, {"text": "v2 step b"}]},
        headers=h,
    )
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["version_number"] == 2
    assert detail["current_version_id"] != v1_id
    assert len(detail["steps"]) == 2

    # current guide now reflects v2
    current = client.get(f"/orgs/{org_id}/guides/{gid}", headers=h).json()
    assert current["version_number"] == 2
    assert current["steps"][0]["text"] == "v2 step a"

    # history has both versions, newest first, v1 not current
    hist = client.get(f"/orgs/{org_id}/guides/{gid}/versions", headers=h).json()
    assert [v["version_number"] for v in hist] == [2, 1]
    by_num = {v["version_number"]: v for v in hist}
    assert by_num[2]["is_current"] is True
    assert by_num[1]["is_current"] is False
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_versions.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 4: Add endpoints — append to `backend/app/routers/guides.py`**

First extend the imports at the top of the file:

```python
from app.schemas.guide import (
    GuideCreate,
    GuideDetail,
    GuideSummary,
    NewVersionRequest,
    StepInput,
    StepOut,
    VersionSummary,
)
```

Then append:

```python
@router.post("/guides/{guide_id}/versions", response_model=GuideDetail, status_code=201)
def create_version(
    org_id: str,
    guide_id: str,
    payload: NewVersionRequest,
    membership: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> GuideDetail:
    guide = get_guide_or_404(db, org_id, guide_id)
    last = db.execute(
        select(GuideVersion)
        .where(GuideVersion.guide_id == guide.id)
        .order_by(GuideVersion.version_number.desc())
    ).scalars().first()
    next_number = (last.version_number + 1) if last else 1
    _create_version(db, guide, payload.steps, membership.user_id, version_number=next_number)
    db.commit()
    db.refresh(guide)
    return build_guide_detail(db, guide)


@router.get("/guides/{guide_id}/versions", response_model=list[VersionSummary])
def list_versions(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[VersionSummary]:
    guide = get_guide_or_404(db, org_id, guide_id)
    rows = db.execute(
        select(GuideVersion)
        .where(GuideVersion.guide_id == guide.id)
        .order_by(GuideVersion.version_number.desc())
    ).scalars().all()
    return [
        VersionSummary(
            id=v.id,
            version_number=v.version_number,
            created_by=v.created_by,
            created_at=v.created_at,
            is_current=(v.id == guide.current_version_id),
        )
        for v in rows
    ]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_versions.py -v`
Expected: PASS (1 passed).

- [ ] **Step 6: Commit**

```bash
cd backend
git add app/routers/guides.py app/schemas/guide.py tests/test_versions.py
git commit -m "feat(backend): add immutable guide versioning and history"
```

---

### Task 10: Share links + public guide read

**Files:**
- Create: `backend/app/models/share_link.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/share.py`
- Create: `backend/app/routers/share.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_share.py`

**Interfaces:**
- Consumes: `app.routers.guides.{get_guide_or_404, build_guide_detail}`, `app.models.*`.
- Produces:
  - `ShareLink(id, org_id, guide_id, token, created_at)` with unique `token`.
  - `POST /orgs/{org_id}/guides/{guide_id}/share` (editor+) → 201 `{token, url_path}` where `url_path = "/share/{token}"`.
  - `GET /share/{token}` (NO auth) → 200 `GuideDetail` of the share's guide at its current version; 404 if token unknown.
  - Schema: `ShareLinkOut`.
  - Helper `make_token() -> str` in `app/routers/share.py`.

- [ ] **Step 1: Create `backend/app/models/share_link.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._base import new_id, utcnow


class ShareLink(Base):
    __tablename__ = "share_links"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    guide_id: Mapped[str] = mapped_column(String(32), ForeignKey("guides.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 2: Register the model — modify `backend/app/models/__init__.py`**

Add the import and `__all__` entry:

```python
from app.models.share_link import ShareLink
```

and append `"ShareLink"` to the `__all__` list.

- [ ] **Step 3: Create `backend/app/schemas/share.py`**

```python
from pydantic import BaseModel


class ShareLinkOut(BaseModel):
    token: str
    url_path: str
```

- [ ] **Step 4: Write the failing test — `backend/tests/test_share.py`**

```python
def _guide(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "Public guide", "type": "digital", "steps": [{"text": "do it"}]},
        headers=h,
    ).json()
    return org_id, g["id"], h


def test_share_link_public_read(client):
    org_id, gid, h = _guide(client)
    share = client.post(f"/orgs/{org_id}/guides/{gid}/share", headers=h)
    assert share.status_code == 201
    token = share.json()["token"]
    assert share.json()["url_path"] == f"/share/{token}"

    # public, no auth header
    public = client.get(f"/share/{token}")
    assert public.status_code == 200
    assert public.json()["title"] == "Public guide"
    assert public.json()["steps"][0]["text"] == "do it"


def test_unknown_share_token_404(client):
    assert client.get("/share/does-not-exist").status_code == 404
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_share.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 6: Create `backend/app/routers/share.py`**

```python
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_role
from app.models import Membership, ShareLink
from app.routers.guides import build_guide_detail, get_guide_or_404
from app.schemas.guide import GuideDetail
from app.schemas.share import ShareLinkOut


def make_token() -> str:
    return secrets.token_urlsafe(24)


org_router = APIRouter(prefix="/orgs/{org_id}/guides/{guide_id}", tags=["share"])
public_router = APIRouter(prefix="/share", tags=["share"])


@org_router.post("/share", response_model=ShareLinkOut, status_code=201)
def create_share_link(
    org_id: str,
    guide_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> ShareLinkOut:
    guide = get_guide_or_404(db, org_id, guide_id)
    token = make_token()
    db.add(ShareLink(org_id=org_id, guide_id=guide.id, token=token))
    db.commit()
    return ShareLinkOut(token=token, url_path=f"/share/{token}")


@public_router.get("/{token}", response_model=GuideDetail)
def read_shared_guide(token: str, db: Session = Depends(get_db)) -> GuideDetail:
    link = db.execute(select(ShareLink).where(ShareLink.token == token)).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    guide = get_guide_or_404(db, link.org_id, link.guide_id)
    return build_guide_detail(db, guide)
```

- [ ] **Step 7: Register both routers — modify `backend/app/main.py`**

```python
from app.routers import auth, guides, members, projects, share

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(guides.router)
app.include_router(share.org_router)
app.include_router(share.public_router)
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_share.py -v`
Expected: PASS (2 passed).

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/models/ app/schemas/share.py app/routers/share.py app/main.py tests/test_share.py
git commit -m "feat(backend): add share links and public guide read"
```

---

### Task 11: DriftEvent model + endpoints (data layer for Plan 5)

**Files:**
- Create: `backend/app/models/drift_event.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/drift.py`
- Create: `backend/app/routers/drift.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_drift.py`

**Interfaces:**
- Consumes: `app.deps.*`, `app.models.{Step, GuideVersion, Guide, DriftEvent}`.
- Produces:
  - `DriftEvent(id, org_id, step_id, score, source, fresh_fingerprint, status, draft_text, created_at)`; `source` ∈ `{"passive","flag"}`, `status` ∈ `{"open","accepted","dismissed"}` (default `"open"`).
  - `POST /orgs/{org_id}/drift` (editor+) body `{step_id, score, source, fresh_fingerprint?, draft_text?}` → 201 `DriftEventOut`. Validates the step belongs to a guide in this org (404 otherwise).
  - `GET /orgs/{org_id}/drift?status=open` (any member) → `[DriftEventOut]` (filter optional; default all).
  - `POST /orgs/{org_id}/drift/{event_id}/accept` (editor+) → sets `status="accepted"`, returns `DriftEventOut`. (Applying the draft as a new version is Plan 5; here it only transitions status.)
  - `POST /orgs/{org_id}/drift/{event_id}/dismiss` (editor+) → sets `status="dismissed"`.
  - Schemas: `DriftCreate`, `DriftEventOut`.

- [ ] **Step 1: Create `backend/app/models/drift_event.py`**

```python
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base
from app.models._base import new_id, utcnow


class DriftEvent(Base):
    __tablename__ = "drift_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id"), nullable=False, index=True)
    step_id: Mapped[str] = mapped_column(String(32), ForeignKey("steps.id"), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # passive | flag
    fresh_fingerprint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    draft_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
```

- [ ] **Step 2: Register the model — modify `backend/app/models/__init__.py`**

Add the import `from app.models.drift_event import DriftEvent` and append `"DriftEvent"` to `__all__`.

- [ ] **Step 3: Create `backend/app/schemas/drift.py`**

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DriftCreate(BaseModel):
    step_id: str
    score: float
    source: Literal["passive", "flag"]
    fresh_fingerprint: dict | None = None
    draft_text: str | None = None


class DriftEventOut(BaseModel):
    id: str
    step_id: str
    score: float
    source: str
    status: str
    fresh_fingerprint: dict | None
    draft_text: str | None
    created_at: datetime
```

- [ ] **Step 4: Write the failing test — `backend/tests/test_drift.py`**

```python
def _guide_with_step(client):
    b = client.post(
        "/auth/signup", json={"email": "o@acme.com", "password": "pw", "org_name": "Acme"}
    ).json()
    h = {"Authorization": f"Bearer {b['access_token']}"}
    org_id = b["org_id"]
    pid = client.post(f"/orgs/{org_id}/projects", json={"name": "P"}, headers=h).json()["id"]
    g = client.post(
        f"/orgs/{org_id}/projects/{pid}/guides",
        json={"title": "G", "type": "digital", "steps": [{"text": "click save"}]},
        headers=h,
    ).json()
    return org_id, g["steps"][0]["id"], h


def test_drift_lifecycle(client):
    org_id, step_id, h = _guide_with_step(client)

    create = client.post(
        f"/orgs/{org_id}/drift",
        json={
            "step_id": step_id,
            "score": 0.7,
            "source": "passive",
            "fresh_fingerprint": {"anchor": "save-btn-v2"},
            "draft_text": "click the new Save button",
        },
        headers=h,
    )
    assert create.status_code == 201
    event_id = create.json()["id"]
    assert create.json()["status"] == "open"

    open_list = client.get(f"/orgs/{org_id}/drift?status=open", headers=h)
    assert open_list.status_code == 200
    assert len(open_list.json()) == 1

    accept = client.post(f"/orgs/{org_id}/drift/{event_id}/accept", headers=h)
    assert accept.status_code == 200
    assert accept.json()["status"] == "accepted"

    assert len(client.get(f"/orgs/{org_id}/drift?status=open", headers=h).json()) == 0


def test_drift_for_unknown_step_404(client):
    org_id, _step_id, h = _guide_with_step(client)
    resp = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": "nope", "score": 0.9, "source": "flag"},
        headers=h,
    )
    assert resp.status_code == 404


def test_dismiss(client):
    org_id, step_id, h = _guide_with_step(client)
    event_id = client.post(
        f"/orgs/{org_id}/drift",
        json={"step_id": step_id, "score": 0.3, "source": "flag"},
        headers=h,
    ).json()["id"]
    resp = client.post(f"/orgs/{org_id}/drift/{event_id}/dismiss", headers=h)
    assert resp.status_code == 200
    assert resp.json()["status"] == "dismissed"
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_drift.py -v`
Expected: FAIL with 404 (routes not registered).

- [ ] **Step 6: Create `backend/app/routers/drift.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_membership, require_role
from app.models import DriftEvent, Guide, GuideVersion, Membership, Step
from app.schemas.drift import DriftCreate, DriftEventOut

router = APIRouter(prefix="/orgs/{org_id}/drift", tags=["drift"])


def _step_in_org_or_404(db: Session, org_id: str, step_id: str) -> Step:
    step = db.execute(
        select(Step)
        .join(GuideVersion, GuideVersion.id == Step.version_id)
        .join(Guide, Guide.id == GuideVersion.guide_id)
        .where(Step.id == step_id, Guide.org_id == org_id)
    ).scalar_one_or_none()
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


def _get_event_or_404(db: Session, org_id: str, event_id: str) -> DriftEvent:
    event = db.execute(
        select(DriftEvent).where(DriftEvent.id == event_id, DriftEvent.org_id == org_id)
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=404, detail="Drift event not found")
    return event


def _to_out(event: DriftEvent) -> DriftEventOut:
    return DriftEventOut(
        id=event.id,
        step_id=event.step_id,
        score=event.score,
        source=event.source,
        status=event.status,
        fresh_fingerprint=event.fresh_fingerprint,
        draft_text=event.draft_text,
        created_at=event.created_at,
    )


@router.post("", response_model=DriftEventOut, status_code=201)
def create_drift(
    org_id: str,
    payload: DriftCreate,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    _step_in_org_or_404(db, org_id, payload.step_id)
    event = DriftEvent(
        org_id=org_id,
        step_id=payload.step_id,
        score=payload.score,
        source=payload.source,
        fresh_fingerprint=payload.fresh_fingerprint,
        draft_text=payload.draft_text,
        status="open",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.get("", response_model=list[DriftEventOut])
def list_drift(
    org_id: str,
    status: str | None = None,
    _m: Membership = Depends(get_membership),
    db: Session = Depends(get_db),
) -> list[DriftEventOut]:
    query = select(DriftEvent).where(DriftEvent.org_id == org_id)
    if status is not None:
        query = query.where(DriftEvent.status == status)
    rows = db.execute(query.order_by(DriftEvent.created_at.desc())).scalars().all()
    return [_to_out(e) for e in rows]


@router.post("/{event_id}/accept", response_model=DriftEventOut)
def accept_drift(
    org_id: str,
    event_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    event = _get_event_or_404(db, org_id, event_id)
    event.status = "accepted"
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.post("/{event_id}/dismiss", response_model=DriftEventOut)
def dismiss_drift(
    org_id: str,
    event_id: str,
    _m: Membership = Depends(require_role("editor")),
    db: Session = Depends(get_db),
) -> DriftEventOut:
    event = _get_event_or_404(db, org_id, event_id)
    event.status = "dismissed"
    db.commit()
    db.refresh(event)
    return _to_out(event)
```

- [ ] **Step 7: Register the router — modify `backend/app/main.py`**

```python
from app.routers import auth, drift, guides, members, projects, share

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(guides.router)
app.include_router(share.org_router)
app.include_router(share.public_router)
app.include_router(drift.router)
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_drift.py -v`
Expected: PASS (3 passed).

- [ ] **Step 9: Commit**

```bash
cd backend
git add app/models/ app/schemas/drift.py app/routers/drift.py app/main.py tests/test_drift.py
git commit -m "feat(backend): add DriftEvent model and lifecycle endpoints"
```

---

### Task 12: Cross-tenant isolation suite + full run

**Files:**
- Create: `backend/tests/test_isolation.py`

**Interfaces:**
- Consumes: all endpoints above. No new production code — this task is a guard rail proving `org_id` isolation across the whole API.

- [ ] **Step 1: Write the failing test — `backend/tests/test_isolation.py`**

```python
def _org(client, email):
    b = client.post(
        "/auth/signup", json={"email": email, "password": "pw", "org_name": "Org"}
    ).json()
    return b["org_id"], {"Authorization": f"Bearer {b['access_token']}"}


def test_user_cannot_touch_other_orgs_resources(client):
    org_a, ha = _org(client, "a@x.com")
    org_b, hb = _org(client, "b@x.com")

    # A creates a project + guide
    pid = client.post(f"/orgs/{org_a}/projects", json={"name": "A-proj"}, headers=ha).json()["id"]
    gid = client.post(
        f"/orgs/{org_a}/projects/{pid}/guides",
        json={"title": "A-guide", "type": "digital", "steps": [{"text": "x"}]},
        headers=ha,
    ).json()["id"]

    # B is not a member of org A: membership dependency returns 404
    assert client.get(f"/orgs/{org_a}/projects", headers=hb).status_code == 404
    assert client.get(f"/orgs/{org_a}/projects/{pid}", headers=hb).status_code == 404
    assert client.get(f"/orgs/{org_a}/guides/{gid}", headers=hb).status_code == 404
    assert (
        client.post(
            f"/orgs/{org_a}/projects/{pid}/guides",
            json={"title": "evil", "type": "digital", "steps": [{"text": "x"}]},
            headers=hb,
        ).status_code
        == 404
    )

    # Even addressing A's guide under B's own org path must not leak it
    assert client.get(f"/orgs/{org_b}/guides/{gid}", headers=hb).status_code == 404


def test_viewer_cannot_write(client):
    org_a, ha = _org(client, "owner@x.com")
    # create a viewer user and add to org A
    client.post("/auth/signup", json={"email": "v@x.com", "password": "pw", "org_name": "Tmp"})
    client.post(f"/orgs/{org_a}/members", json={"email": "v@x.com", "role": "viewer"}, headers=ha)
    vb = client.post("/auth/login", json={"email": "v@x.com", "password": "pw"}).json()
    hv = {"Authorization": f"Bearer {vb['access_token']}"}

    # viewer can read projects but not create
    assert client.get(f"/orgs/{org_a}/projects", headers=hv).status_code == 200
    assert client.post(f"/orgs/{org_a}/projects", json={"name": "nope"}, headers=hv).status_code == 403
```

- [ ] **Step 2: Run the isolation suite to verify it passes**

Run: `cd backend && uv run pytest tests/test_isolation.py -v`
Expected: PASS (2 passed). If any assertion fails, an endpoint is missing an `org_id` filter or a role guard — fix the offending router before continuing.

- [ ] **Step 3: Run the entire suite**

Run: `cd backend && uv run pytest -v`
Expected: ALL PASS across `test_health, test_models, test_security, test_roles, test_auth, test_members, test_projects, test_guides, test_versions, test_share, test_drift, test_isolation`.

- [ ] **Step 4: Commit**

```bash
cd backend
git add tests/test_isolation.py
git commit -m "test(backend): add cross-tenant isolation and role-write guard suite"
```

---

## Self-Review

**1. Spec coverage (against `docs/2026-06-20-self-healing-sop-design.md` §6 data model and §3/§7 access rules):**
- Organization → Task 2. ✅
- User / Membership with roles owner/editor/viewer → Tasks 2, 4, 6. ✅
- Project + allowlist domains → Task 7. ✅
- Guide with `current_version_id` and `type` (digital/offline) → Task 8. ✅
- GuideVersion immutable snapshot + history → Tasks 8, 9. ✅
- Step with text/media/fingerprint/order → Task 8. ✅
- DriftEvent (step, score, source passive/flag, fresh fingerprint, status open/accepted/dismissed, draft) → Task 11. ✅
- ShareLink (PLG sharing) + public read → Task 10. ✅
- Sweeping `org_id` isolation → enforced everywhere, proven in Task 12. ✅
- Tariff/anti-staleness gating, AI generation, drift scoring, extension capture → **out of scope for Plan 1** by design; they live in Plans 2 (AI), 3 (extension), 5 (drift engine). The DriftEvent data layer here is the seam Plan 5 builds on. No gap.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases" placeholders; every code step shows complete code. ✅

**3. Type consistency:** `new_id`/`utcnow` (Task 2) reused everywhere; `get_project_or_404` (Task 7) consumed by Task 8; `get_guide_or_404`/`build_guide_detail` (Task 8) consumed by Tasks 9 and 10; `_create_version` signature `(db, guide, steps, user_id, version_number)` is identical at both call sites (Tasks 8, 9); `StepInput`/`StepOut`/`GuideDetail` names are stable across Tasks 8–10; `ShareLinkOut.url_path` matches the public route `/share/{token}` (Task 10). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-backend-api-data-model.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
