from typing import Any

import httpx

from ...settings_store import get_value
from .base import PublishingProvider


class LaravelBlogPublisher(PublishingProvider):
    """Adapter ke Laravel blog mengikuti contract di docs/BLOG_INTEGRATION.md."""

    name = "laravel"

    def _config(self) -> tuple[str, str]:
        url = get_value("publishing.laravel_url", "").rstrip("/")
        token = get_value("publishing.laravel_token", "")
        if not url or not token:
            raise RuntimeError(
                "Laravel blog belum dikonfigurasi. Buka Setting → Publishing dan isi URL + token."
            )
        return url, token

    def _headers(self, token: str) -> dict[str, str]:
        # 3 headers wajib per BLOG_INTEGRATION.md section 13.2/13.3
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_or_update(
        self, payload: dict[str, Any], force: bool = False
    ) -> dict[str, Any]:
        url, token = self._config()
        endpoint = f"{url}/api/v1/posts"
        if force:
            endpoint += "?force=true"

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(endpoint, headers=self._headers(token), json=payload)

        # Laravel return JSON di semua error path (per section 13.3)
        try:
            data = resp.json()
        except Exception:
            data = {"error": "non_json_response", "raw": resp.text[:500]}

        return {"_status_code": resp.status_code, **data}

    async def get_status(self, post_id: int) -> dict[str, Any]:
        url, token = self._config()
        endpoint = f"{url}/api/v1/posts/{post_id}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(endpoint, headers=self._headers(token))

        try:
            data = resp.json()
        except Exception:
            data = {"error": "non_json_response", "raw": resp.text[:500]}

        return {"_status_code": resp.status_code, **data}


laravel_publisher = LaravelBlogPublisher()
