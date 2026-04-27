import httpx

from ...settings_store import get_value
from .base import GeneratedImage, ImageGenProvider


# Fal.ai aspect ratio → image_size mapping
# Per https://fal.ai/models/fal-ai/flux/schnell/api
ASPECT_TO_SIZE: dict[str, str] = {
    "1:1": "square_hd",          # 1024x1024
    "16:9": "landscape_16_9",    # 1024x576 atau 1920x1080-ish
    "9:16": "portrait_16_9",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
}


class FalFluxProvider(ImageGenProvider):
    """Fal.ai Flux Schnell — paling cepat (1-2s) dan paling murah ($0.003/image).
    Default model untuk featured image generation di Braindpost.
    Docs: https://fal.ai/models/fal-ai/flux/schnell/api
    """

    name = "fal-flux-schnell"
    BASE = "https://fal.run/fal-ai/flux/schnell"
    COST_PER_IMAGE = 0.003

    async def generate(
        self, prompt: str, aspect: str = "16:9"
    ) -> GeneratedImage:
        api_key = get_value("fal_api_key", "")
        if not api_key:
            raise RuntimeError(
                "Fal.ai API key belum di-set. Buka Setting → Image Generation."
            )

        image_size = ASPECT_TO_SIZE.get(aspect, "landscape_16_9")

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                self.BASE,
                headers={
                    "Authorization": f"Key {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": prompt,
                    "image_size": image_size,
                    "num_inference_steps": 4,  # Schnell optimal: 1-4 steps
                    "num_images": 1,
                    "enable_safety_checker": True,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        images = data.get("images", [])
        if not images:
            raise RuntimeError(
                f"Fal.ai tidak return images. Detail: {data.get('detail', data)}"
            )

        first = images[0]
        return GeneratedImage(
            url=first.get("url", ""),
            width=first.get("width", 0),
            height=first.get("height", 0),
            seed=int(data.get("seed", 0)),
            model=self.name,
            cost_usd=self.COST_PER_IMAGE,
        )


fal_flux = FalFluxProvider()
