from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ImageSize:
    label: str
    url: str
    width: int = 0


@dataclass
class ImageResult:
    id: str
    provider: str          # "pexels" | "unsplash"
    url: str               # display URL untuk modal preview
    thumb: str             # thumbnail untuk grid
    width: int
    height: int
    photographer: str
    photographer_url: str
    source_url: str
    alt: str
    sizes: list[ImageSize] = field(default_factory=list)


class ImageProvider(ABC):
    name: str

    @abstractmethod
    async def search(
        self, query: str, page: int = 1, per_page: int = 18
    ) -> list[ImageResult]:
        ...
