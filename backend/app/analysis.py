"""
Wrapper de chrono-correlator.
Detecta asociaciones temporales entre eventos de privatización y listas de espera.
IMPORTANTE: las correlaciones detectadas NO implican causalidad.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from .models import AnalysisResult, PrivatizacionEvent, WaitingRecord

logger = logging.getLogger(__name__)

# Ventana de análisis: 90 días antes/después del evento
LOOKBACK_HOURS = 2160
# Período base para establecer la línea de referencia
BASELINE_DAYS = 365


def _import_chrono():
    """Importa chrono-correlator con mensaje claro si no está instalado."""
    try:
        from chrono_correlator import Event, Metric, evaluate, narrate  # type: ignore
        return Event, Metric, evaluate, narrate
    except ImportError:
        raise ImportError(
            "chrono-correlator no está instalado. "
            "Ejecuta: pip install 'chrono-correlator[all]>=1.2.0'"
        )


def _get_narrative(report: Any, metrica: str) -> str | None:
    """Llama a narrate() si hay señal y hay proveedor LLM configurado."""
    provider = os.getenv("LLM_PROVIDER", "groq")
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        return None

    _, _, _, narrate = _import_chrono()

    system_prompt = (
        "Eres un analista estadístico de datos sanitarios públicos. "
        "Describe el patrón observado en los datos de listas de espera del SAS "
        f"para la métrica '{metrica}'. "
        "Usa solo términos como 'se observa una asociación', 'el patrón sugiere', "
        "'los datos muestran'. "
        "PROHIBIDO usar: 'causa', 'causó', 'privatización es responsable de', "
        "'demuestra', 'prueba'. "
        "Máximo 3 frases en español."
    )

    try:
        narrative = narrate(report, provider=provider, api_key=api_key, prompt=system_prompt)
        return narrative
    except Exception as exc:
        logger.warning("narrate() falló: %s", exc)
        return None


def _extract_signal(report: Any) -> dict[str, Any]:
    """Extrae campos estándar del AlertReport de chrono-correlator."""
    # chrono-correlator >= 1.2.0: report.signal_strength, report.p_value, report.effect_size
    # Manejamos tanto atributos directos como dict
    if hasattr(report, "signal_strength"):
        return {
            "signal_strength": str(report.signal_strength),
            "p_value": float(getattr(report, "p_value", 1.0)),
            "effect_size": float(getattr(report, "effect_size", 0.0)),
            "n_events": int(getattr(report, "n_events", 0)),
        }
    if isinstance(report, dict):
        return {
            "signal_strength": str(report.get("signal_strength", "none")),
            "p_value": float(report.get("p_value", 1.0)),
            "effect_size": float(report.get("effect_size", 0.0)),
            "n_events": int(report.get("n_events", 0)),
        }
    return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "n_events": 0}


def run_analysis(
    db: Session,
    provincia: str | None = None,
    especialidad: str | None = None,
) -> list[dict[str, Any]]:
    """
    Ejecuta el análisis chrono-correlator sobre los datos almacenados.
    Devuelve una lista de resúmenes de AlertReport guardados en la BD.
    """
    Event, Metric, evaluate, _ = _import_chrono()

    cutoff = datetime.now() - timedelta(days=5 * 365)

    # Carga eventos de privatización
    events_q = db.query(PrivatizacionEvent).filter(
        PrivatizacionEvent.fecha >= cutoff.date()
    ).all()
    if not events_q:
        logger.info("Sin eventos de privatización almacenados — análisis omitido")
        return []

    cc_events = [
        Event(date=datetime.combine(e.fecha, datetime.min.time()), label=e.descripcion)
        for e in events_q
    ]

    # Filtra registros según parámetros opcionales
    records_q = db.query(WaitingRecord).filter(WaitingRecord.fecha >= cutoff.date())
    if provincia:
        records_q = records_q.filter(WaitingRecord.provincia == provincia)
    if especialidad:
        records_q = records_q.filter(WaitingRecord.especialidad == especialidad)

    records = records_q.order_by(WaitingRecord.fecha).all()
    if not records:
        logger.info("Sin registros de espera — análisis omitido")
        return []

    # Agrupa por combinación provincia+especialidad
    from collections import defaultdict
    groups: dict[tuple[str, str], list[WaitingRecord]] = defaultdict(list)
    for r in records:
        groups[(r.provincia, r.especialidad)].append(r)

    results = []
    for (prov, espec), recs in groups.items():
        series = [
            (datetime.combine(r.fecha, datetime.min.time()), r.demora_media_dias)
            for r in recs
        ]
        if len(series) < 4:
            continue

        metric = Metric(
            name=f"demora_media_dias:{prov}:{espec}",
            series=series,
        )

        try:
            report = evaluate(
                metrics=[metric],
                events=cc_events,
                lookback_hours=LOOKBACK_HOURS,
                baseline_days=BASELINE_DAYS,
            )
        except Exception as exc:
            logger.warning("evaluate() falló para %s/%s: %s", prov, espec, exc)
            continue

        extracted = _extract_signal(report)
        metrica_label = f"demora_media_dias:{prov}:{espec}"

        narrative = None
        if extracted["signal_strength"] != "none":
            narrative = _get_narrative(report, metrica_label)

        ar = AnalysisResult(
            metrica=metrica_label,
            provincia=prov,
            especialidad=espec,
            p_value=extracted["p_value"],
            effect_size=extracted["effect_size"],
            signal_strength=extracted["signal_strength"],
            narrative=narrative,
            lookback_hours=LOOKBACK_HOURS,
            n_events=extracted["n_events"],
        )
        db.add(ar)
        results.append(
            {
                "provincia": prov,
                "especialidad": espec,
                "signal_strength": extracted["signal_strength"],
                "p_value": extracted["p_value"],
                "effect_size": extracted["effect_size"],
                "n_events": extracted["n_events"],
            }
        )

    db.commit()
    logger.info("Análisis completado: %d combinaciones evaluadas", len(results))
    return results
