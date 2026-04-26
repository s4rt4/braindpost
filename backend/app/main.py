from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    calendar,
    drafts,
    ideas,
    images,
    readiness,
    settings as settings_api,
    workflow,
)
from .config import settings
from .db import Base, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])


@app.get("/")
def root():
    return {"app": "braindpost", "status": "ok"}
