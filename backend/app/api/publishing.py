import httpx
from fastapi import APIRouter, HTTPException

from ..providers.publishing.laravel import laravel_publisher

router = APIRouter()


@router.get("/laravel/test-connection")
async def test_laravel_connection():
    """Hit Laravel /api/v1/health (per BLOG_INTEGRATION.md section 2.1).
    Return rich metadata + status hint untuk Braindpost UI display.
    """
    try:
        url, token = laravel_publisher._config()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async with httpx.AsyncClient(timeout=8) as client:
        try:
            resp = await client.get(
                f"{url}/api/v1/health",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
            )
        except httpx.TimeoutException:
            return {
                "ok": False,
                "state": "timeout",
                "message": "Server slow / tidak respon dalam 8 detik.",
            }
        except httpx.ConnectError as e:
            return {
                "ok": False,
                "state": "unreachable",
                "message": f"Tidak bisa connect ke {url}. Cek URL atau pastikan blog jalan.",
                "error": str(e),
            }
        except Exception as e:
            return {
                "ok": False,
                "state": "error",
                "message": f"Connection error: {e}",
            }

    if resp.status_code == 401:
        return {
            "ok": False,
            "state": "invalid_token",
            "status_code": 401,
            "message": "Token salah. Regenerate di Filament admin → Pengaturan → Braindpost.",
        }
    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After", "60")
        return {
            "ok": False,
            "state": "rate_limited",
            "status_code": 429,
            "message": f"Rate limited. Retry after {retry_after} detik.",
        }
    if resp.status_code == 404:
        return {
            "ok": False,
            "state": "endpoint_not_found",
            "status_code": 404,
            "message": (
                "Endpoint /api/v1/health tidak ada. Laravel mungkin versi lama — "
                "minta Laravel agent update sesuai BLOG_INTEGRATION.md section 2.1."
            ),
        }
    if resp.status_code != 200:
        return {
            "ok": False,
            "state": "unexpected",
            "status_code": resp.status_code,
            "message": f"Unexpected response: {resp.status_code}",
        }

    try:
        data = resp.json()
    except Exception as e:
        return {
            "ok": False,
            "state": "non_json",
            "status_code": 200,
            "message": f"Response bukan JSON: {e}",
        }

    blog_mode = data.get("blog_mode", "unknown")
    state = "production" if blog_mode == "production" else (
        "staging" if blog_mode == "staging" else "connected"
    )

    return {
        "ok": True,
        "state": state,
        "status_code": 200,
        "message": (
            f"Terhubung ke {data.get('blog_name', 'Unknown')}"
            + (" (STAGING — tidak ke-index Google)" if blog_mode == "staging" else "")
        ),
        "blog_name": data.get("blog_name"),
        "blog_url": data.get("blog_url"),
        "blog_mode": blog_mode,
        "api_version": data.get("api_version"),
        "timezone": data.get("timezone"),
        "server_time": data.get("server_time"),
        "limits": data.get("limits", {}),
    }
