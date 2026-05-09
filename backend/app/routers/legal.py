"""
Marco legal y garantías — análisis de cumplimiento de leyes sanitarias.
Usa chrono-correlator: hitos de incumplimiento como Event vs demora como Metric.
IMPORTANTE: las correlaciones detectadas NO implican causalidad.
"""
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WaitingRecord

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/legal", tags=["legal"])

# Hitos documentados de cumplimiento por ley.
# valor: 0.0 = incumplimiento, 0.5 = parcial, 1.0 = activo
_LEYES: list[dict] = [
    {
        "id": "decreto_209_2018",
        "ley": "Decreto 209/2018",
        "garantia": "Intervención quirúrgica en máximo 180 días (garantía de demora máxima)",
        "realidad": (
            "Demora media en traumatología superó 250 días en 2023. "
            "En 2025 la demora media quirúrgica en Andalucía es de 173 días "
            "frente a 121 días de media nacional (Ministerio de Sanidad, 2T-2025). "
            "Andalucía entre las CCAA con mayor incumplimiento sostenido."
        ),
        "hitos": [
            ("2018-12-01", 0.5, "Entrada en vigor; sistemas de medición parciales"),
            ("2019-06-01", 0.0, "EASP: incumplimiento en 6 de 8 provincias"),
            ("2020-04-01", 0.0, "RD 463/2020: suspensión de garantías por pandemia"),
            ("2021-09-01", 0.5, "Reanudación parcial; Junta activa derivaciones privadas (BOJA 200/2021)"),
            ("2022-12-01", 0.0, "Defensor del Pueblo: 847 quejas por listas de espera (Q4/2022)"),
            ("2023-06-01", 0.0, "Ministerio de Sanidad: Andalucía en peores ratios del SNS"),
            ("2023-12-01", 0.0, "Defensor del Pueblo: quejas por listas de espera +58% en 2023 (1.150 quejas específicas)"),
            ("2024-01-01", 0.5, "Plan de choque SAS enero 2024; mejora parcial Málaga y Sevilla"),
            ("2024-12-01", 0.0, "Defensor del Pueblo: 2.605 quejas sanitarias en 2024 (récord); +46.000 personas atendidas"),
        ],
    },
    {
        "id": "ley_7_2013",
        "ley": "Ley 7/2013",
        "garantia": "Tiempos máximos de espera para diagnóstico y consulta especializada en Andalucía",
        "realidad": (
            "Tiempo medio de consultas externas supera 90 días en 5 especialidades (2023). "
            "Informe EASP: incumplimiento en 7 de 8 provincias para consultas programadas. "
            "Las quejas al Defensor del Pueblo por demoras en consultas e intervenciones "
            "se duplicaron en España en 2023 y registraron récord en Andalucía en 2024."
        ),
        "hitos": [
            ("2013-12-01", 0.5, "Entrada en vigor; Junta adapta sistemas de registro"),
            ("2015-01-01", 1.0, "Informe favorable Consejo Consultivo Andaluz"),
            ("2017-06-01", 0.5, "Recortes 2017-2018 reducen plantilla AP; tiempos suben"),
            ("2019-01-01", 0.0, "EASP: consultas externas incumplen plazos en 7 de 8 provincias"),
            ("2020-04-01", 0.0, "Pandemia: colapso del sistema de citas presenciales"),
            ("2022-01-01", 0.5, "Recuperación gradual; lista diagnóstica sigue al alza"),
            ("2023-12-01", 0.0, "Quejas por listas de espera duplicadas en España; pico en Andalucía"),
            ("2024-01-01", 0.5, "Digitalización de citas mejora parcialmente zonas urbanas"),
            ("2024-12-01", 0.0, "Defensor del Pueblo: 2.605 quejas sanitarias (récord absoluto en Andalucía)"),
        ],
    },
    {
        "id": "rd_1030_2006",
        "ley": "RD 1030/2006",
        "garantia": "Cartera común de servicios del SNS — cobertura universal básica garantizada",
        "realidad": (
            "Externalización de servicios diagnósticos excluye prestaciones a usuarios "
            "sin concertación privada. Defensor del Pueblo (2023): usuarios derivados no reciben "
            "cartera completa del SNS."
        ),
        "hitos": [
            ("2006-09-16", 1.0, "Entrada en vigor; cartera universal operativa"),
            ("2012-04-01", 0.5, "RDL 16/2012 introduce copago; cobertura efectiva reducida"),
            ("2018-07-01", 0.5, "Derogación del copago farmacéutico (RDL 7/2018); mejora parcial"),
            ("2019-01-01", 0.5, "Conciertos SAS excluyen algunas prestaciones del catálogo básico"),
            ("2023-01-01", 0.0, "Defensor del Pueblo: derivados a privada no reciben cartera completa"),
            ("2024-06-01", 0.5, "SAS revisa pliegos; prestaciones básicas en nuevos contratos"),
        ],
    },
]


def _estado(valor: float) -> str:
    if valor >= 1.0:
        return "activo"
    if valor >= 0.5:
        return "parcial"
    return "incumplido"


def _waiting_metric(
    db: Session, especialidad: str
) -> tuple[list[datetime], list[float]]:
    """Serie temporal de demora media para la especialidad dada."""
    rows = (
        db.query(WaitingRecord)
        .filter(WaitingRecord.especialidad == especialidad)
        .order_by(WaitingRecord.fecha)
        .all()
    )
    if not rows:
        return [], []
    ts = [datetime.combine(r.fecha, datetime.min.time()) for r in rows]
    vals = [r.demora_media_dias for r in rows]
    return ts, vals


def _analyze(
    ley: dict, timestamps: list[datetime], values: list[float]
) -> dict[str, Any]:
    """Mann-Whitney U entre hitos de incumplimiento y demora de espera."""
    try:
        from chrono_correlator import (  # type: ignore
            Event, Metric, SignificanceConfig, evaluate,
        )
    except ImportError:
        return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "consistency": None}

    # Solo los hitos marcados como incumplimiento (valor == 0.0) son eventos
    events = [
        Event(timestamp=datetime.strptime(fecha, "%Y-%m-%d"), label=desc)
        for fecha, valor, desc in ley["hitos"]
        if float(valor) == 0.0
    ]

    if not events or len(timestamps) < 4:
        return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "consistency": None}

    metric = Metric(
        name=f"demora__{ley['id']}",
        timestamps=timestamps,
        values=values,
    )

    try:
        cfg = SignificanceConfig(alpha=0.05, strong_effect=0.25, moderate_effect=0.15, weak_effect=0.08)
        report = evaluate(
            events=events, metrics=[metric],
            lookback_hours=2160, baseline_days=365,
            config=cfg, baseline_strategy="same_month",
        )

        if report.results:
            cr = report.results[0]
            return {
                "signal_strength": cr.signal_strength,
                "p_value": round(cr.p_value, 4),
                "effect_size": round(cr.effect_size, 3),
                "consistency": round(float(getattr(cr, "consistency", 0) or 0), 2),
                "n_incumplimientos": len(events),
            }
    except Exception as exc:
        logger.warning("evaluate() legal '%s' falló: %s", ley["id"], exc)

    return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "consistency": None}


@router.get("/compliance-impact")
def compliance_impact(
    especialidad: str = "traumatología",
    db: Session = Depends(get_db),
) -> dict:
    """
    Devuelve el estado de cumplimiento de las 3 leyes clave y la asociación
    estadística entre sus hitos de incumplimiento y la demora de espera.
    """
    timestamps, values = _waiting_metric(db, especialidad)

    leyes_out = []
    for ley in _LEYES:
        ultimo_valor = float(ley["hitos"][-1][1])
        sparkline = [
            {"fecha": f, "valor": v, "desc": d}
            for f, v, d in ley["hitos"]
        ]
        signal = _analyze(ley, timestamps, values)

        leyes_out.append({
            "id": ley["id"],
            "ley": ley["ley"],
            "garantia": ley["garantia"],
            "realidad": ley["realidad"],
            "estado": _estado(ultimo_valor),
            "sparkline_data": sparkline,
            "signal": signal,
        })

    return {
        "leyes": leyes_out,
        "especialidad_analizada": especialidad,
        "nota": (
            "Hitos extraídos de BOJA, informes EASP y Defensor del Pueblo Andaluz. "
            "Datos sintéticos calibrados — extracción automática BOJA en desarrollo. "
            "Asociación estadística, no causalidad."
        ),
    }
