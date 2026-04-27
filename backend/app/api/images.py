import asyncio
from dataclasses import asdict
from typing import Optional

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel, Field

from ..image_processing import process as process_image
from ..providers.image_gen.fal import fal_flux
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
    crop_x: Optional[int] = Form(None),
    crop_y: Optional[int] = Form(None),
    crop_w: Optional[int] = Form(None),
    crop_h: Optional[int] = Form(None),
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

    crop_box = None
    if all(v is not None for v in (crop_x, crop_y, crop_w, crop_h)):
        crop_box = (crop_x, crop_y, crop_w, crop_h)

    try:
        out_bytes, content_type = process_image(
            img_bytes,
            crop_box=crop_box,
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


# ===== AI Image Generation (Fal.ai Flux Schnell) =====

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=500)
    aspect: str = Field(default="16:9", pattern="^(1:1|16:9|9:16|4:3|3:4)$")


@router.post("/generate")
async def generate_image(req: GenerateRequest):
    try:
        result = await fal_flux.generate(req.prompt, aspect=req.aspect)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image generation error: {e}")

    return {
        "url": result.url,
        "width": result.width,
        "height": result.height,
        "seed": result.seed,
        "model": result.model,
        "cost_usd": result.cost_usd,
        "prompt": req.prompt,
    }
