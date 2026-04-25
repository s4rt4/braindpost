from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self, prompt: str, max_tokens: int = 2000, temperature: float = 0.7
    ) -> str:
        ...
