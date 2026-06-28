# Self-Healing SOP — backend (FastAPI) image.
FROM python:3.12-slim

# uv for dependency management (matches local dev).
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install deps first (cached layer) using the lockfile; skip dev tools.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App source.
COPY . .

EXPOSE 8000

# Apply migrations, then serve. DATABASE_URL / JWT_SECRET / ANTHROPIC_API_KEY
# come from the environment (see docker-compose.yml).
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
