from fastapi import FastAPI

from app.routers import auth, members, projects

app = FastAPI(title="Self-Healing SOP API")
app.include_router(auth.router)
app.include_router(members.router)
app.include_router(projects.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
