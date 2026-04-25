import httpx

from ...settings_store import get_value
from .base import ImageProvider, ImageResult, ImageSize


def _with_size(raw_url: str, w: int) -> str:
    """Append width param ke Unsplash raw URL (yang sudah punya ?ixid=...)."""
    if not raw_url:
        return ""
    sep = "&" if "?" in raw_url else "?"
    return f"{raw_url}{sep}w={w}&q=85&fm=jpg&fit=max"


class UnsplashProvider(ImageProvider):
    name = "unsplash"
    BASE = "https://api.unsplash.com"

    async def search(
        self, query: str, page: int = 1, per_page: int = 18
    ) -> list[ImageResult]:
        access_key = get_value("unsplash_access_key")
        if not access_key:
            raise RuntimeError("Unsplash Access Key belum di-set di Setting.")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.BASE}/search/photos",
                headers={
                    "Authorization": f"Client-ID {access_key}",
                    "Accept-Version": "v1",
                },
                params={"query": query, "page": page, "per_page": min(per_page, 30)},
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[ImageResult] = []
        for p in data.get("results", []):
            urls = p.get("urls", {})
            user = p.get("user", {})
            user_links = user.get("links", {})
            links = p.get("links", {})
            raw = urls.get("raw", "")
            full_w = p.get("width", 0)
            full_h = p.get("height", 0)

            sizes: list[ImageSize] = []
            if urls.get("full"):
                sizes.append(ImageSize(label="Original", url=urls["full"], width=full_w))
            if raw:
                sizes.append(ImageSize(label="Large 2400", url=_with_size(raw, 2400), width=2400))
                sizes.append(ImageSize(label="Medium 1920", url=_with_size(raw, 1920), width=1920))
                sizes.append(ImageSize(label="Small 1080", url=_with_size(raw, 1080), width=1080))
                sizes.append(ImageSize(label="Tiny 640", url=_with_size(raw, 640), width=640))
            elif urls.get("regular"):
                sizes.append(ImageSize(label="Regular", url=urls["regular"], width=1080))

            results.append(
                ImageResult(
                    id=str(p["id"]),
                    provider="unsplash",
                    url=urls.get("regular", urls.get("full", "")),
                    thumb=urls.get("small", urls.get("thumb", "")),
                    width=full_w,
                    height=full_h,
                    photographer=user.get("name", ""),
                    photographer_url=user_links.get("html", ""),
                    source_url=links.get("html", ""),
                    alt=p.get("alt_description") or p.get("description") or "",
                    sizes=sizes,
                )
            )
        return results


unsplash = UnsplashProvider()
