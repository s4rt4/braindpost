import httpx

from ...config import settings as env_settings
from ...settings_store import get_value
from .base import LLMProvider


def _resolve(key: str, env_default: str) -> str:
    """Prefer DB-stored setting, fallback to .env value."""
    return get_value(key) or env_default


class DeepSeekProvider(LLMProvider):
    async def complete(
        self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7
    ) -> str:
        api_key = _resolve("deepseek_api_key", env_settings.deepseek_api_key)
        base_url = _resolve("deepseek_base_url", env_settings.deepseek_base_url).rstrip("/")
        model = _resolve("deepseek_model", env_settings.deepseek_model)

        if not api_key:
            raise RuntimeError(
                "DeepSeek API key belum di-set. Buka halaman Setting di sidebar."
            )

        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


llm = DeepSeekProvider()
