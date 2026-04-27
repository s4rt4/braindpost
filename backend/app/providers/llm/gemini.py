import httpx

from ...settings_store import get_value
from .base import LLMProvider


class GeminiProvider(LLMProvider):
    """Google Gemini via Generative Language API.
    Docs: https://ai.google.dev/api/generate-content
    """

    name = "gemini"
    BASE = "https://generativelanguage.googleapis.com/v1beta"

    async def complete(
        self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7
    ) -> str:
        api_key = get_value("gemini_api_key", "")
        model = get_value("gemini_model", "gemini-2.0-flash-exp")

        if not api_key:
            raise RuntimeError(
                "Gemini API key belum di-set. Buka Setting → AI / LLM."
            )

        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{self.BASE}/models/{model}:generateContent",
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "maxOutputTokens": max_tokens,
                        "temperature": temperature,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()

        # Gemini response shape: candidates[0].content.parts[0].text
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                # Bisa terjadi kalau prompt diblokir safety filter
                feedback = data.get("promptFeedback", {})
                block_reason = feedback.get("blockReason", "unknown")
                raise RuntimeError(
                    f"Gemini tidak return candidates. Block reason: {block_reason}"
                )
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)
            if not text.strip():
                finish_reason = candidates[0].get("finishReason", "unknown")
                raise RuntimeError(
                    f"Gemini return empty text. Finish reason: {finish_reason}"
                )
            return text
        except (KeyError, IndexError, TypeError) as e:
            raise RuntimeError(f"Gemini response parse error: {e} | raw: {data}")


gemini = GeminiProvider()
