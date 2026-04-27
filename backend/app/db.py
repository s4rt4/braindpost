from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ===== Lightweight migration helper =====
# Run-on-startup ALTER TABLE untuk kolom yang ditambahkan setelah initial schema.
# Cuma jalan untuk SQLite — production sebaiknya pakai Alembic.

# Format: (table_name, column_name, column_def_sql)
_PENDING_COLUMNS: list[tuple[str, str, str]] = [
    # Sprint Laravel autopost (2026-04-27)
    ("drafts", "publishing_meta", "TEXT"),
    ("drafts", "published_url", "VARCHAR(500)"),
    ("drafts", "laravel_post_id", "INTEGER"),
    ("drafts", "published_at_blog", "DATETIME"),
]


def run_lightweight_migrations(eng: Engine) -> list[str]:
    """ALTER TABLE ADD COLUMN untuk setiap entry di _PENDING_COLUMNS yang belum ada.
    Idempotent. Return list kolom yang baru ditambahkan."""
    if not str(eng.url).startswith("sqlite"):
        return []  # skip non-sqlite — pakai Alembic

    added: list[str] = []
    inspector = inspect(eng)
    with eng.begin() as conn:
        for table, col, col_def in _PENDING_COLUMNS:
            if not inspector.has_table(table):
                continue  # akan dibuat oleh create_all
            existing = {c["name"] for c in inspector.get_columns(table)}
            if col in existing:
                continue
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{col}" {col_def}'))
            added.append(f"{table}.{col}")
    return added
