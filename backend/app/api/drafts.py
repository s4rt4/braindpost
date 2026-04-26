import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Draft
from ..providers.llm.deepseek import llm
from ..schemas import (
    DraftGenerateRequest,
    DraftListItem,
    DraftResponse,
    DraftUpdateRequest,
    LinkSuggestion,
    LinkSuggestionsResponse,
    PolicyCheckResponse,
    SeoSnippetResponse,
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


ALLOWED_STATUSES = {"draft", "revisi", "siap_publish", "published"}


def _to_response(d: Draft) -> DraftResponse:
    return DraftResponse(
        id=d.id,
        title=d.title,
        content_md=d.content_md,
        content_type=d.content_type,
        tone=d.tone,
        notes=d.notes,
        status=d.status,
        published_at=d.published_at,
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
            status=d.status,
            published_at=d.published_at,
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

    payload = req.model_dump(exclude_unset=True)

    if "status" in payload:
        if payload["status"] not in ALLOWED_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Status tidak valid: {payload['status']}. "
                f"Pilihan: {sorted(ALLOWED_STATUSES)}",
            )
        # Auto-stamp published_at saat transisi pertama ke "published";
        # clear kalau pindah ke status lain (supaya tidak misleading di Readiness counter).
        if payload["status"] == "published" and d.status != "published":
            d.published_at = datetime.utcnow()
        elif payload["status"] != "published" and d.status == "published":
            d.published_at = None

    for field, value in payload.items():
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


# ===== M2 — YMYL / AdSense Policy Pattern Detection =====
# CRITICAL: Prompt frame sebagai INFO, bukan VERDICT.
# AI tidak diizinkan bilang "konten ini aman" / "tidak aman".

POLICY_PROMPT = """Kamu adalah asisten REVIEW konten. Tugas kamu BUKAN memutuskan apakah konten ini "aman" atau "tidak" untuk monetisasi. Tugas kamu adalah MENGIDENTIFIKASI POLA yang biasanya butuh disclaimer di blog yang berniat di-monetisasi via Google AdSense.

Kategori YMYL (Your Money Your Life) yang biasanya butuh perhatian:
- medical: klaim medis / kesehatan (mis: efek obat, diagnosis, rekomendasi treatment)
- financial: saran finansial spesifik (mis: rekomendasi investasi, prediksi pasar)
- legal: saran hukum spesifik (mis: hak waris, prosedur litigasi)
- safety: klaim keselamatan / keamanan (mis: prosedur listrik, penggunaan zat kimia)

Untuk setiap pola yang kamu deteksi, return dalam format JSON valid:
{{
  "patterns": [
    {{
      "category": "medical|financial|legal|safety",
      "excerpt": "kutipan singkat 1-2 kalimat dari teks",
      "note": "alasan singkat kenapa pola ini biasanya butuh disclaimer",
      "suggested_disclaimer": "contoh kalimat disclaimer yang bisa ditambahkan"
    }}
  ],
  "summary": "ringkasan 1 kalimat netral tentang apa yang ditemukan"
}}

ATURAN KETAT:
- JANGAN kasih verdict "konten ini aman" atau "konten ini berisiko".
- JANGAN bilang "lolos AdSense" atau "ditolak AdSense".
- HANYA identifikasi pola dan saran disclaimer.
- Kalau tidak ada pola YMYL terdeteksi, return patterns: [] dengan summary yang bilang konten tidak masuk kategori YMYL.

Konten artikel:
---
{content}
---

Output HANYA JSON valid, tanpa markdown code block atau penjelasan tambahan."""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


@router.post("/{draft_id}/policy-check", response_model=PolicyCheckResponse)
async def policy_check(draft_id: int, db: Session = Depends(get_db)):
    d = db.query(Draft).filter(Draft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")
    if not d.content_md.strip():
        raise HTTPException(status_code=400, detail="Konten kosong, tidak ada yang bisa di-check.")

    prompt = POLICY_PROMPT.format(content=d.content_md[:8000])
    try:
        result = await llm.complete(prompt, max_tokens=2000, temperature=0.3)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    try:
        data = json.loads(_strip_code_fences(result))
        return PolicyCheckResponse(**data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI response tidak bisa di-parse sebagai JSON: {e}",
        )


# ===== M4 — Internal Linking Suggestions (TF-IDF lite) =====

STOPWORDS_ID = {
    "yang", "dan", "di", "dari", "ke", "untuk", "ini", "itu", "atau", "dengan",
    "pada", "adalah", "akan", "tidak", "juga", "kita", "kami", "saya", "kamu",
    "anda", "dia", "mereka", "ada", "tapi", "karena", "jika", "agar", "supaya",
    "ya", "oleh", "saat", "ketika", "lebih", "sangat", "bisa", "harus", "perlu",
    "yg", "dlm", "dr", "spt", "the", "a", "an", "is", "of", "to", "in", "on",
    "for", "and", "or",
}


def _tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", " ", text)
    tokens = [t for t in text.split() if len(t) >= 3 and t not in STOPWORDS_ID]
    return tokens


def _slugify(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:80]


@router.get("/{draft_id}/link-suggestions", response_model=LinkSuggestionsResponse)
def link_suggestions(
    draft_id: int, limit: int = 5, db: Session = Depends(get_db)
):
    source = db.query(Draft).filter(Draft.id == draft_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")

    others = db.query(Draft).filter(Draft.id != draft_id).all()
    if not others:
        return LinkSuggestionsResponse(source_id=draft_id, suggestions=[])

    source_tokens = set(_tokenize(source.title + " " + source.content_md[:2000]))
    if not source_tokens:
        return LinkSuggestionsResponse(source_id=draft_id, suggestions=[])

    scored: list[tuple[float, Draft]] = []
    for other in others:
        other_tokens = set(_tokenize(other.title + " " + other.content_md[:2000]))
        if not other_tokens:
            continue
        # Jaccard similarity
        intersection = len(source_tokens & other_tokens)
        union = len(source_tokens | other_tokens)
        if union == 0 or intersection == 0:
            continue
        score = intersection / union
        scored.append((score, other))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[: max(1, min(limit, 20))]

    suggestions = [
        LinkSuggestion(
            draft_id=d.id,
            title=d.title,
            score=round(score, 3),
            suggested_anchor=d.title,
            slug=_slugify(d.title),
        )
        for score, d in top
    ]
    return LinkSuggestionsResponse(source_id=draft_id, suggestions=suggestions)


# ===== #8 — SEO Snippet Generator =====

SEO_PROMPT = """Kamu adalah SEO specialist untuk blog Indonesia.

Generate snippet SEO untuk artikel berikut. Output dalam JSON valid (tanpa markdown):

{{
  "meta_title": "judul SEO maksimal 60 karakter, click-worthy, mengandung keyword utama",
  "meta_description": "deskripsi maksimal 160 karakter, ada call-to-action subtle, mengandung keyword",
  "slug": "url-slug-pendek-deskriptif (lowercase, hyphenated, no special chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}}

ATURAN:
- meta_title HARUS ≤60 karakter (count strictly).
- meta_description HARUS ≤160 karakter (count strictly).
- slug pendek, lowercase, tanpa stopwords, tanpa karakter spesial.
- keywords: 3-5 keyword/phrase relevan, tidak duplicate dengan title.

Judul artikel: {title}
Konten artikel:
---
{content}
---

Output HANYA JSON valid, tanpa markdown code block."""


@router.post("/{draft_id}/seo", response_model=SeoSnippetResponse)
async def generate_seo(draft_id: int, db: Session = Depends(get_db)):
    d = db.query(Draft).filter(Draft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan.")
    if not d.content_md.strip():
        raise HTTPException(status_code=400, detail="Konten kosong.")

    prompt = SEO_PROMPT.format(title=d.title, content=d.content_md[:6000])
    try:
        result = await llm.complete(prompt, max_tokens=800, temperature=0.4)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    try:
        data = json.loads(_strip_code_fences(result))
        return SeoSnippetResponse(**data)
    except (json.JSONDecodeError, ValidationError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI response tidak bisa di-parse: {e}",
        )
