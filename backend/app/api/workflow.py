from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import WorkflowProgress
from ..schemas import WorkflowProgressResponse, WorkflowProgressUpdate

router = APIRouter()


@router.get("/progress", response_model=WorkflowProgressResponse)
def get_progress(db: Session = Depends(get_db)):
    rows = db.query(WorkflowProgress).all()
    return WorkflowProgressResponse(completed=[r.step_num for r in rows])


@router.post("/progress", response_model=WorkflowProgressResponse)
def set_progress(body: WorkflowProgressUpdate, db: Session = Depends(get_db)):
    existing = (
        db.query(WorkflowProgress)
        .filter(WorkflowProgress.step_num == body.step_num)
        .first()
    )
    if body.completed:
        if not existing:
            db.add(
                WorkflowProgress(
                    step_num=body.step_num,
                    completed=True,
                    completed_at=datetime.utcnow(),
                )
            )
            db.commit()
    else:
        if existing:
            db.delete(existing)
            db.commit()

    rows = db.query(WorkflowProgress).all()
    return WorkflowProgressResponse(completed=[r.step_num for r in rows])


@router.delete("/progress", response_model=WorkflowProgressResponse)
def reset_progress(db: Session = Depends(get_db)):
    db.query(WorkflowProgress).delete()
    db.commit()
    return WorkflowProgressResponse(completed=[])
