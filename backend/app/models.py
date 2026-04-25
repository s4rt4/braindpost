from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class IdeaSession(Base):
    __tablename__ = "idea_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(100))
    audience: Mapped[str] = mapped_column(String(100))
    specific_topic: Mapped[str] = mapped_column(String(500), default="")
    result: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    content_md: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(50), default="")
    content_type: Mapped[str] = mapped_column(String(50), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CalendarEntry(Base):
    __tablename__ = "calendar_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD
    title: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(50), default="article")
    notes: Mapped[str] = mapped_column(Text, default="")


class WorkflowProgress(Base):
    __tablename__ = "workflow_progress"

    id: Mapped[int] = mapped_column(primary_key=True)
    step_num: Mapped[int] = mapped_column(Integer)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
