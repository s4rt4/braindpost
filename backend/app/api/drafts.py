from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Draft
from ..providers.llm.deepseek import llm
from ..schemas import (
    DraftGenerateRequest,
    DraftListItem,
    DraftResponse,
    DraftUpdateRequest,
)

router = APIRouter()

PROMPT_TEMPLATE = """Kamu adalah penulis blog Indonesia berpengalaman dengan gaya {tone}.

Tulis draft artikel blog dengan detail berikut:
- Judul: {title}
- Jenis konten: {content_type}
- Catatan / poin khusus: {notes}

Struktur yang diinginkan (gunakan markdown):
1. **INTRO** (2 paragraf) — mulai dengan hook, cerita, atau konteks menarik. JANGAN langsung penjelasan teknis atau definisi.
2. **KONTEN UTAMA** — sesuai jenis konten. Pakai heading H2 (`##`) dan H3 (`###`) untuk struktur.
3. **Bagian "⭐ Dari Pengalaman Pribadi"** — placeholder kosong dengan 1–2 kalimat petunjuk untuk penulis isi nanti (pengalaman, tips unik, foto).
4. **PENUTUP + CTA** — ajak pembaca komentar, share, atau coba sendiri.

Aturan:
- Bahasa Indonesia natural, BUKAN terjemahan kaku. Hindari kalimat klise dan filler.
- Format markdown bersih.
- Panjang sekitar 600–900 kata.
- Untuk resep / tutorial: sertakan langkah jelas dengan list bernomor.
"""


def _to_response(d: Draft) -> DraftResponse:
    return DraftResponse(
        id=d.id,
        title=d.title,
        content_md=d.content_md,
        content_type=d.content_type,
        tone=d.tone,
        notes=d.notes,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


@router.post("/generate", response_model=DraftResponse)
async def generate_draft(req: DraftGenerateRequest, db: Session = Depends(get_db)):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Judul wajib diisi.")

    prompt = PROMPT_TEMPLATE.format(
        title=req.title,
        content_type=req.content_type,
        tone=req.tone,
        notes=req.notes or "(tidak ada catatan khusus)",
    )

    try:
        content = await llm.complete(prompt, max_tokens=2400)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    draft = Draft(
        title=req.title,
        content_md=content,
        content_type=req.content_type,
        tone=req.tone,
        notes=req.notes,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return _to_response(draft)


@router.get("", response_model=list[DraftListItem])
def list_drafts(db: Session = Depends(get_db)):
    rows = db.query(Draft).order_by(Draft.updated_at.desc()).all()
    return [
        DraftListItem(
            id=d.id,
            title=d.title,
            content_type=d.content_type,
            tone=d.tone,
            updated_at=d.updated_at,
        )
        for d in rows
    ]


@router.get("/{draft_id}", response_model=DraftResponse)
def get_draft(draft_id: int, db: Session = Depends(get_db)):
    d = db.query(Draft).filter(Draft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")
    return _to_response(d)


@router.put("/{draft_id}", response_model=DraftResponse)
def update_draft(
    draft_id: int, req: DraftUpdateRequest, db: Session = Depends(get_db)
):
    d = db.query(Draft).filter(Draft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    d.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return _to_response(d)


@router.delete("/{draft_id}")
def delete_draft(draft_id: int, db: Session = Depends(get_db)):
    d = db.query(Draft).filter(Draft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")
    db.delete(d)
    db.commit()
    return {"deleted": draft_id}
