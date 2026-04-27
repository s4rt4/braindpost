from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..providers.research.tavily import tavily

router = APIRouter()


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=400)
    max_results: int = Field(default=5, ge=1, le=10)
    depth: str = Field(default="basic", pattern="^(basic|advanced)$")


@router.post("/search")
async def search_research(req: ResearchRequest):
    try:
        results = await tavily.search(
            req.query, max_results=req.max_results, depth=req.depth
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tavily error: {e}")

    return {
        "query": req.query,
        "depth": req.depth,
        "count": len(results),
        "results": [asdict(r) for r in results],
    }
