"""
APScheduler — actualización automática de datos y análisis.
"""

import logging
import os
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import SessionLocal
from .ingestor import fetch_privatization_events_sync, fetch_waiting_lists_sync
from .models import AnalysisResult, PrivatizacionEvent, WaitingRecord

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler(timezone="Europe/Madrid")


def fetch_and_store_data() -> dict:
    """Descarga datos del SAS y BOJA y los persiste en SQLite."""
    logger.info("Scheduler: iniciando fetch de datos")
    db = SessionLocal()
    records_added = 0
    events_added = 0

    try:
        waiting_data = fetch_waiting_lists_sync()
        events_data = fetch_privatization_events_sync()

        for item in waiting_data:
            exists = (
                db.query(WaitingRecord)
                .filter(
                    WaitingRecord.fecha == item["fecha"],
                    WaitingRecord.provincia == item["provincia"],
                    WaitingRecord.especialidad == item["especialidad"],
                )
                .first()
            )
            if not exists:
                db.add(WaitingRecord(**item))
                records_added += 1

        for item in events_data:
            exists = (
                db.query(PrivatizacionEvent)
                .filter(
                    PrivatizacionEvent.fecha == item["fecha"],
                    PrivatizacionEvent.descripcion == item["descripcion"],
                )
                .first()
            )
            if not exists:
                db.add(PrivatizacionEvent(**item))
                events_added += 1

        db.commit()
    except Exception as exc:
        logger.error("fetch_and_store_data falló: %s", exc)
        db.rollback()
    finally:
        db.close()

    logger.info(
        "Scheduler: fetch completado — %d registros nuevos, %d eventos nuevos",
        records_added,
        events_added,
    )
    return {"records_added": records_added, "events_added": events_added}


def run_scheduled_analysis() -> None:
    """Ejecuta el análisis estadístico completo."""
    logger.info("Scheduler: iniciando análisis")
    db = SessionLocal()
    try:
        from .analysis import run_analysis
        results = run_analysis(db)
        logger.info("Scheduler: análisis completado — %d resultados", len(results))
    except ImportError as exc:
        logger.warning("chrono-correlator no disponible: %s", exc)
    except Exception as exc:
        logger.error("run_scheduled_analysis falló: %s", exc)
    finally:
        db.close()


def cleanup_old_results() -> None:
    """Elimina resultados de análisis con más de 90 días."""
    logger.info("Scheduler: limpieza de resultados antiguos")
    db = SessionLocal()
    try:
        cutoff = datetime.now() - timedelta(days=90)
        deleted = (
            db.query(AnalysisResult)
            .filter(AnalysisResult.ejecutado_en < cutoff)
            .delete()
        )
        db.commit()
        logger.info("Scheduler: %d resultados eliminados", deleted)
    except Exception as exc:
        logger.error("cleanup_old_results falló: %s", exc)
        db.rollback()
    finally:
        db.close()


def start_scheduler() -> None:
    refresh_hour = int(os.getenv("DATA_REFRESH_HOUR", "3"))
    analysis_hour = int(os.getenv("ANALYSIS_HOUR", "4"))

    _scheduler.add_job(
        fetch_and_store_data,
        trigger=CronTrigger(hour=refresh_hour, minute=0),
        id="fetch_and_store_data",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        run_scheduled_analysis,
        trigger=CronTrigger(hour=analysis_hour, minute=0),
        id="run_analysis",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    _scheduler.add_job(
        cleanup_old_results,
        trigger=CronTrigger(day_of_week="sun", hour=2, minute=30),
        id="cleanup_old_results",
        replace_existing=True,
        misfire_grace_time=7200,
    )

    _scheduler.start()
    logger.info(
        "Scheduler iniciado — fetch a las %02d:00, análisis a las %02d:00",
        refresh_hour,
        analysis_hour,
    )


def stop_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
