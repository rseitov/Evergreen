from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, drift, generate, guides, members, projects, share

app = FastAPI(title="Self-Healing SOP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(guides.router)
app.include_router(share.org_router)
app.include_router(share.public_router)
app.include_router(drift.router)
app.include_router(generate.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
