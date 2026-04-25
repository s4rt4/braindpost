import httpx

from ...settings_store import get_value
from .base import ImageProvider, ImageResult, ImageSize


class PexelsProvider(ImageProvider):
    name = "pexels"
    BASE = "https://api.pexels.com/v1"

    async def search(
        self, query: str, page: int = 1, per_page: int = 18
    ) -> list[ImageResult]:
        api_key = get_value("pexels_api_key")
        if not api_key:
            raise RuntimeError("Pexels API key belum di-set di Setting.")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.BASE}/search",
                headers={"Authorization": api_key},
                params={"query": query, "page": page, "per_page": per_page},
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[ImageResult] = []
        for p in data.get("photos", []):
            src = p.get("src", {})
            full_w = p.get("width", 0)
            full_h = p.get("height", 0)

            # Pexels src variants — width hint diestimasi.
            # original = ukuran asli; large2x ≈ 1880w; large ≈ 940w; medium ≈ 350h; small ≈ 130h
            sizes: list[ImageSize] = []
            if src.get("original"):
                sizes.append(ImageSize(label="Original", url=src["original"], width=full_w))
            if src.get("large2x"):
                sizes.append(ImageSize(label="Large 2x", url=src["large2x"], width=1880))
            if src.get("large"):
                sizes.append(ImageSize(label="Large", url=src["large"], width=940))
            if src.get("medium"):
                sizes.append(ImageSize(label="Medium", url=src["medium"], width=0))
            if src.get("small"):
                sizes.append(ImageSize(label="Small", url=src["small"], width=0))

            results.append(
                ImageResult(
                    id=str(p["id"]),
                    provider="pexels",
                    url=src.get("large", src.get("original", "")),
                    thumb=src.get("medium", src.get("small", "")),
                    width=full_w,
                    height=full_h,
                    photographer=p.get("photographer", ""),
                    photographer_url=p.get("photographer_url", ""),
                    source_url=p.get("url", ""),
                    alt=p.get("alt", ""),
                    sizes=sizes,
                )
            )
        return results


pexels = PexelsProvider()
