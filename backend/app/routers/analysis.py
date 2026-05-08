from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisResult

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/latest")
def get_latest(db: Annotated[Session, Depends(get_db)]):
    results = (
        db.query(AnalysisResult)
        .order_by(AnalysisResult.ejecutado_en.desc())
        .limit(200)
        .all()
    )
    return [_serialize(r) for r in results]


@router.post("/run")
def run_analysis_endpoint(
    db: Annotated[Session, Depends(get_db)],
    provincia: str | None = Body(None),
    especialidad: str | None = Body(None),
):
    try:
        from ..analysis import run_analysis
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        results = run_analysis(db, provincia=provincia, especialidad=especialidad)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "ok", "results": results, "count": len(results)}


@router.get("/history")
def get_history(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 500,
    offset: int = 0,
):
    total = db.query(AnalysisResult).count()
    results = (
        db.query(AnalysisResult)
        .order_by(AnalysisResult.ejecutado_en.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "items": [_serialize(r) for r in results],
    }


def _serialize(r: AnalysisResult) -> dict:
    return {
        "id": r.id,
        "ejecutado_en": r.ejecutado_en.isoformat() if r.ejecutado_en else None,
        "metrica": r.metrica,
        "provincia": r.provincia,
        "especialidad": r.especialidad,
        "p_value": r.p_value,
        "effect_size": r.effect_size,
        "signal_strength": r.signal_strength,
        "narrative": r.narrative,
        "lookback_hours": r.lookback_hours,
        "n_events": r.n_events,
    }
