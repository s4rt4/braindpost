from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CalendarEntry
from ..providers.llm.deepseek import llm
from ..schemas import (
    CalendarEntryResponse,
    CalendarGenerateRequest,
    CalendarUpdateRequest,
)

router = APIRouter()

MONTH_NAMES_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

# Python: Monday=0, Sunday=6
FREQ_TO_WEEKDAYS = {
    2: [0, 3],         # Mon, Thu
    3: [0, 2, 4],      # Mon, Wed, Fri
    4: [0, 1, 3, 4],   # Mon, Tue, Thu, Fri
    5: [0, 1, 2, 3, 4],
}

PROMPT_TEMPLATE = """Kamu adalah content strategist blog Indonesia.

Buat content calendar untuk bulan {month_name} {year} dengan detail:
- Niche / topik utama: {niche}
- Target audience: {audience}
- Frekuensi posting: {frequency}x seminggu
- Total posting days: {n} hari (tanggal: {dates_str})

Untuk SETIAP tanggal di atas, buat satu judul artikel yang spesifik & menarik.

Format output HARUS persis seperti ini (satu baris per tanggal, tanpa intro / penjelasan / nomor):
TANGGAL|JUDUL|JENIS

Contoh:
3|Cara Optimasi Bundle Size NextJS 14 untuk Pemula|tutorial
6|7 Tools Git yang Wajib Tahu untuk Web Developer|listicle

Pilihan jenis: panduan / tutorial / review / tips / sejarah / perbandingan / listicle / opini / studi-kasus

Aturan:
- Variasikan jenis konten — jangan semua satu jenis.
- Judul spesifik & punya angle, hindari judul generik ("Tips Penting...", "Cara Mudah...").
- Bahasa Indonesia natural.
- Total: tepat {n} baris, satu per tanggal."""


def _to_response(e: CalendarEntry) -> CalendarEntryResponse:
    return CalendarEntryResponse(
        id=e.id,
        date=e.date,
        title=e.title,
        content_type=e.content_type,
        notes=e.notes,
    )


def _posting_dates(year: int, month: int, frequency: int) -> list[int]:
    weekdays = FREQ_TO_WEEKDAYS[frequency]
    days_in_month = monthrange(year, month)[1]
    return [
        d
        for d in range(1, days_in_month + 1)
        if date(year, month, d).weekday() in weekdays
    ]


@router.get("", response_model=list[CalendarEntryResponse])
def list_entries(
    year: int = Query(..., ge=2024, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    prefix = f"{year:04d}-{month:02d}-"
    rows = (
        db.query(CalendarEntry)
        .filter(CalendarEntry.date.like(f"{prefix}%"))
        .order_by(CalendarEntry.date)
        .all()
    )
    return [_to_response(r) for r in rows]


@router.post("/generate", response_model=list[CalendarEntryResponse])
async def generate_calendar(
    req: CalendarGenerateRequest, db: Session = Depends(get_db)
):
    if not req.niche.strip():
        raise HTTPException(status_code=400, detail="Niche wajib diisi.")

    dates = _posting_dates(req.year, req.month, req.frequency)
    if not dates:
        raise HTTPException(status_code=400, detail="Tidak ada tanggal posting.")

    month_name = MONTH_NAMES_ID[req.month - 1]
    prompt = PROMPT_TEMPLATE.format(
        month_name=month_name,
        year=req.year,
        niche=req.niche,
        audience=req.audience or "(umum)",
        frequency=req.frequency,
        n=len(dates),
        dates_str=", ".join(str(d) for d in dates),
    )

    try:
        result = await llm.complete(prompt, max_tokens=2000)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # Parse: TANGGAL|JUDUL|JENIS
    parsed: dict[int, tuple[str, str]] = {}
    for line in result.splitlines():
        line = line.strip()
        if "|" not in line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        try:
            day = int(parts[0])
        except ValueError:
            continue
        if day not in dates:
            continue
        title = parts[1]
        ctype = parts[2] if len(parts) >= 3 else "artikel"
        parsed[day] = (title, ctype)

    if not parsed:
        raise HTTPException(
            status_code=502,
            detail="AI tidak return format yang bisa di-parse. Coba lagi.",
        )

    # Replace existing entries for this month
    prefix = f"{req.year:04d}-{req.month:02d}-"
    db.query(CalendarEntry).filter(
        CalendarEntry.date.like(f"{prefix}%")
    ).delete(synchronize_session=False)

    new_entries = []
    for day, (title, ctype) in sorted(parsed.items()):
        entry = CalendarEntry(
            date=f"{req.year:04d}-{req.month:02d}-{day:02d}",
            title=title,
            content_type=ctype,
        )
        db.add(entry)
        new_entries.append(entry)
    db.commit()
    for e in new_entries:
        db.refresh(e)

    return [_to_response(e) for e in new_entries]


@router.put("/{entry_id}", response_model=CalendarEntryResponse)
def update_entry(
    entry_id: int, req: CalendarUpdateRequest, db: Session = Depends(get_db)
):
    e = db.query(CalendarEntry).filter(CalendarEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry tidak ditemukan.")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(e, field, value)
    db.commit()
    db.refresh(e)
    return _to_response(e)


@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(CalendarEntry).filter(CalendarEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry tidak ditemukan.")
    db.delete(e)
    db.commit()
    return {"deleted": entry_id}
