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
        from chrono_correlator import (  # type: ignore
            Event, Metric, SignificanceConfig, evaluate, find_best_lag, narrate,
        )
        return Event, Metric, SignificanceConfig, evaluate, find_best_lag, narrate
    except ImportError:
        raise ImportError(
            "chrono-correlator no está instalado. "
            "Ejecuta: pip install 'chrono-correlator[all]>=1.2.0'"
        )


# Umbrales calibrados para datos sanitarios trimestrales en Andalucía.
# Los estudios de variabilidad del SAS sugieren effect_size >0.20 como
# umbral mínimo de relevancia práctica (no solo estadística).
_SIGNIFICANCE_CONFIG_KWARGS = dict(
    alpha=0.05,
    strong_effect=0.25,
    strong_consistency=0.55,
    moderate_effect=0.15,
    moderate_consistency=0.35,
    weak_effect=0.08,
)


def _local_narrative(prov: str, espec: str, cr: Any, n_events: int) -> str:
    """Genera narrativa en español sin necesidad de LLM."""
    direction = "incremento" if (cr.effect_size or 0) > 0 else "reducción"
    strength_es = {
        "strong":   "fuerte",
        "moderate": "moderada",
        "weak":     "débil",
        "none":     "sin señal significativa",
    }.get(cr.signal_strength, "sin señal")

    if cr.signal_strength == "none":
        return (
            f"En {prov} – {espec} no se detecta asociación estadística entre "
            f"los {n_events} eventos de privatización analizados y la evolución "
            f"de la demora (p={cr.p_value:.4f}, efecto={cr.effect_size:.3f})."
        )

    bm = getattr(cr, "baseline_median", None)
    pm = getattr(cr, "pre_event_median", None)
    cons = getattr(cr, "consistency", None)

    parts = [
        f"En {prov}, la especialidad {espec} muestra una asociación {strength_es} "
        f"entre los eventos de privatización/recortes y un {direction} de la demora "
        f"(p={cr.p_value:.4f}, tamaño del efecto={cr.effect_size:.3f})."
    ]
    if bm is not None and pm is not None:
        diff = pm - bm
        parts.append(
            f"La demora mediana en los 90 días siguientes al evento fue "
            f"{pm:.1f} días frente a una línea base de {bm:.1f} días "
            f"({'+' if diff >= 0 else ''}{diff:.1f} días, {'+' if diff >= 0 else ''}{100*diff/bm:.1f}%)."
        )
    if cons is not None:
        parts.append(
            f"El patrón fue consistente en el {cons*100:.0f}% de los eventos analizados."
        )
    parts.append(
        "Asociación estadística — no implica causalidad. "
        "Factores estacionales, demográficos o la pandemia pueden contribuir al patrón."
    )
    return " ".join(parts)


def run_analysis(
    db: Session,
    provincia: str | None = None,
    especialidad: str | None = None,
) -> list[dict[str, Any]]:
    """
    Ejecuta Mann-Whitney U sobre todas las combinaciones provincia×especialidad.
    Aplica corrección FDR. Usa find_best_lag para señales significativas.
    Guarda AnalysisResult por combinación.
    """
    Event, Metric, SignificanceConfig, evaluate, find_best_lag, narrate = _import_chrono()

    cutoff = datetime.now() - timedelta(days=5 * 365)

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

    records_q = db.query(WaitingRecord).filter(WaitingRecord.fecha >= cutoff.date())
    if provincia:
        records_q = records_q.filter(WaitingRecord.provincia == provincia)
    if especialidad:
        records_q = records_q.filter(WaitingRecord.especialidad == especialidad)

    records = records_q.order_by(WaitingRecord.fecha).all()
    if not records:
        logger.info("Sin registros de espera — análisis omitido")
        return []

    from collections import defaultdict
    groups: dict[tuple[str, str], list[WaitingRecord]] = defaultdict(list)
    for r in records:
        groups[(r.provincia, r.especialidad)].append(r)

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

    sig_config = SignificanceConfig(**_SIGNIFICANCE_CONFIG_KWARGS)

    try:
        report = evaluate(
            events=cc_events,
            metrics=metrics,
            lookback_hours=LOOKBACK_HOURS,
            baseline_days=BASELINE_DAYS,
            significance_config=sig_config,
        )
    except TypeError:
        # Versión anterior de chrono-correlator sin significance_config
        report = evaluate(
            events=cc_events,
            metrics=metrics,
            lookback_hours=LOOKBACK_HOURS,
            baseline_days=BASELINE_DAYS,
        )
    except Exception as exc:
        logger.error("evaluate() falló: %s", exc)
        raise

    # Narrativa LLM si hay clave configurada
    provider = os.getenv("LLM_PROVIDER", "groq")
    api_key  = os.getenv("GROQ_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    if api_key and report.level != "green":
        try:
            report = narrate(report, provider=provider)
        except Exception as exc:
            logger.warning("narrate() falló: %s", exc)

    # Mapa métrica → Metric object para find_best_lag
    metric_by_name = {m.name: m for m in metrics}

    results_summary = []
    result_by_name = {r.metric_name: r for r in report.results}

    for (prov, espec) in group_keys:
        key = f"{prov}::{espec}"
        cr = result_by_name.get(key)
        if cr is None:
            continue

        # find_best_lag solo para señales significativas (coste computacional)
        best_lag_hours = None
        if cr.significant:
            metric_obj = metric_by_name.get(key)
            if metric_obj:
                try:
                    lag_results = find_best_lag(
                        events=cc_events,
                        metric=metric_obj,
                        lag_range=range(0, 721, 72),   # 0–720 h, paso 72 h (3 días)
                        lookback_hours=LOOKBACK_HOURS,
                        baseline_days=BASELINE_DAYS,
                    )
                    if lag_results:
                        best_lag_hours = max(
                            lag_results.keys(),
                            key=lambda h: (
                                abs(lag_results[h].effect_size)
                                if lag_results[h].significant else -1
                            ),
                        )
                except Exception as exc:
                    logger.warning("find_best_lag falló para %s: %s", key, exc)

        # Narrativa local si no hay narrativa LLM
        narrative = cr.narrative
        if not narrative:
            narrative = _local_narrative(prov, espec, cr, len(cc_events))

        consistency   = getattr(cr, "consistency",     None)
        baseline_med  = getattr(cr, "baseline_median", None)

        ar = AnalysisResult(
            metrica=key,
            provincia=prov,
            especialidad=espec,
            p_value=cr.p_value,
            effect_size=cr.effect_size,
            signal_strength=cr.signal_strength,
            narrative=narrative,
            lookback_hours=LOOKBACK_HOURS,
            n_events=len(cc_events),
            best_lag_hours=best_lag_hours,
            consistency=consistency,
            baseline_median=baseline_med,
        )
        db.add(ar)
        results_summary.append({
            "provincia":        prov,
            "especialidad":     espec,
            "signal_strength":  cr.signal_strength,
            "p_value":          cr.p_value,
            "effect_size":      cr.effect_size,
            "significant":      cr.significant,
            "best_lag_hours":   best_lag_hours,
            "consistency":      consistency,
            "baseline_median":  baseline_med,
            "narrative":        narrative,
        })

    db.commit()
    logger.info(
        "Análisis completado: %d combinaciones, nivel=%s, señales_activas=%d",
        len(results_summary), report.level, report.active_signals,
    )
    return results_summary
