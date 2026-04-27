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
    category: str = ""
    audience: str = ""
    specific_topic: str = ""
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
    status: Optional[str] = None
    publishing_meta: Optional[dict] = None  # JSON object — di-serialize backend


class DraftResponse(BaseModel):
    id: int
    title: str
    content_md: str
    content_type: str
    tone: str
    notes: str
    status: str
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Publishing
    publishing_meta: Optional[dict] = None
    published_url: Optional[str] = None
    laravel_post_id: Optional[int] = None
    published_at_blog: Optional[datetime] = None


class DraftListItem(BaseModel):
    id: int
    title: str
    content_type: str
    tone: str
    status: str
    published_at: Optional[datetime] = None
    updated_at: datetime
    published_url: Optional[str] = None  # supaya list bisa show "🔗 published" badge


# ===== M2 YMYL/Policy Pattern Detection =====

class PolicyPattern(BaseModel):
    category: str  # medical | financial | legal | safety
    excerpt: str
    note: str
    suggested_disclaimer: str


class PolicyCheckResponse(BaseModel):
    patterns: list[PolicyPattern]
    summary: str


# ===== M4 Internal Linking Suggestions =====

class LinkSuggestion(BaseModel):
    draft_id: int
    title: str
    score: float
    suggested_anchor: str
    slug: str


class LinkSuggestionsResponse(BaseModel):
    source_id: int
    suggestions: list[LinkSuggestion]


# ===== #8 SEO Snippet =====

class SeoSnippetResponse(BaseModel):
    meta_title: str
    meta_description: str
    slug: str
    keywords: list[str]


# ===== Publishing (Laravel autopost) =====

class PublishRequest(BaseModel):
    force: bool = False


class PublishResponse(BaseModel):
    laravel_post_id: int
    status: str
    admin_url: str
    public_url: Optional[str] = None
    updated_fields: list[str] = []
    preserved_fields: list[str] = []
    raw: dict = {}


class PublishStatusResponse(BaseModel):
    laravel_post_id: int
    status: str
    processing_error: Optional[str] = None
    admin_url: Optional[str] = None
    public_url: Optional[str] = None
    downloaded_images: int = 0
    total_images: int = 0
    updated_at: Optional[str] = None


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


# ===== Readiness (M3 — AdSense Readiness Checklist) =====

class ReadinessAutoStats(BaseModel):
    published_count: int
    published_target: int = 15
    avg_word_count: int
    avg_word_target: int = 800
    consecutive_weeks: int
    consecutive_target: int = 4


class ReadinessManual(BaseModel):
    about_page: bool = False
    privacy_policy: bool = False
    contact_page: bool = False
    disclaimer_page: bool = False
    own_domain: bool = False
    blog_age_6_months: bool = False
    no_policy_violations: bool = False


class ReadinessResponse(BaseModel):
    auto: ReadinessAutoStats
    manual: ReadinessManual
    overall_pct: int


class ReadinessManualUpdate(BaseModel):
    key: str
    value: bool
