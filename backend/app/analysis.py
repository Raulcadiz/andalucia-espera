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

LOOKBACK_HOURS = 2160   # 90 días antes/después del evento
BASELINE_DAYS  = 365    # línea base de 1 año


def _import_chrono():
    try:
        from chrono_correlator import Event, Metric, evaluate, narrate  # type: ignore
        return Event, Metric, evaluate, narrate
    except ImportError:
        raise ImportError(
            "chrono-correlator no está instalado. "
            "Ejecuta: pip install 'chrono-correlator[all]>=1.2.0'"
        )


def run_analysis(
    db: Session,
    provincia: str | None = None,
    especialidad: str | None = None,
) -> list[dict[str, Any]]:
    """
    Ejecuta Mann-Whitney U sobre todas las combinaciones provincia×especialidad.
    Aplica corrección FDR. Guarda AnalysisResult por combinación.
    """
    Event, Metric, evaluate, narrate = _import_chrono()

    cutoff = datetime.now() - timedelta(days=5 * 365)

    # ── Eventos de privatización ──────────────────────────────────────────────
    events_q = db.query(PrivatizacionEvent).filter(
        PrivatizacionEvent.fecha >= cutoff.date()
    ).all()
    if not events_q:
        logger.info("Sin eventos de privatización — análisis omitido")
        return []

    cc_events = [
        Event(
            timestamp=datetime.combine(e.fecha, datetime.min.time()),
            label=e.descripcion,
        )
        for e in events_q
    ]

    # ── Registros de espera ───────────────────────────────────────────────────
    records_q = db.query(WaitingRecord).filter(WaitingRecord.fecha >= cutoff.date())
    if provincia:
        records_q = records_q.filter(WaitingRecord.provincia == provincia)
    if especialidad:
        records_q = records_q.filter(WaitingRecord.especialidad == especialidad)

    records = records_q.order_by(WaitingRecord.fecha).all()
    if not records:
        logger.info("Sin registros de espera — análisis omitido")
        return []

    # ── Agrupar por provincia × especialidad ─────────────────────────────────
    from collections import defaultdict
    groups: dict[tuple[str, str], list[WaitingRecord]] = defaultdict(list)
    for r in records:
        groups[(r.provincia, r.especialidad)].append(r)

    # ── Construir Metric por cada combinación ─────────────────────────────────
    metrics = []
    group_keys = []
    for (prov, espec), recs in groups.items():
        if len(recs) < 4:
            continue
        recs_sorted = sorted(recs, key=lambda x: x.fecha)
        metrics.append(
            Metric(
                name=f"{prov}::{espec}",
                timestamps=[
                    datetime.combine(r.fecha, datetime.min.time())
                    for r in recs_sorted
                ],
                values=[r.demora_media_dias for r in recs_sorted],
            )
        )
        group_keys.append((prov, espec))

    if not metrics:
        return []

    # ── Evaluar todo de una vez (permite corrección FDR correcta) ────────────
    try:
        report = evaluate(
            events=cc_events,
            metrics=metrics,
            lookback_hours=LOOKBACK_HOURS,
            baseline_days=BASELINE_DAYS,
        )
    except Exception as exc:
        logger.error("evaluate() falló: %s", exc)
        raise

    # ── Narrativa LLM si hay señal y hay clave configurada ───────────────────
    provider = os.getenv("LLM_PROVIDER", "groq")
    api_key  = os.getenv("GROQ_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if api_key and report.level != "green":
        try:
            report = narrate(report, provider=provider)
        except Exception as exc:
            logger.warning("narrate() falló: %s", exc)

    # ── Guardar resultados en BD ──────────────────────────────────────────────
    results_summary = []
    result_by_name = {r.metric_name: r for r in report.results}

    for (prov, espec) in group_keys:
        key = f"{prov}::{espec}"
        cr = result_by_name.get(key)
        if cr is None:
            continue

        ar = AnalysisResult(
            metrica=key,
            provincia=prov,
            especialidad=espec,
            p_value=cr.p_value,
            effect_size=cr.effect_size,
            signal_strength=cr.signal_strength,   # "strong"/"moderate"/"weak"/"none"
            narrative=cr.narrative,
            lookback_hours=LOOKBACK_HOURS,
            n_events=len(cc_events),
        )
        db.add(ar)
        results_summary.append({
            "provincia": prov,
            "especialidad": espec,
            "signal_strength": cr.signal_strength,
            "p_value": cr.p_value,
            "effect_size": cr.effect_size,
            "significant": cr.significant,
        })

    db.commit()
    logger.info(
        "Análisis completado: %d combinaciones, nivel=%s, señales_activas=%d",
        len(results_summary), report.level, report.active_signals,
    )
    return results_summary
