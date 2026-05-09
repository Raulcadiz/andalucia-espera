"""
Flujo de dinero público a sanidad privada.
Análisis con Pearson sobre series anuales (n=9).
chrono-correlator no es adecuado para datos anuales aggregados.
IMPORTANTE: con n=9 los resultados son indicativos, no concluyentes.
"""
import logging
import math

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/budget", tags=["budget"])

# Fuentes:
#   Gasto 2018-2023: Presupuestos SAS — Consejería de Hacienda Junta de Andalucía
#   Gasto 2024: 413 M€ ejecutado — El Independiente / BOJA (dato real, no estimado)
#   Gasto 2025: 501,8 M€ presupuestado — BOJA / Consejería de Salud
#   Acuerdo marco sep-2025: 533 M€ a 4 años, 38 empresas adjudicatarias (El Independiente)
#   Total acumulado 2018-2024 documentado: ~3.718 M€ (incluye conciertos, derivaciones y
#   acuerdos marco, no solo presupuesto anual de conciertos — El Independiente, FADSP)
#   Déficit de profesionales: CCOO-Sanidad Andalucía (informes anuales)
#   Pacientes en espera quirúrgica: Ministerio de Sanidad / CMBD
_SERIES: list[dict] = [
    {"año": 2018, "gasto_millones": 145, "deficit_pct": 8.2,  "pacientes_espera": 74_000},
    {"año": 2019, "gasto_millones": 165, "deficit_pct": 9.1,  "pacientes_espera": 82_000},
    {"año": 2020, "gasto_millones": 190, "deficit_pct": 11.3, "pacientes_espera": 95_000},
    {"año": 2021, "gasto_millones": 220, "deficit_pct": 12.8, "pacientes_espera": 74_000},
    {"año": 2022, "gasto_millones": 268, "deficit_pct": 14.2, "pacientes_espera": 103_000},
    {"año": 2023, "gasto_millones": 290, "deficit_pct": 15.8, "pacientes_espera": 118_000},
    {"año": 2024, "gasto_millones": 413, "deficit_pct": 18.4, "pacientes_espera": 128_000},
    {"año": 2025, "gasto_millones": 502, "deficit_pct": 19.8, "pacientes_espera": 133_000, "proyeccion": True},
]


def _pearson(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n < 3:
        return 0.0
    mx, my = sum(x) / n, sum(y) / n
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    dx = math.sqrt(sum((xi - mx) ** 2 for xi in x))
    dy = math.sqrt(sum((yi - my) ** 2 for yi in y))
    if dx == 0 or dy == 0:
        return 0.0
    return round(num / (dx * dy), 3)


def _fuerza(r: float) -> str:
    a = abs(r)
    if a >= 0.8:
        return "muy alta"
    if a >= 0.6:
        return "alta"
    if a >= 0.4:
        return "moderada"
    if a >= 0.2:
        return "baja"
    return "muy baja"


@router.get("/analysis")
def budget_analysis() -> dict:
    """
    Devuelve la evolución del gasto en conciertos, déficit de profesionales
    y pacientes en espera 2018-2024, con correlaciones de Pearson.
    """
    gasto = [d["gasto_millones"] for d in _SERIES]
    deficit = [d["deficit_pct"] for d in _SERIES]
    pacientes = [d["pacientes_espera"] for d in _SERIES]

    r_gd = _pearson(gasto, deficit)
    r_gp = _pearson(gasto, pacientes)
    r_dp = _pearson(deficit, pacientes)

    return {
        "gasto_anual": _SERIES,
        "total_acumulado_millones": sum(gasto),
        "variacion_pct": round((gasto[-1] / gasto[0] - 1) * 100, 1),
        "correlaciones": [
            {
                "x": "Gasto conciertos (M€)",
                "y": "Déficit profesionales (%)",
                "coef": r_gd,
                "fuerza": _fuerza(r_gd),
                "signo": "positiva" if r_gd >= 0 else "negativa",
            },
            {
                "x": "Gasto conciertos (M€)",
                "y": "Pacientes en espera",
                "coef": r_gp,
                "fuerza": _fuerza(r_gp),
                "signo": "positiva" if r_gp >= 0 else "negativa",
            },
            {
                "x": "Déficit profesionales (%)",
                "y": "Pacientes en espera",
                "coef": r_dp,
                "fuerza": _fuerza(r_dp),
                "signo": "positiva" if r_dp >= 0 else "negativa",
            },
        ],
        "acuerdo_marco": {
            "importe_millones": 533,
            "fecha": "2025-09",
            "adjudicatarias": 38,
            "descripcion": "Acuerdo marco 533 M€ a 4 años para procedimientos quirúrgicos (sep-2025). 38 empresas adjudicatarias.",
            "fuente": "El Independiente / BOJA",
        },
        "interpretacion": (
            "El gasto ejecutado en conciertos creció un 185% entre 2018 y 2024 (145 → 413 M€). "
            "El presupuesto para 2025 alcanza los 502 M€ y el acuerdo marco firmado en septiembre de 2025 "
            "compromete otros 533 M€ a cuatro años con 38 empresas privadas. "
            "Mientras tanto, el déficit de profesionales SAS y las listas de espera aumentaron en paralelo: "
            "la demora media quirúrgica se situó en 173 días en el segundo semestre de 2025, "
            "frente a una media nacional de 121 días. "
            "Las correlaciones de Pearson son positivas y de fuerza alta, "
            "pero con n=8 observaciones los resultados son indicativos, no concluyentes."
        ),
        "nota_metodologica": (
            "Correlación de Pearson sobre 8 observaciones anuales (2018-2025). "
            "2025: dato presupuestado, no ejecutado. "
            "n pequeño: resultados indicativos, no concluyentes. "
            "Gasto 2024 (413 M€) y 2025 (502 M€): fuentes BOJA / El Independiente. "
            "Déficit y pacientes: CCOO-Sanidad y Ministerio de Sanidad / CMBD. "
            "Asociación estadística — no implica causalidad."
        ),
        "fuentes": [
            "Gasto 2024 real (413 M€) — El Independiente / BOJA",
            "Presupuesto 2025 (501,8 M€) — Consejería de Salud / BOJA",
            "Acuerdo marco 533 M€ (sep-2025) — El Independiente",
            "Déficit de plazas — CCOO-Sanidad Andalucía (informes anuales)",
            "Demora media quirúrgica — Ministerio de Sanidad / CMBD (2T-2025)",
        ],
    }
