"""
Asistente IA para el dashboard Andalucía Espera.
Usa Groq (gratuito) si hay GROQ_API_KEY; si no, respuestas locales contextuales.
"""

import os
import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisResult, PrivatizacionEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assistant", tags=["assistant"])

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

_SYSTEM_PROMPT = """Eres un asistente analítico del proyecto «Andalucía Espera», una herramienta estadística de datos públicos que estudia si existe correlación temporal entre eventos de privatización/recortes sanitarios en Andalucía y la evolución de las listas de espera del SAS (Servicio Andaluz de Salud).

PRINCIPIOS IRRENUNCIABLES:
- Correlación estadística NO implica causalidad. Lo repites cuando es relevante.
- Presentas los datos de forma neutral y factual, sin atribuir intenciones políticas.
- Distingues claramente entre datos confirmados (BOJA oficial) y estimaciones.
- Si no sabes algo, lo dices directamente.
- Respondes siempre en español, de forma concisa (máximo 4 párrafos).

CONTEXTO DEL ANÁLISIS:
{context}

Cuando el usuario pregunte sobre causas políticas o responsabilidades, remítete exclusivamente a los datos estadísticos y a las fuentes documentadas. No emitas juicios de valor sobre partidos ni personas."""


def _build_context(results: list, events: list) -> str:
    strong   = [r for r in results if r.signal_strength == "strong"]
    moderate = [r for r in results if r.signal_strength == "moderate"]

    top_signals = "\n".join(
        f"  - {r.provincia} / {r.especialidad}: p={r.p_value:.4f}, efecto={r.effect_size:.3f}"
        for r in sorted(strong + moderate, key=lambda x: x.p_value)[:8]
    )
    ev_list = "\n".join(
        f"  - {e.fecha} [{e.tipo}] {e.descripcion[:80]}"
        for e in sorted(events, key=lambda x: x.fecha)
    )
    return (
        f"Combinaciones analizadas: {len(results)}\n"
        f"Señales fuertes: {len(strong)}, moderadas: {len(moderate)}\n"
        f"Señales principales:\n{top_signals or '  (ejecuta el análisis primero)'}\n\n"
        f"Eventos documentados ({len(events)}):\n{ev_list}"
    )


async def _ask_groq(question: str, context: str, api_key: str) -> str:
    system = _SYSTEM_PROMPT.format(context=context)
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": question},
                ],
                "max_tokens": 512,
                "temperature": 0.4,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


def _local_answer(question: str, context: str) -> str:
    q = question.lower()

    if any(w in q for w in ("mapa", "cuadro", "celda", "color")):
        return (
            "El mapa muestra 96 combinaciones provincia×especialidad. "
            "Rojo = señal fuerte, naranja = moderada, azul = débil, gris = sin señal. "
            "Haz clic en cualquier celda para ver la evolución temporal de esa combinación. "
            "Si el mapa aparece en gris uniforme, pulsa primero «Analizar» para ejecutar el análisis estadístico."
        )
    if any(w in q for w in ("muert", "fallecid", "victima", "mortalidad")):
        return (
            "Según el Defensor del Pueblo Andaluz y la Escuela Andaluza de Salud Pública, "
            "se estiman entre 800 y 1.400 fallecimientos anuales en Andalucía en pacientes "
            "que esperaban una intervención o consulta superando la garantía legal de respuesta (180 días). "
            "Son estadísticas de mortalidad evitable, no casos individuales documentados. "
            "Fuente: informes anuales del Defensor del Pueblo Andaluz."
        )
    if any(w in q for w in ("empresa", "quirón", "vithas", "sanitas", "clinic", "privad")):
        return (
            "Los principales adjudicatarios de conciertos SAS son: "
            "Quirónsalud (grupo Fresenius-Helios, alemán), Vithas (grupo Asisa), "
            "HM Hospitales, Hospiten y centros de la orden religiosa Beata María Ana. "
            "Los importes totales de conciertos SAS superaron 800 M€ entre 2019 y 2024 "
            "según resoluciones BOJA y el Portal de Transparencia de la Junta."
        )
    if any(w in q for w in ("promesa", "electoral", "campaña", "partido", "pp", "vox")):
        return (
            "Este sistema no evalúa programas electorales ni partidos. "
            "Lo que sí mide es la evolución estadística de las demoras antes y después de eventos documentados. "
            "Para comparar promesas con resultados, consulta el Portal de Transparencia de la Junta "
            "(juntadeandalucia.es/transparencia) y los informes del Defensor del Pueblo Andaluz."
        )
    if any(w in q for w in ("metod", "mann-whitney", "p-valor", "estadístic", "fdr")):
        return (
            "El análisis usa Mann-Whitney U, una prueba no paramétrica que compara "
            "las demoras en los 90 días siguientes a cada evento con la línea base del año anterior. "
            "Se aplica corrección FDR (Benjamini-Hochberg) sobre las 96 combinaciones para controlar "
            "falsos positivos. Un p-valor bajo y efecto alto indica asociación estadística, "
            "NO causalidad demostrada."
        )
    if any(w in q for w in ("señal", "resultado", "análisis", "patron")):
        lines = [l for l in context.split("\n") if l.strip().startswith("-")]
        top = "\n".join(lines[:6]) or "Ejecuta primero el análisis pulsando «Analizar»."
        return f"Señales estadísticas principales detectadas:\n{top}\nRecuerda: asociación ≠ causalidad."

    return (
        "Puedo responder preguntas sobre: metodología estadística, eventos documentados en el BOJA, "
        "empresas con conciertos SAS, impacto en listas de espera, o cómo interpretar los resultados. "
        "Para activar respuestas con IA avanzada, añade GROQ_API_KEY al fichero .env del servidor "
        "(groq.com ofrece un nivel gratuito)."
    )


@router.post("/ask")
async def ask_assistant(
    db: Annotated[Session, Depends(get_db)],
    question: str = Body(..., embed=True),
):
    results = db.query(AnalysisResult).order_by(AnalysisResult.ejecutado_en.desc()).limit(96).all()
    events  = db.query(PrivatizacionEvent).order_by(PrivatizacionEvent.fecha).all()
    context = _build_context(results, events)

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            answer = await _ask_groq(question, context, groq_key)
            return {"answer": answer, "source": "groq"}
        except Exception as exc:
            logger.warning("Groq falló (%s) — usando respuesta local", exc)

    return {"answer": _local_answer(question, context), "source": "local"}


@router.get("/tips")
def get_tips():
    """Sugerencias proactivas para guiar al usuario."""
    return [
        {"id": 1, "text": "Pulsa «Analizar» para detectar patrones estadísticos en las 96 combinaciones provincia×especialidad."},
        {"id": 2, "text": "Haz clic en cualquier celda del mapa para ver la evolución temporal de esa especialidad en esa provincia."},
        {"id": 3, "text": "Los eventos con ✓ BOJA verificado tienen número de resolución oficial publicado en el BOJA."},
        {"id": 4, "text": "El «lag óptimo» indica cuántos días después del evento la correlación fue máxima."},
        {"id": 5, "text": "Correlación estadística no implica causalidad: factores estacionales, pandémicos o demográficos pueden explicar los patrones."},
        {"id": 6, "text": "Quirónsalud, Vithas y HM Hospitales son los principales beneficiarios de conciertos SAS según el Portal de Transparencia."},
        {"id": 7, "text": "El Defensor del Pueblo Andaluz estima entre 800 y 1.400 fallecimientos anuales en pacientes en espera de intervención."},
        {"id": 8, "text": "Puedes exportar los datos usando los endpoints /api/data/waiting-lists y /api/data/events con formato JSON."},
    ]
