from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    calendar,
    dashboard,
    drafts,
    ideas,
    images,
    publishing,
    readiness,
    settings as settings_api,
    workflow,
)
from .config import settings
from .db import Base, engine, run_lightweight_migrations


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    added = run_lightweight_migrations(engine)
    if added:
        print(f"[migration] added columns: {', '.join(added)}")
    yield


app = FastAPI(title="Braindpost API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ideas.router, prefix="/api/ideas", tags=["ideas"])
app.include_router(workflow.router, prefix="/api/workflow", tags=["workflow"])
app.include_router(drafts.router, prefix="/api/drafts", tags=["drafts"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(readiness.router, prefix="/api/readiness", tags=["readiness"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(publishing.router, prefix="/api/publishing", tags=["publishing"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])


@app.get("/")
def root():
    return {"app": "braindpost", "status": "ok"}
