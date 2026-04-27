from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import IdeaSession
from ..providers.llm.router import llm
from ..schemas import IdeasRequest, IdeasResponse

router = APIRouter()

PROMPT_TEMPLATE = """Kamu adalah konsultan konten blog berpengalaman.

Buat {count} ide topik artikel dengan detail berikut:
- Kategori / niche: {category}
- Target pembaca: {audience}
- Topik spesifik: {specific_topic}

Format output:
1. Buat 4 keyword long-tail SEO (format: [KEYWORD]: penjelasan singkat kenapa potensial)
2. Buat {title_count} judul artikel yang menarik dan SEO-friendly

Gunakan angle beragam: how-to, listicle, opini, perbandingan, panduan, sejarah/konteks.
Hindari topik terlalu umum. Prioritaskan yang spesifik dan punya niche audience.
Jawab dalam Bahasa Indonesia yang natural dan tidak kaku."""


@router.post("/generate", response_model=IdeasResponse)
async def generate_ideas(req: IdeasRequest, db: Session = Depends(get_db)):
    prompt = PROMPT_TEMPLATE.format(
        count=req.count,
        title_count=max(req.count - 4, 4),
        category=req.category,
        audience=req.audience,
        specific_topic=req.specific_topic or "(bebas sesuai kategori)",
    )
    try:
        result = await llm.complete(prompt, max_tokens=1800)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    session = IdeaSession(
        category=req.category,
        audience=req.audience,
        specific_topic=req.specific_topic,
        result=result,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_response(session)


def _to_response(s: IdeaSession) -> IdeasResponse:
    return IdeasResponse(
        id=s.id,
        category=s.category,
        audience=s.audience,
        specific_topic=s.specific_topic,
        result=s.result,
        created_at=s.created_at,
    )


@router.get("/history", response_model=list[IdeasResponse])
def history(db: Session = Depends(get_db)):
    rows = (
        db.query(IdeaSession)
        .order_by(IdeaSession.created_at.desc())
        .limit(20)
        .all()
    )
    return [_to_response(r) for r in rows]


@router.delete("/history/{session_id}")
def delete_history(session_id: int, db: Session = Depends(get_db)):
    s = db.query(IdeaSession).filter(IdeaSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="History tidak ditemukan.")
    db.delete(s)
    db.commit()
    return {"deleted": session_id}
