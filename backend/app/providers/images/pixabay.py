import httpx

from ...settings_store import get_value
from .base import ImageProvider, ImageResult, ImageSize


class PixabayProvider(ImageProvider):
    name = "pixabay"
    BASE = "https://pixabay.com/api/"

    async def search(
        self, query: str, page: int = 1, per_page: int = 18
    ) -> list[ImageResult]:
        api_key = get_value("pixabay_api_key")
        if not api_key:
            raise RuntimeError("Pixabay API key belum di-set di Setting.")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                self.BASE,
                params={
                    "key": api_key,
                    "q": query,
                    "page": page,
                    "per_page": max(3, min(per_page, 200)),
                    "image_type": "photo",
                    "safesearch": "true",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[ImageResult] = []
        for p in data.get("hits", []):
            full_w = p.get("imageWidth", 0)
            full_h = p.get("imageHeight", 0)
            user = p.get("user", "")
            user_id = p.get("user_id", "")

            sizes: list[ImageSize] = []
            if p.get("largeImageURL"):
                sizes.append(
                    ImageSize(label="Large 1280", url=p["largeImageURL"], width=1280)
                )
            if p.get("webformatURL"):
                sizes.append(
                    ImageSize(
                        label=f"Web {p.get('webformatWidth', 640)}",
                        url=p["webformatURL"],
                        width=p.get("webformatWidth", 640),
                    )
                )
            if p.get("previewURL"):
                sizes.append(
                    ImageSize(
                        label=f"Preview {p.get('previewWidth', 150)}",
                        url=p["previewURL"],
                        width=p.get("previewWidth", 150),
                    )
                )

            photographer_url = (
                f"https://pixabay.com/users/{user}-{user_id}/" if user_id else ""
            )

            results.append(
                ImageResult(
                    id=str(p["id"]),
                    provider="pixabay",
                    url=p.get("largeImageURL", p.get("webformatURL", "")),
                    thumb=p.get("webformatURL", p.get("previewURL", "")),
                    width=full_w,
                    height=full_h,
                    photographer=user,
                    photographer_url=photographer_url,
                    source_url=p.get("pageURL", ""),
                    alt=p.get("tags", ""),
                    sizes=sizes,
                )
            )
        return results


pixabay = PixabayProvider()
