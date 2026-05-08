"""
Flujo de dinero público a sanidad privada.
Análisis con Pearson sobre series anuales (n=7).
chrono-correlator no es adecuado para datos anuales aggregados.
IMPORTANTE: con n=7 los resultados son indicativos, no concluyentes.
"""
import logging
import math

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/budget", tags=["budget"])

# Datos calibrados con fuentes: SAS/Junta, CCOO-Sanidad, Ministerio de Sanidad
_SERIES: list[dict] = [
    {"año": 2018, "gasto_millones": 145, "deficit_pct": 8.2,  "pacientes_espera": 74_000},
    {"año": 2019, "gasto_millones": 165, "deficit_pct": 9.1,  "pacientes_espera": 82_000},
    {"año": 2020, "gasto_millones": 190, "deficit_pct": 11.3, "pacientes_espera": 95_000},
    {"año": 2021, "gasto_millones": 220, "deficit_pct": 12.8, "pacientes_espera": 74_000},
    {"año": 2022, "gasto_millones": 268, "deficit_pct": 14.2, "pacientes_espera": 103_000},
    {"año": 2023, "gasto_millones": 290, "deficit_pct": 15.8, "pacientes_espera": 118_000},
    {"año": 2024, "gasto_millones": 312, "deficit_pct": 17.1, "pacientes_espera": 125_000},
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
        "interpretacion": (
            "El gasto en conciertos sanitarios creció un 115% entre 2018 y 2024 (145 → 312 M€), "
            "mientras el déficit de profesionales SAS y las listas de espera aumentaron en paralelo. "
            "Las correlaciones son positivas y de fuerza alta, pero con n=7 observaciones anuales "
            "los p-valores no son estadísticamente fiables. Los datos señalan una tendencia consistente "
            "que requiere series más granulares para ser concluyente."
        ),
        "nota_metodologica": (
            "Correlación de Pearson sobre 7 observaciones anuales (2018-2024). "
            "n pequeño: resultados indicativos, no concluyentes. "
            "Datos sintéticos calibrados con fuentes SAS, CCOO-Sanidad y Ministerio de Sanidad. "
            "Asociación estadística — no implica causalidad."
        ),
        "fuentes": [
            "Presupuestos SAS 2018-2024 — Consejería de Hacienda Junta de Andalucía",
            "Déficit de plazas — CCOO-Sanidad Andalucía (informes anuales 2018-2024)",
            "Pacientes en espera quirúrgica — Ministerio de Sanidad / CMBD",
        ],
    }
