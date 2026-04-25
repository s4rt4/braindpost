import asyncio
from dataclasses import asdict
from typing import Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile

from ..image_processing import process as process_image
from ..providers.images.base import ImageProvider, ImageResult
from ..providers.images.pexels import pexels
from ..providers.images.pixabay import pixabay
from ..providers.images.unsplash import unsplash
from ..schemas import ImageItem, ImageSearchResponse

MAX_BYTES = 20 * 1024 * 1024  # 20 MB

router = APIRouter()

PROVIDERS: dict[str, ImageProvider] = {
    "pexels": pexels,
    "unsplash": unsplash,
    "pixabay": pixabay,
}


@router.get("/search", response_model=ImageSearchResponse)
async def search_images(
    q: str = Query(..., min_length=1, max_length=200),
    provider: str = Query("all", pattern="^(pexels|unsplash|pixabay|all|both)$"),
    page: int = Query(1, ge=1, le=20),
    per_page: int = Query(18, ge=1, le=30),
):
    if provider in ("all", "both"):
        targets = list(PROVIDERS.values())
    else:
        targets = [PROVIDERS[provider]]

    async def safe_search(p: ImageProvider) -> tuple[str, list[ImageResult] | Exception]:
        try:
            return p.name, await p.search(q, page=page, per_page=per_page)
        except Exception as e:
            return p.name, e

    pairs = await asyncio.gather(*(safe_search(p) for p in targets))

    results: list[ImageItem] = []
    errors: dict[str, str] = {}
    for name, outcome in pairs:
        if isinstance(outcome, Exception):
            errors[name] = str(outcome)
            continue
        for r in outcome:
            results.append(ImageItem(**asdict(r)))

    # Interleave providers when multi so grid feels mixed
    if provider in ("all", "both") and len(targets) > 1:
        by_provider: dict[str, list[ImageItem]] = {}
        for item in results:
            by_provider.setdefault(item.provider, []).append(item)
        interleaved: list[ImageItem] = []
        i = 0
        while True:
            added = False
            for name in PROVIDERS:
                lst = by_provider.get(name, [])
                if i < len(lst):
                    interleaved.append(lst[i])
                    added = True
            if not added:
                break
            i += 1
        results = interleaved

    if not results and errors:
        raise HTTPException(status_code=400, detail=errors)

    return ImageSearchResponse(query=q, page=page, results=results, errors=errors)


@router.post("/process")
async def process_endpoint(
    file: Optional[UploadFile] = File(None),
    source_url: Optional[str] = Form(None),
    aspect: str = Form("original"),
    flip: Optional[str] = Form(None),
    grayscale: bool = Form(False),
    max_width: Optional[int] = Form(None),
    fmt: str = Form("webp"),
    quality: int = Form(85),
):
    if file is not None:
        img_bytes = await file.read()
    elif source_url:
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(source_url)
                resp.raise_for_status()
                img_bytes = resp.content
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Gagal fetch URL: {e}")
    else:
        raise HTTPException(
            status_code=400, detail="Butuh upload file atau source_url."
        )

    if len(img_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Gambar terlalu besar (max 20 MB).")
    if not img_bytes:
        raise HTTPException(status_code=400, detail="Input gambar kosong.")

    try:
        out_bytes, content_type = process_image(
            img_bytes,
            aspect=aspect,
            flip=(flip or None),
            grayscale=grayscale,
            max_width=max_width,
            fmt=fmt,
            quality=quality,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {e}")

    headers = {"Content-Disposition": f'inline; filename="braindpost.{fmt}"'}
    return Response(content=out_bytes, media_type=content_type, headers=headers)
