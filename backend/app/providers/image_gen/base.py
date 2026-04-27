from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class GeneratedImage:
    url: str  # URL hasil gen (CDN dari provider, valid sementara)
    width: int
    height: int
    seed: int = 0
    model: str = ""
    cost_usd: float = 0.0  # estimasi biaya per image (untuk display)


class ImageGenProvider(ABC):
    """Abstract image generation provider — Fal.ai, OpenAI DALL-E, Replicate, dll."""

    name: str

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        aspect: str = "16:9",
    ) -> GeneratedImage:
        """Generate satu image dari text prompt.

        aspect: '16:9' (landscape, default untuk hero blog) | '1:1' (square) |
        '9:16' (portrait) | '4:3' | '3:2'
        """
        ...
