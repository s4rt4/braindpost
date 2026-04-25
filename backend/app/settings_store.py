from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import Setting


def _get_with_db(db: Session, key: str, default: str = "") -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if (row and row.value) else default


def get_value(key: str, default: str = "") -> str:
    """Standalone read — opens its own DB session. Safe to call anywhere."""
    with SessionLocal() as db:
        return _get_with_db(db, key, default)


def get_value_with_db(db: Session, key: str, default: str = "") -> str:
    return _get_with_db(db, key, default)


def set_value_with_db(db: Session, key: str, value: str) -> None:
    """Upsert. Caller is responsible for db.commit()."""
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
