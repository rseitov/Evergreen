from fastapi import FastAPI

app = FastAPI(title="Self-Healing SOP API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
