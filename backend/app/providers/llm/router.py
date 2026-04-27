from ...settings_store import get_value
from .base import LLMProvider
from .deepseek import DeepSeekProvider
from .gemini import GeminiProvider


class LLMRouter(LLMProvider):
    """Smart router — baca setting `llm_provider` di tiap call, route ke adapter
    yang dipilih user. Singleton — diekspor sebagai `llm` (drop-in replacement
    untuk import dari deepseek.py)."""

    name = "router"

    def __init__(self) -> None:
        self._providers: dict[str, LLMProvider] = {
            "deepseek": DeepSeekProvider(),
            "gemini": GeminiProvider(),
        }

    def _active(self) -> LLMProvider:
        active_name = get_value("llm_provider", "deepseek").lower().strip()
        provider = self._providers.get(active_name)
        if provider is None:
            raise RuntimeError(
                f"LLM provider '{active_name}' tidak dikenal. "
                f"Pilihan: {sorted(self._providers.keys())}. Cek Setting."
            )
        return provider

    async def complete(
        self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7
    ) -> str:
        return await self._active().complete(prompt, max_tokens, temperature)


llm = LLMRouter()
