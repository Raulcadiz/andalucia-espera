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

# Multiplicador poblacional por provincia (relativo a Almería = 1.0)
_PROV_MULT = {
    "Almería": 1.0, "Cádiz": 1.6, "Córdoba": 1.3, "Granada": 1.3,
    "Huelva": 0.7, "Jaén": 0.8, "Málaga": 1.9, "Sevilla": 2.2,
}

SAS_URL = (
    "https://www.juntadeandalucia.es/servicioandaluzdesalud"
    "/el-sas/transparencia/estadisticas-y-analisis/lista-de-espera"
)
BOJA_URL = "https://boja.juntadeandalucia.es/api/v1/resoluciones"

# Eventos sintéticos de referencia cuando BOJA no responde
_SYNTHETIC_EVENTS: list[dict[str, Any]] = [
    {
        "fecha": date(2019, 1, 15),
        "tipo": "decreto",
        "descripcion": "Decreto de gestión sanitaria privada en Málaga",
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 45_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
    {
        "fecha": date(2020, 6, 10),
        "tipo": "concierto",
        "descripcion": "Concierto hospitalario Sevilla — ampliación quirúrgica",
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 32_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
    {
        "fecha": date(2021, 3, 22),
        "tipo": "externalización",
        "descripcion": "Externalización diagnóstico por imagen — 4 hospitales",
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 18_500_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
    {
        "fecha": date(2022, 9, 5),
        "tipo": "concierto",
        "descripcion": "Ampliación conciertos atención primaria",
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 27_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
    {
        "fecha": date(2023, 4, 18),
        "tipo": "contrato",
        "descripcion": "Nuevos contratos gestión ambulatoria — 6 provincias",
        "consejeria": "Consejería de Salud y Consumo",
        "importe_euros": 21_000_000.0,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
    {
        "fecha": date(2023, 11, 8),
        "tipo": "recorte",
        "descripcion": "Recorte presupuesto SAS 8% — ejercicio 2024",
        "consejeria": "Consejería de Hacienda",
        "importe_euros": None,
        "fuente_url": "https://boja.juntadeandalucia.es",
    },
]


def _quarter_dates(start: date, end: date) -> list[date]:
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        # Avanzar ~3 meses
        month = current.month + 3
        year = current.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        current = date(year, month, 1)
    return dates


def _seasonal_factor(d: date) -> float:
    """Picos post-verano (oct) y post-navidad (feb)."""
    if d.month in (9, 10):
        return 1.12
    if d.month in (1, 2):
        return 1.08
    return 1.0


def _generate_synthetic_waiting_lists() -> list[dict[str, Any]]:
    print("[AVISO] MODO DESARROLLO: usando datos sinteticos de listas de espera")
    logger.warning("MODO DESARROLLO: usando datos sintéticos de listas de espera")

    records: list[dict[str, Any]] = []
    today = date.today()
    start = date(2018, 1, 1)
    quarters = _quarter_dates(start, today)

    rng = random.Random(42)  # semilla fija para reproducibilidad

    for d in quarters:
        # Crecimiento trimestral acumulado desde 2018
        quarters_since_start = (
            (d.year - 2018) * 4 + (d.month - 1) // 3
        )
        growth = (1.02 ** quarters_since_start)
        seasonal = _seasonal_factor(d)

        for prov in PROVINCIAS:
            pmult = _PROV_MULT[prov]
            for espec in ESPECIALIDADES:
                base_pax, base_days = _BASE[espec]
                noise_pax = rng.uniform(0.92, 1.08)
                noise_days = rng.uniform(0.95, 1.05)
                pacientes = int(base_pax * pmult * growth * seasonal * noise_pax)
                demora = round(base_days * growth * seasonal * noise_days, 1)
                records.append(
                    {
                        "fecha": d,
                        "provincia": prov,
                        "especialidad": espec,
                        "pacientes_espera": pacientes,
                        "demora_media_dias": demora,
                        "fuente": "sintético-desarrollo",
                    }
                )
    return records


def fetch_waiting_lists_sync() -> list[dict[str, Any]]:
    """Versión síncrona — usada por el scheduler y la carga inicial."""
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(SAS_URL, follow_redirects=True)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "html" in content_type:
                raise ValueError("La URL devuelve HTML, no datos estructurados")
            # TODO: parsear el Excel cuando esté disponible en datos.gob.es
            raise NotImplementedError("Parser SAS pendiente de implementar")
    except Exception as exc:
        logger.info("SAS fetch fallido (%s) — modo desarrollo", exc)
        return _generate_synthetic_waiting_lists()


def fetch_privatization_events_sync() -> list[dict[str, Any]]:
    """Versión síncrona — usada por el scheduler y la carga inicial."""
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                BOJA_URL,
                params={"q": "concierto+sanitario+OR+externalización", "rows": 50},
                follow_redirects=True,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                raise ValueError("BOJA devolvió respuesta vacía")
            raise NotImplementedError("Parser BOJA pendiente de implementar")
    except Exception as exc:
        logger.info("BOJA fetch fallido (%s) — usando eventos sintéticos", exc)
        print("[AVISO] MODO DESARROLLO: usando eventos de privatizacion sinteticos")
        return _SYNTHETIC_EVENTS


# Wrappers async (para compatibilidad con endpoints async si se necesitan)
async def fetch_waiting_lists() -> list[dict[str, Any]]:
    return fetch_waiting_lists_sync()


async def fetch_privatization_events() -> list[dict[str, Any]]:
    return fetch_privatization_events_sync()
