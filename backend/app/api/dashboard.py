from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CalendarEntry, Draft, IdeaSession, WorkflowProgress

router = APIRouter()


def _next_iso_week(year: int, week: int) -> tuple[int, int]:
    dt = datetime.fromisocalendar(year, week, 4) + timedelta(weeks=1)
    cal = dt.isocalendar()
    return (cal.year, cal.week)


def _longest_streak(weeks: set[tuple[int, int]]) -> int:
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


def _current_streak(weeks: set[tuple[int, int]]) -> int:
    """Streak yang berakhir di minggu sekarang ATAU minggu lalu (toleransi 1 minggu)."""
    if not weeks:
        return 0
    today = datetime.utcnow().isocalendar()
    current = (today.year, today.week)
    prev = _next_iso_week(*current)  # next week (untuk handle awal minggu)
    last_week = _prev_iso_week(*current)

    # Anchor: kalau minggu ini ada → start dari current
    # Kalau nggak ada tapi minggu lalu ada → start dari last_week
    # Kalau dua-duanya tidak ada → streak putus = 0
    if current in weeks:
        anchor = current
    elif last_week in weeks:
        anchor = last_week
    else:
        return 0

    streak = 1
    cursor = _prev_iso_week(*anchor)
    while cursor in weeks:
        streak += 1
        cursor = _prev_iso_week(*cursor)
    return streak


def _prev_iso_week(year: int, week: int) -> tuple[int, int]:
    dt = datetime.fromisocalendar(year, week, 4) - timedelta(weeks=1)
    cal = dt.isocalendar()
    return (cal.year, cal.week)


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len(text.split())


@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    drafts = db.query(Draft).all()
    by_status: dict[str, int] = defaultdict(int)
    for d in drafts:
        by_status[d.status] += 1

    published = [d for d in drafts if d.status == "published" and d.published_at]
    weeks_set: set[tuple[int, int]] = set()
    for d in published:
        cal = d.published_at.isocalendar()
        weeks_set.add((cal.year, cal.week))

    longest = _longest_streak(weeks_set)
    current = _current_streak(weeks_set)

    # Last 12 weeks heatmap data (count per week)
    today = datetime.utcnow().isocalendar()
    cursor = (today.year, today.week)
    heatmap: list[dict] = []
    for _ in range(12):
        # Count published in this week
        count = sum(
            1
            for d in published
            if (d.published_at.isocalendar().year, d.published_at.isocalendar().week)
            == cursor
        )
        heatmap.append(
            {
                "year": cursor[0],
                "week": cursor[1],
                "label": f"W{cursor[1]}",
                "count": count,
            }
        )
        cursor = _prev_iso_week(*cursor)
    heatmap.reverse()  # chronological order

    # Drafts created per week (last 8 weeks)
    drafts_per_week: dict[tuple[int, int], int] = defaultdict(int)
    for d in drafts:
        cal = d.created_at.isocalendar()
        drafts_per_week[(cal.year, cal.week)] += 1

    week_chart: list[dict] = []
    cursor = (today.year, today.week)
    for _ in range(8):
        week_chart.append(
            {
                "label": f"W{cursor[1]}",
                "drafts": drafts_per_week.get(cursor, 0),
            }
        )
        cursor = _prev_iso_week(*cursor)
    week_chart.reverse()

    # Last activity (5 drafts)
    recent_drafts = (
        db.query(Draft).order_by(Draft.updated_at.desc()).limit(5).all()
    )
    last_activity = [
        {
            "id": d.id,
            "title": d.title,
            "status": d.status,
            "updated_at": d.updated_at.isoformat(),
            "published_url": d.published_url,
        }
        for d in recent_drafts
    ]

    # Calendar this month
    today_dt = datetime.utcnow()
    prefix = f"{today_dt.year:04d}-{today_dt.month:02d}-"
    cal_this_month = (
        db.query(CalendarEntry).filter(CalendarEntry.date.like(f"{prefix}%")).count()
    )

    # Workflow progress
    workflow_done = db.query(WorkflowProgress).count()

    # Ideas history count
    ideas_total = db.query(IdeaSession).count()

    # Word stats
    avg_words = 0
    if published:
        avg_words = sum(_word_count(d.content_md) for d in published) // len(published)

    return {
        "drafts_by_status": dict(by_status),
        "drafts_total": len(drafts),
        "published_total": len(published),
        "avg_word_count": avg_words,
        "streak_current": current,
        "streak_longest": longest,
        "heatmap_12w": heatmap,
        "drafts_per_week_8w": week_chart,
        "last_activity": last_activity,
        "calendar_this_month": cal_this_month,
        "workflow_done": workflow_done,
        "workflow_total": 5,
        "ideas_history_total": ideas_total,
    }
