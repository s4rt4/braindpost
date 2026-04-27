import httpx

from ...settings_store import get_value
from .base import LLMProvider


class OpenAIProvider(LLMProvider):
    """OpenAI Chat Completions API.
    Default model: gpt-4o-mini (paling murah: $0.15/1M input, $0.60/1M output).
    Hindari gpt-4o (10x lebih mahal) kecuali butuh quality maksimal.
    Docs: https://platform.openai.com/docs/api-reference/chat
    """

    name = "openai"

    def _config(self) -> tuple[str, str, str]:
        api_key = get_value("openai_api_key", "")
        model = get_value("openai_model", "gpt-4o-mini")
        base_url = get_value("openai_base_url", "https://api.openai.com/v1").rstrip("/")
        return api_key, model, base_url

    async def complete(
        self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7
    ) -> str:
        api_key, model, base_url = self._config()
        if not api_key:
            raise RuntimeError(
                "OpenAI API key belum di-set. Buka Setting → AI / LLM."
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
