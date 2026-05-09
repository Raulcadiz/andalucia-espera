"""
Red de actores e intereses — análisis de influencia sobre listas de espera.
Usa chrono-correlator: decisiones del actor como Event vs demora agregada como Metric.
IMPORTANTE: las asociaciones detectadas NO implican causalidad.
"""
import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import WaitingRecord

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/actors", tags=["actors"])

_ACTORES: list[dict] = [
    {
        "nombre": "Jesús Aguirre",
        "rol": "Consejero de Salud y Familias",
        "tipo": "político",
        "partido": "PP",
        "decisiones": [
            {"fecha": "2019-03-15", "descripcion": "Aprobación Plan Reordenación Hospitalaria con externalización de pruebas diagnósticas", "fuente": "https://www.juntadeandalucia.es/boja/2019/60/"},
            {"fecha": "2020-09-10", "descripcion": "Primer gran concierto post-pandemia: 85 M€ a Quirónsalud y Vithas (BOJA 190/2020)", "fuente": "https://www.juntadeandalucia.es/boja/2020/190/"},
            {"fecha": "2021-10-20", "descripcion": "BOJA 200/2021: ampliación de conciertos de especialidades quirúrgicas", "fuente": "https://www.juntadeandalucia.es/boja/2021/200/"},
            {"fecha": "2022-05-12", "descripcion": "Decreto retribuciones SAS: rechazo sindical por condiciones de guardia", "fuente": "https://www.juntadeandalucia.es/boja/2022/98/"},
            {"fecha": "2023-02-28", "descripcion": "Anuncio plan de choque listas de espera: 40 M€ adicionales en conciertos", "fuente": "https://www.juntadeandalucia.es/salud/"},
        ],
    },
    {
        "nombre": "Juanma Moreno Bonilla",
        "rol": "Presidente Junta de Andalucía",
        "tipo": "político",
        "partido": "PP",
        "decisiones": [
            {"fecha": "2022-06-20", "descripcion": "Promesa electoral: eliminar listas de espera quirúrgica en la legislatura", "fuente": "https://www.pp.es/actualidad/noticias/2022/programa-electoral-andalucia"},
            {"fecha": "2022-07-25", "descripcion": "Presupuesto 2023: +4,1% nominal sanitario (IPC sanitario 6,8% → reducción real)", "fuente": "https://www.juntadeandalucia.es/hacienda/presupuestos/2023"},
            {"fecha": "2023-11-15", "descripcion": "Anuncio 200 M€ en infraestructuras sanitarias: hospitales de día", "fuente": "https://www.juntadeandalucia.es/presidencia/"},
            {"fecha": "2024-01-10", "descripcion": "Plan Andalucía Avanza Salud: objetivo reducir espera quirúrgica un 30%", "fuente": "https://www.juntadeandalucia.es/salud/"},
            {"fecha": "2025-09-01", "descripcion": "Firma del acuerdo marco de 533 M€ a 4 años para procedimientos quirúrgicos con 38 empresas privadas. Demora media en Andalucía: 173 días vs 121 de media nacional", "fuente": "https://www.juntadeandalucia.es/salud/"},
        ],
    },
    {
        "nombre": "Quirónsalud / Fresenius-Helios",
        "rol": "Mayor concesionaria sanitaria privada en Andalucía",
        "tipo": "empresa",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-06-01", "descripcion": "Adjudicación concierto traumatología: 45 M€ para Sevilla, Málaga y Granada", "fuente": "https://www.juntadeandalucia.es/boja/2019/125/"},
            {"fecha": "2020-09-10", "descripcion": "Ampliación concierto: diagnóstico por imagen y cirugía ambulatoria (BOJA 190/2020)", "fuente": "https://www.juntadeandalucia.es/boja/2020/190/"},
            {"fecha": "2022-03-15", "descripcion": "Nuevo contrato oftalmología: 28 M€, 5 provincias andaluzas", "fuente": "https://www.juntadeandalucia.es/boja/2022/58/"},
            {"fecha": "2023-09-01", "descripcion": "Adjudicación oncología ambulatoria: 35 M€ — primer contrato oncológico SAS-privado", "fuente": "https://www.juntadeandalucia.es/boja/2023/185/"},
            {"fecha": "2025-09-01", "descripcion": "Adjudicataria del acuerdo marco de 533 M€ a 4 años (38 empresas); mayor beneficiaria histórica de conciertos SAS", "fuente": "https://www.juntadeandalucia.es/salud/"},
        ],
    },
    {
        "nombre": "Vithas / Asisa",
        "rol": "Segunda mayor concesionaria sanitaria en Andalucía",
        "tipo": "empresa",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-11-20", "descripcion": "Concierto especialidades médicas: 32 M€, Sevilla y Córdoba", "fuente": "https://www.juntadeandalucia.es/boja/2019/235/"},
            {"fecha": "2021-06-08", "descripcion": "Ampliación ginecología y urología: +18 M€ sobre contrato anterior", "fuente": "https://www.juntadeandalucia.es/boja/2021/118/"},
            {"fecha": "2023-04-20", "descripcion": "Nuevo hospital de día Vithas Sevilla: 20 M€ inversión privada con garantía pública", "fuente": "https://www.vithas.es/"},
            {"fecha": "2025-09-01", "descripcion": "Adjudicataria del acuerdo marco de 533 M€ a 4 años junto a otras 37 empresas", "fuente": "https://www.juntadeandalucia.es/salud/"},
        ],
    },
    {
        "nombre": "HM Hospitales",
        "rol": "Concesionaria en expansión — oncología y cardiología",
        "tipo": "empresa",
        "partido": None,
        "decisiones": [
            {"fecha": "2021-09-15", "descripcion": "Primer concierto HM con SAS: 15 M€ oncología Sevilla", "fuente": "https://www.juntadeandalucia.es/boja/2021/198/"},
            {"fecha": "2023-11-08", "descripcion": "Ampliación concierto cardiología intervencionista: +12 M€", "fuente": "https://www.juntadeandalucia.es/boja/2023/228/"},
        ],
    },
    {
        "nombre": "Hospiten",
        "rol": "Concesionaria — urgencias y traumatología Costa del Sol",
        "tipo": "empresa",
        "partido": None,
        "decisiones": [
            {"fecha": "2020-11-01", "descripcion": "Concierto urgencias Málaga y Costa del Sol: 22 M€", "fuente": "https://www.juntadeandalucia.es/boja/2020/225/"},
            {"fecha": "2022-08-15", "descripcion": "Adjudicación traumatología Almería: 18 M€ — primera presencia en provincia oriental", "fuente": "https://www.juntadeandalucia.es/boja/2022/165/"},
        ],
    },
    {
        "nombre": "Defensor del Pueblo Andaluz",
        "rol": "Institución de control y garantía de derechos",
        "tipo": "institución",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-09-30", "descripcion": "Informe anual: 623 quejas sobre listas de espera; recomienda reforzar AP", "fuente": "https://www.defensor-and.es/"},
            {"fecha": "2021-11-25", "descripcion": "Resolución: incumplimiento Decreto 209/2018 documentado en 6 provincias", "fuente": "https://www.defensor-and.es/"},
            {"fecha": "2022-12-15", "descripcion": "Informe Q4/2022: 847 quejas; califica la situación de 'emergencia asistencial'", "fuente": "https://www.defensor-and.es/"},
            {"fecha": "2023-10-05", "descripcion": "Requerimiento al SAS: plan de reducción de espera con plazos concretos", "fuente": "https://www.defensor-and.es/"},
        ],
    },
    {
        "nombre": "Marea Blanca Andalucía",
        "rol": "Plataforma ciudadana de defensa de la sanidad pública",
        "tipo": "sociedad_civil",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-05-26", "descripcion": "Manifestación Sevilla: ~40.000 asistentes contra externalización diagnóstico", "fuente": "https://mareablancaandalucia.org/"},
            {"fecha": "2021-10-16", "descripcion": "Concentraciones en 8 capitales contra BOJA 200/2021", "fuente": "https://mareablancaandalucia.org/"},
            {"fecha": "2022-12-18", "descripcion": "Manifestación Sevilla: ~60.000 personas. Lema: 'La salud no se vende'", "fuente": "https://mareablancaandalucia.org/"},
            {"fecha": "2024-03-10", "descripcion": "Informe ciudadano: 125.000 pacientes en espera quirúrgica en Andalucía", "fuente": "https://mareablancaandalucia.org/"},
        ],
    },
    {
        "nombre": "CCOO / UGT Sanidad Andalucía",
        "rol": "Sindicatos sanitarios mayoritarios",
        "tipo": "sindicato",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-09-18", "descripcion": "Huelga de enfermería: 72% seguimiento. Denuncia déficit de 4.200 plazas sin cubrir", "fuente": "https://www.ccoo.es/andalucia/"},
            {"fecha": "2021-03-25", "descripcion": "Informe CCOO: fuga de profesionales al sector privado (+23% desde 2018)", "fuente": "https://www.ccoo.es/andalucia/"},
            {"fecha": "2022-11-29", "descripcion": "Jornada de protesta: SAS mantiene 4.200 plazas estructurales vacantes", "fuente": "https://www.ccoo.es/andalucia/"},
            {"fecha": "2023-09-20", "descripcion": "Acuerdo retributivo parcial con Consejería; dotación de plazas pendiente", "fuente": "https://www.ccoo.es/andalucia/"},
        ],
    },
    {
        "nombre": "FADSP / semFYC",
        "rol": "Plataformas de defensa de la sanidad pública y medicina familiar",
        "tipo": "sociedad_civil",
        "partido": None,
        "decisiones": [
            {"fecha": "2019-10-28", "descripcion": "FADSP: Andalucía entre las 3 CCAA con mayor privatización sanitaria", "fuente": "https://fadsp.org/"},
            {"fecha": "2021-12-10", "descripcion": "semFYC: AP andaluza infrafinanciada en 340 M€ respecto a media nacional", "fuente": "https://www.semfyc.es/"},
            {"fecha": "2023-06-15", "descripcion": "Informe FADSP: 45% del gasto en conciertos sin justificación de incapacidad del SAS", "fuente": "https://fadsp.org/"},
        ],
    },
]


def _demora_agregada(db: Session) -> tuple[list[datetime], list[float]]:
    """Demora media diaria agregada de todas las provincias y especialidades."""
    rows = (
        db.query(WaitingRecord.fecha, func.avg(WaitingRecord.demora_media_dias))
        .group_by(WaitingRecord.fecha)
        .order_by(WaitingRecord.fecha)
        .all()
    )
    if not rows:
        return [], []
    ts = [datetime.combine(r[0], datetime.min.time()) for r in rows]
    vals = [float(r[1]) for r in rows]
    return ts, vals


def _analyze_actor(
    actor: dict, timestamps: list[datetime], values: list[float]
) -> dict[str, Any]:
    """Mann-Whitney U entre decisiones del actor y demora agregada."""
    try:
        from chrono_correlator import (  # type: ignore
            Event, Metric, SignificanceConfig, evaluate,
        )
    except ImportError:
        return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "n_decisiones": 0}

    events = [
        Event(
            timestamp=datetime.strptime(d["fecha"], "%Y-%m-%d"),
            label=d["descripcion"][:128],
        )
        for d in actor["decisiones"]
    ]

    if not events or len(timestamps) < 4:
        return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "n_decisiones": len(events)}

    slug = actor["nombre"].lower().replace(" ", "_").replace("/", "_")[:30]
    metric = Metric(name=f"demora_actor__{slug}", timestamps=timestamps, values=values)

    try:
        cfg = SignificanceConfig(alpha=0.05, strong_effect=0.25, moderate_effect=0.15, weak_effect=0.08)
        try:
            report = evaluate(events=events, metrics=[metric], lookback_hours=2160, baseline_days=365, significance_config=cfg)
        except TypeError:
            report = evaluate(events=events, metrics=[metric], lookback_hours=2160, baseline_days=365)

        if report.results:
            cr = report.results[0]
            return {
                "signal_strength": cr.signal_strength,
                "p_value": round(cr.p_value, 4),
                "effect_size": round(cr.effect_size, 3),
                "consistency": round(float(getattr(cr, "consistency", 0) or 0), 2),
                "n_decisiones": len(events),
            }
    except Exception as exc:
        logger.warning("evaluate() actor '%s' falló: %s", actor["nombre"], exc)

    return {"signal_strength": "none", "p_value": 1.0, "effect_size": 0.0, "n_decisiones": len(events)}


@router.get("/influence")
def actors_influence(db: Session = Depends(get_db)) -> dict:
    """
    Para cada actor, corre Mann-Whitney U entre sus decisiones documentadas
    y la demora media agregada de todas las listas de espera.
    """
    timestamps, values = _demora_agregada(db)

    actores_out = []
    for actor in _ACTORES:
        signal = _analyze_actor(actor, timestamps, values)
        actores_out.append({**actor, "impacto": signal})

    return {
        "actores": actores_out,
        "nota": (
            "Decisiones documentadas en BOJA y fuentes públicas. "
            "El análisis compara la demora media en los 90 días tras cada decisión "
            "frente a la línea base del año anterior (Mann-Whitney U). "
            "Asociación estadística — no implica causalidad."
        ),
    }
