from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import settings as env_settings
from ..db import get_db
from ..schemas import SettingItem, SettingsBulkUpdate
from ..settings_store import get_value_with_db, set_value_with_db

router = APIRouter()


KNOWN_SETTINGS = [
    {
        "key": "deepseek_api_key",
        "label": "DeepSeek API Key",
        "type": "password",
        "category": "AI / LLM",
        "active": True,
        "description": "Dipakai untuk Ide Topik, Draft, dan Calendar.",
        "placeholder": "sk-...",
    },
    {
        "key": "deepseek_model",
        "label": "DeepSeek Model",
        "type": "text",
        "category": "AI / LLM",
        "active": True,
        "description": "Nama model DeepSeek (default: deepseek-chat).",
        "placeholder": "deepseek-chat",
    },
    {
        "key": "deepseek_base_url",
        "label": "DeepSeek Base URL",
        "type": "text",
        "category": "AI / LLM",
        "active": True,
        "description": "Endpoint API DeepSeek. Ubah hanya jika tahu kenapa.",
        "placeholder": "https://api.deepseek.com/v1",
    },
    {
        "key": "pexels_api_key",
        "label": "Pexels API Key",
        "type": "password",
        "category": "Image",
        "active": True,
        "description": "Untuk pencarian stock photo Pexels. Daftar gratis di pexels.com/api.",
        "placeholder": "",
    },
    {
        "key": "unsplash_access_key",
        "label": "Unsplash Access Key",
        "type": "password",
        "category": "Image",
        "active": True,
        "description": "Untuk pencarian stock photo Unsplash. Daftar gratis di unsplash.com/developers.",
        "placeholder": "",
    },
    {
        "key": "pixabay_api_key",
        "label": "Pixabay API Key",
        "type": "password",
        "category": "Image",
        "active": True,
        "description": "Untuk pencarian stock photo Pixabay. Daftar gratis di pixabay.com/api/docs.",
        "placeholder": "",
    },
]

KNOWN_KEYS = {s["key"] for s in KNOWN_SETTINGS}

# Fallback to env values for known DeepSeek keys, so existing .env still works.
ENV_FALLBACK = {
    "deepseek_api_key": lambda: env_settings.deepseek_api_key,
    "deepseek_model": lambda: env_settings.deepseek_model,
    "deepseek_base_url": lambda: env_settings.deepseek_base_url,
}


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 6:
        return "•" * len(value)
    return f"{'•' * 6}{value[-4:]}"


@router.get("", response_model=list[SettingItem])
def list_settings(db: Session = Depends(get_db)):
    items: list[SettingItem] = []
    for meta in KNOWN_SETTINGS:
        val = get_value_with_db(db, meta["key"])
        if not val and meta["key"] in ENV_FALLBACK:
            val = ENV_FALLBACK[meta["key"]]()
        is_set = bool(val)
        if meta["type"] == "password":
            preview = _mask(val) if is_set else ""
        else:
            preview = val
        items.append(
            SettingItem(
                key=meta["key"],
                label=meta["label"],
                type=meta["type"],
                category=meta["category"],
                active=meta["active"],
                description=meta.get("description", ""),
                placeholder=meta.get("placeholder", ""),
                is_set=is_set,
                value_preview=preview,
            )
        )
    return items


@router.put("")
def update_settings(body: SettingsBulkUpdate, db: Session = Depends(get_db)):
    updated: list[str] = []
    for k, v in body.values.items():
        if k not in KNOWN_KEYS:
            continue
        set_value_with_db(db, k, v)
        updated.append(k)
    db.commit()
    return {"updated": updated}
