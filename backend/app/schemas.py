from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ===== Ideas =====

class IdeasRequest(BaseModel):
    category: str
    audience: str
    specific_topic: str = ""
    count: int = Field(default=12, ge=4, le=20)


class IdeasResponse(BaseModel):
    id: int
    result: str
    created_at: datetime


# ===== Drafts =====

class DraftGenerateRequest(BaseModel):
    title: str
    content_type: str = "panduan"
    tone: str = "hangat dan personal"
    notes: str = ""


class DraftUpdateRequest(BaseModel):
    title: Optional[str] = None
    content_md: Optional[str] = None
    tone: Optional[str] = None
    content_type: Optional[str] = None
    notes: Optional[str] = None


class DraftResponse(BaseModel):
    id: int
    title: str
    content_md: str
    content_type: str
    tone: str
    notes: str
    created_at: datetime
    updated_at: datetime


class DraftListItem(BaseModel):
    id: int
    title: str
    content_type: str
    tone: str
    updated_at: datetime


# ===== Workflow =====

class WorkflowProgressUpdate(BaseModel):
    step_num: int = Field(ge=1, le=20)
    completed: bool


class WorkflowProgressResponse(BaseModel):
    completed: list[int]


# ===== Calendar =====

class CalendarGenerateRequest(BaseModel):
    year: int = Field(ge=2024, le=2100)
    month: int = Field(ge=1, le=12)
    frequency: int = Field(ge=2, le=5)
    niche: str
    audience: str = ""


class CalendarUpdateRequest(BaseModel):
    title: Optional[str] = None
    content_type: Optional[str] = None
    notes: Optional[str] = None


class CalendarEntryResponse(BaseModel):
    id: int
    date: str
    title: str
    content_type: str
    notes: str


# ===== Settings =====

class SettingItem(BaseModel):
    key: str
    label: str
    type: str  # "text" | "password"
    category: str
    active: bool
    description: str = ""
    placeholder: str = ""
    is_set: bool
    value_preview: str = ""


class SettingsBulkUpdate(BaseModel):
    values: dict[str, str]


# ===== Images =====

class ImageSizeOption(BaseModel):
    label: str
    url: str
    width: int = 0


class ImageItem(BaseModel):
    id: str
    provider: str
    url: str
    thumb: str
    width: int
    height: int
    photographer: str
    photographer_url: str
    source_url: str
    alt: str
    sizes: list[ImageSizeOption] = []


class ImageSearchResponse(BaseModel):
    query: str
    page: int
    results: list[ImageItem]
    errors: dict[str, str] = {}
