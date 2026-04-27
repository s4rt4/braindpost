from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ResearchResult:
    title: str
    url: str
    snippet: str
    score: float = 0.0
    published_date: str = ""


class ResearchProvider(ABC):
    """Abstract web research provider — Tavily, SerpAPI, Brave Search, dll."""

    name: str

    @abstractmethod
    async def search(
        self, query: str, max_results: int = 5, depth: str = "basic"
    ) -> list[ResearchResult]:
        """Web search untuk fact-checking + sumber referensi.

        depth: 'basic' (cepat) atau 'advanced' (lebih deep + lebih mahal)
        """
        ...
