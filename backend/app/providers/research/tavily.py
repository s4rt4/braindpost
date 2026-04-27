import httpx

from ...settings_store import get_value
from .base import ResearchProvider, ResearchResult


class TavilyProvider(ResearchProvider):
    """Tavily Search API — purpose-built untuk AI agent.
    Free tier: 1000 req/bulan. Pricing setelahnya: $0.001/search basic.
    Docs: https://docs.tavily.com/api-reference/endpoint/search
    """

    name = "tavily"
    BASE = "https://api.tavily.com"

    async def search(
        self, query: str, max_results: int = 5, depth: str = "basic"
    ) -> list[ResearchResult]:
        api_key = get_value("tavily_api_key", "")
        if not api_key:
            raise RuntimeError(
                "Tavily API key belum di-set. Buka Setting → Research."
            )

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.BASE}/search",
                headers={"Content-Type": "application/json"},
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": max(1, min(max_results, 20)),
                    "search_depth": depth if depth in ("basic", "advanced") else "basic",
                    "include_answer": False,
                    "include_raw_content": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[ResearchResult] = []
        for r in data.get("results", []):
            results.append(
                ResearchResult(
                    title=r.get("title", ""),
                    url=r.get("url", ""),
                    snippet=r.get("content", "")[:400],
                    score=float(r.get("score", 0.0)),
                    published_date=r.get("published_date", "") or "",
                )
            )
        return results


tavily = TavilyProvider()
