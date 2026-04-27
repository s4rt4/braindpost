from abc import ABC, abstractmethod
from typing import Any


class PublishingProvider(ABC):
    """Abstract publishing target — Laravel blog, WordPress, Ghost, dll."""

    name: str

    @abstractmethod
    async def create_or_update(
        self, payload: dict[str, Any], force: bool = False
    ) -> dict[str, Any]:
        """POST artikel ke target. Return response dict (id, status, admin_url, dst)."""
        ...

    @abstractmethod
    async def get_status(self, post_id: int) -> dict[str, Any]:
        """GET status artikel di target. Untuk polling background job processing."""
        ...
