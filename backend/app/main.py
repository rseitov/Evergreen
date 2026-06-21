from fastapi import FastAPI

from app.routers import auth, drift, generate, guides, members, projects, share

app = FastAPI(title="Self-Healing SOP API")
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
