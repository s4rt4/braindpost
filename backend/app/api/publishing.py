import httpx
from fastapi import APIRouter, HTTPException

from ..providers.publishing.laravel import laravel_publisher

router = APIRouter()


@router.get("/laravel/test-connection")
async def test_laravel_connection():
    """Smoke test ke Laravel blog: GET /api/v1/posts/0 — expect 404 kalau auth OK,
    401 kalau token invalid. Cara aman cek koneksi tanpa create artikel test."""
    try:
        url, token = laravel_publisher._config()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(
                f"{url}/api/v1/posts/0",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
        except httpx.ConnectError as e:
            return {
                "ok": False,
                "status_code": 0,
                "message": f"Tidak bisa connect ke {url}. Cek URL atau pastikan blog jalan. ({e})",
            }
        except Exception as e:
            return {
                "ok": False,
                "status_code": 0,
                "message": f"Connection error: {e}",
            }

    if resp.status_code == 401:
        return {
            "ok": False,
            "status_code": 401,
            "message": "Token invalid. Cek token di Filament admin → Pengaturan.",
        }
    if resp.status_code in (200, 404):
        # 404 = expected (id=0 tidak ada), tapi auth-nya valid
        return {
            "ok": True,
            "status_code": resp.status_code,
            "message": (
                "Connection OK — URL & token valid."
                if resp.status_code == 404
                else "Connection OK."
            ),
            "url": url,
        }
    return {
        "ok": False,
        "status_code": resp.status_code,
        "message": f"Unexpected response: {resp.status_code}",
    }
