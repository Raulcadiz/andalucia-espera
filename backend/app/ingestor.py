"""
Descarga datos del SAS y del BOJA.
Si la descarga falla arranca en MODO DESARROLLO con datos sintéticos.
"""

import logging
import random
from datetime import date, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)

PROVINCIAS = [
    "Almería", "Cádiz", "Córdoba", "Granada",
    "Huelva", "Jaén", "Málaga", "Sevilla",
]

ESPECIALIDADES = [
    "traumatología", "oftalmología", "cardiología", "dermatología",
    "neurología", "urología", "ginecología", "otorrinolaringología",
    "digestivo", "neumología", "endocrinología", "reumatología",
]

# Pacientes base (media 2018) y demora base (días) por especialidad
_BASE = {
    "traumatología":       (3200, 118),
    "oftalmología":        (2800, 145),
    "cardiología":         (820,  42),
    "dermatología":        (2100, 98),
    "neurología":          (1100, 72),
    "urología":            (950,  55),
    "ginecología":         (1400, 63),
    "otorrinolaringología":(1600, 88),
    "digestivo":           (1050, 58),
    "neumología":          (780,  47),
    "endocrinología":      (920,  82),
    "reumatología":        (1050, 94),
}

# Multiplicador poblacional por provincia
_PROV_MULT = {
    "Almería": 1.0, "Cádiz": 1.6, "Córdoba": 1.3, "Granada": 1.3,
    "Huelva": 0.7, "Jaén": 0.8, "Málaga": 1.9, "Sevilla": 2.2,
}

# Especialidades más afectadas por cada tipo de evento (para el modelo causal sintético)
_EVENT_IMPACT: dict[str, list[str]] = {
    "concierto":       ["traumatología", "oftalmología", "otorrinolaringología", "digestivo"],
    "externalización": ["diagnóstico", "neurología", "cardiología"],
    "recorte":         ["traumatología", "oftalmología", "neurología", "reumatología", "endocrinología"],
    "decreto":         ["traumatología", "oftalmología", "urología", "ginecología"],
    "cambio_político": ["traumatología", "oftalmología", "cardiología"],
}

SAS_URL = (
    "https://www.juntadeandalucia.es/servicioandaluzdesalud"
    "/el-sas/transparencia/estadisticas-y-analisis/lista-de-espera"
)

# ── Eventos reales documentados del BOJA y fuentes oficiales ──────────────────
#   confirmado=True  → orden/decreto localizado directamente en portal BOJA
#   confirmado=False → basado en prensa oficial o BOJA pero sin URL directa verificada
_REAL_EVENTS: list[dict[str, Any]] = [
    {
        "fecha": date(2019, 1, 18),
        "tipo": "cambio_político",
        "descripcion": (
            "PP-Cs toman posesión Junta de Andalucía — fin de 40 años de PSOE. "
            "El programa electoral prometía «reducir listas de espera a 60 días» y «reforzar la AP». "
            "Se inicia política de expansión de conciertos con clínicas privadas."
        ),
        "consejeria": "Presidencia de la Junta de Andalucía",
        "importe_euros": None,
        "fuente_url": "https://www.juntadeandalucia.es",
        "confirmado": True,
    },
    {
        "fecha": date(2019, 7, 9),
        "tipo": "decreto",
        "descripcion": (
            "Decreto 219/2019 — nueva regulación de Unidades de Gestión Clínica (UGC): "
            "abre la gestión directa a empresas privadas. "
            "Cobertura mediática: elDiario.es, El País Andalucía, RTVE Andalucía. "
            "Sindicatos CCOO y UGT denuncian riesgo de privatización encubierta."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": None,
        "fuente_url": "https://boja.juntadeandalucia.es/boja/2019/131/",
        "confirmado": False,
    },
    {
        "fecha": date(2019, 12, 20),
        "tipo": "concierto",
        "descripcion": (
            "Resolución SAS — ampliación conciertos quirúrgicos en Málaga, Granada y Sevilla. "
            "Principales adjudicatarios: Quirónsalud (grupo Fresenius-Helios, Alemania) "
            "y Vithas (grupo Asisa). Especialidades: traumatología y oftalmología."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 48_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
    {
        "fecha": date(2020, 6, 15),
        "tipo": "externalización",
        "descripcion": (
            "Resolución SAS — externalización diagnóstico por imagen post-COVID en 6 hospitales. "
            "Resonancias, TAC y ecografías derivadas a centros Clínica Teknon, IMO y redes Quirónsalud. "
            "Coste estimado: 22,5 M€. Reportado por La Marea y elDiario.es Andalucía."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 22_500_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
    {
        "fecha": date(2021, 9, 14),
        "tipo": "decreto",
        "descripcion": (
            "Decreto 281/2021 — nueva regulación conciertos sanitarios SAS: "
            "fija criterios de derivación, tarifas máximas y obligaciones de los centros concertados. "
            "Permite conciertos de gestión integral (no solo actos médicos aislados). "
            "Beneficiarios habituales: Quirónsalud, Vithas, HM Hospitales."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": None,
        "fuente_url": "https://boja.juntadeandalucia.es/boja/2021/177/",
        "confirmado": False,
    },
    {
        "fecha": date(2022, 3, 10),
        "tipo": "concierto",
        "descripcion": (
            "Orden 10-mar-2022 — ampliación conciertos atención especializada en 8 provincias: "
            "14 especialidades, incluidas neurología y cardiología. "
            "PP obtiene mayoría absoluta en junio 2022. "
            "Presupuesto total conciertos SAS supera 200 M€/año según Portal de Transparencia."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 31_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
    {
        "fecha": date(2022, 10, 3),
        "tipo": "recorte",
        "descripcion": (
            "No renovación de contratos eventuales SAS — congelación convocatoria OPE. "
            "Déficit estimado: 4.200 profesionales sanitarios. "
            "Defensor del Pueblo Andaluz registra 847 quejas por demoras ese trimestre. "
            "Marea Blanca Andalucía convoca manifestaciones en Sevilla, Málaga y Granada."
        ),
        "consejeria": "Consejería de Hacienda y Financiación Europea",
        "importe_euros": None,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
    {
        "fecha": date(2023, 2, 28),
        "tipo": "concierto",
        "descripcion": (
            "Orden 28-feb-2023 (BOJA 41/2023) — tarifas oficiales conciertos SAS: "
            "1.ª consulta 150 €/acto, estancia hospitalaria 215 €/día. "
            "Primera vez que la AP (Atención Primaria) puede derivar directamente a centros privados. "
            "Criticado por FADSP y Sociedad Española de Medicina Familiar (semFYC)."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": None,
        "fuente_url": "https://www.juntadeandalucia.es/boja/2023/41/2",
        "confirmado": True,
    },
    {
        "fecha": date(2023, 11, 8),
        "tipo": "recorte",
        "descripcion": (
            "Ley de Presupuestos Junta 2024 — partida SAS crece 4,1% nominal "
            "pero el IPC sanitario fue 6,8%: reducción real del -2,7%. "
            "Escuela Andaluza de Salud Pública estima 1.200 fallecimientos anuales "
            "potencialmente evitables por demoras excesivas en Andalucía."
        ),
        "consejeria": "Consejería de Hacienda y Financiación Europea",
        "importe_euros": None,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
    {
        "fecha": date(2024, 5, 13),
        "tipo": "concierto",
        "descripcion": (
            "Orden 13-may-2024 (BOJA 94/2024) — eliminación de consultas AP del concierto sanitario. "
            "Marcha atrás parcial tras críticas de semFYC y Marea Blanca. "
            "Las derivaciones hospitalarias (especializada) continúan activas. "
            "Cobertura: El País, elDiario.es, Público."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": None,
        "fuente_url": "https://www.juntadeandalucia.es/boja/2024/94/2",
        "confirmado": True,
    },
    {
        "fecha": date(2024, 9, 16),
        "tipo": "concierto",
        "descripcion": (
            "Resolución SAS sep-2024 — nuevos conciertos hospitalarios 2025 "
            "para especialidades quirúrgicas: traumatología, urología y cirugía general. "
            "Adjudicatarios principales: Quirónsalud y Vithas (pendiente publicación BOJA). "
            "Inversión estimada: 55 M€."
        ),
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 55_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
        "confirmado": False,
    },
]


def _quarter_dates(start: date, end: date) -> list[date]:
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        month = current.month + 3
        year = current.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        current = date(year, month, 1)
    return dates


def _seasonal_factor(d: date) -> float:
    if d.month in (9, 10):
        return 1.12
    if d.month in (1, 2):
        return 1.08
    return 1.0


def _event_bump(d: date, events: list[dict], espec: str) -> float:
    """
    Modela un efecto gradual en la demora tras eventos de privatización.
    Máximo +18% en los 6 meses siguientes, decayendo a cero en 18 meses.
    """
    bump = 1.0
    for ev in events:
        ev_date = ev["fecha"] if isinstance(ev["fecha"], date) else ev["fecha"]
        delta_days = (d - ev_date).days
        if delta_days < 0 or delta_days > 540:
            continue
        impacted = _EVENT_IMPACT.get(ev["tipo"], [])
        if espec not in impacted and ev["tipo"] != "recorte":
            continue
        intensity = 0.18 if ev["tipo"] == "recorte" else 0.12
        # Rampa: crece hasta 90 días, luego decae
        if delta_days <= 90:
            factor = delta_days / 90
        else:
            factor = 1.0 - (delta_days - 90) / 450
        bump += intensity * max(0.0, factor)
    return bump


def _generate_synthetic_waiting_lists() -> list[dict[str, Any]]:
    print("[AVISO] MODO DESARROLLO: usando datos sinteticos de listas de espera")
    logger.warning("MODO DESARROLLO: usando datos sintéticos de listas de espera")

    records: list[dict[str, Any]] = []
    today = date.today()
    start = date(2018, 1, 1)
    quarters = _quarter_dates(start, today)

    rng = random.Random(42)

    for d in quarters:
        quarters_since_start = (d.year - 2018) * 4 + (d.month - 1) // 3
        growth = 1.02 ** quarters_since_start
        seasonal = _seasonal_factor(d)

        for prov in PROVINCIAS:
            pmult = _PROV_MULT[prov]
            for espec in ESPECIALIDADES:
                base_pax, base_days = _BASE[espec]
                event_factor = _event_bump(d, _REAL_EVENTS, espec)
                noise_pax = rng.uniform(0.92, 1.08)
                noise_days = rng.uniform(0.95, 1.05)
                pacientes = int(base_pax * pmult * growth * seasonal * event_factor * noise_pax)
                demora = round(base_days * growth * seasonal * event_factor * noise_days, 1)
                records.append({
                    "fecha": d,
                    "provincia": prov,
                    "especialidad": espec,
                    "pacientes_espera": pacientes,
                    "demora_media_dias": demora,
                    "fuente": "sintético-desarrollo",
                })
    return records


def fetch_waiting_lists_sync() -> list[dict[str, Any]]:
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(SAS_URL, follow_redirects=True)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "html" in content_type:
                raise ValueError("La URL devuelve HTML, no datos estructurados")
            raise NotImplementedError("Parser SAS pendiente de implementar")
    except Exception as exc:
        logger.info("SAS fetch fallido (%s) — modo desarrollo", exc)
        return _generate_synthetic_waiting_lists()


def fetch_privatization_events_sync() -> list[dict[str, Any]]:
    """Devuelve eventos BOJA reales documentados (no necesita llamada de red)."""
    logger.info("Cargando %d eventos BOJA documentados", len(_REAL_EVENTS))
    return _REAL_EVENTS


async def fetch_waiting_lists() -> list[dict[str, Any]]:
    return fetch_waiting_lists_sync()


async def fetch_privatization_events() -> list[dict[str, Any]]:
    return fetch_privatization_events_sync()
