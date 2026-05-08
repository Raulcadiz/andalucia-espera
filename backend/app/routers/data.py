from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..ingestor import ESPECIALIDADES, PROVINCIAS
from ..models import PrivatizacionEvent, WaitingRecord
from ..scheduler import fetch_and_store_data

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/waiting-lists")
def get_waiting_lists(
    db: Annotated[Session, Depends(get_db)],
    provincia: str | None = Query(None),
    especialidad: str | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    q = db.query(WaitingRecord)
    if provincia:
        q = q.filter(WaitingRecord.provincia == provincia)
    if especialidad:
        q = q.filter(WaitingRecord.especialidad == especialidad)
    if desde:
        q = q.filter(WaitingRecord.fecha >= desde)
    if hasta:
        q = q.filter(WaitingRecord.fecha <= hasta)
    q = q.order_by(WaitingRecord.fecha.desc())
    total = q.count()
    records = q.offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                "id": r.id,
                "fecha": r.fecha.isoformat(),
                "provincia": r.provincia,
                "especialidad": r.especialidad,
                "pacientes_espera": r.pacientes_espera,
                "demora_media_dias": r.demora_media_dias,
                "fuente": r.fuente,
            }
            for r in records
        ],
    }


@router.get("/events")
def get_events(db: Annotated[Session, Depends(get_db)]):
    events = db.query(PrivatizacionEvent).order_by(PrivatizacionEvent.fecha).all()
    return [
        {
            "id": e.id,
            "fecha": e.fecha.isoformat(),
            "tipo": e.tipo,
            "descripcion": e.descripcion,
            "consejeria": e.consejeria,
            "importe_euros": e.importe_euros,
            "fuente_url": e.fuente_url,
        }
        for e in events
    ]


@router.get("/provinces")
def get_provinces(db: Annotated[Session, Depends(get_db)]):
    stored = (
        db.query(WaitingRecord.provincia)
        .distinct()
        .order_by(WaitingRecord.provincia)
        .all()
    )
    if stored:
        return [row[0] for row in stored]
    return sorted(PROVINCIAS)


@router.get("/specialties")
def get_specialties(db: Annotated[Session, Depends(get_db)]):
    stored = (
        db.query(WaitingRecord.especialidad)
        .distinct()
        .order_by(WaitingRecord.especialidad)
        .all()
    )
    if stored:
        return [row[0] for row in stored]
    return sorted(ESPECIALIDADES)


@router.post("/refresh")
def refresh_data():
    result = fetch_and_store_data()
    return {"status": "ok", **result}
