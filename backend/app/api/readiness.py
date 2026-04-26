from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Draft
from ..schemas import (
    ReadinessAutoStats,
    ReadinessManual,
    ReadinessManualUpdate,
    ReadinessResponse,
)
from ..settings_store import get_value_with_db, set_value_with_db

router = APIRouter()

MANUAL_KEYS = list(ReadinessManual.model_fields.keys())
SETTING_PREFIX = "readiness."


# ---------- helpers ----------

def _next_iso_week(year: int, week: int) -> tuple[int, int]:
    """Get next ISO week (year, week) handling year boundaries."""
    dt = datetime.fromisocalendar(year, week, 4) + timedelta(weeks=1)
    cal = dt.isocalendar()
    return (cal.year, cal.week)


def _longest_consecutive_streak(weeks: set[tuple[int, int]]) -> int:
    """Longest consecutive run of (year, week) tuples present in the set."""
    if not weeks:
        return 0
    sorted_weeks = sorted(weeks)
    longest = 1
    current = 1
    prev = sorted_weeks[0]
    for w in sorted_weeks[1:]:
        if _next_iso_week(*prev) == w:
            current += 1
        else:
            current = 1
        longest = max(longest, current)
        prev = w
    return longest


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len(text.split())


def _compute_auto_stats(db: Session) -> ReadinessAutoStats:
    published = (
        db.query(Draft)
        .filter(Draft.status == "published")
        .all()
    )
    published_count = len(published)

    if published_count == 0:
        avg_words = 0
    else:
        total_words = sum(_word_count(d.content_md) for d in published)
        avg_words = total_words // published_count

    weeks_with_publishes: set[tuple[int, int]] = set()
    for d in published:
        if d.published_at:
            cal = d.published_at.isocalendar()
            weeks_with_publishes.add((cal.year, cal.week))

    consecutive = _longest_consecutive_streak(weeks_with_publishes)

    return ReadinessAutoStats(
        published_count=published_count,
        avg_word_count=avg_words,
        consecutive_weeks=consecutive,
    )


def _read_manual(db: Session) -> ReadinessManual:
    data: dict[str, bool] = {}
    for key in MANUAL_KEYS:
        raw = get_value_with_db(db, f"{SETTING_PREFIX}{key}")
        data[key] = raw == "true"
    return ReadinessManual(**data)


def _compute_overall_pct(auto: ReadinessAutoStats, manual: ReadinessManual) -> int:
    auto_scores = [
        min(auto.published_count / max(1, auto.published_target), 1.0),
        min(auto.avg_word_count / max(1, auto.avg_word_target), 1.0)
        if auto.avg_word_count > 0
        else 0.0,
        min(auto.consecutive_weeks / max(1, auto.consecutive_target), 1.0),
    ]
    manual_scores = [1.0 if v else 0.0 for v in manual.model_dump().values()]
    all_scores = auto_scores + manual_scores
    return round(sum(all_scores) / len(all_scores) * 100)


# ---------- endpoints ----------

@router.get("", response_model=ReadinessResponse)
def get_readiness(db: Session = Depends(get_db)):
    auto = _compute_auto_stats(db)
    manual = _read_manual(db)
    overall = _compute_overall_pct(auto, manual)
    return ReadinessResponse(auto=auto, manual=manual, overall_pct=overall)


@router.put("/manual", response_model=ReadinessResponse)
def update_manual(
    body: ReadinessManualUpdate, db: Session = Depends(get_db)
):
    if body.key not in MANUAL_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Key tidak valid: {body.key}. Pilihan: {MANUAL_KEYS}",
        )
    set_value_with_db(db, f"{SETTING_PREFIX}{body.key}", "true" if body.value else "")
    db.commit()

    auto = _compute_auto_stats(db)
    manual = _read_manual(db)
    overall = _compute_overall_pct(auto, manual)
    return ReadinessResponse(auto=auto, manual=manual, overall_pct=overall)
