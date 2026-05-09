"""
Generador de informes PDF descargables.
Usa reportlab (platypus) — sin dependencias de sistema (GTK, Cairo, etc.).
Endpoint: GET /api/report/pdf
"""
import io
import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AnalysisResult, PrivatizacionEvent, WaitingRecord
from .budget import _SERIES as BUDGET_SERIES
from .legal import _LEYES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/report", tags=["report"])

# ─── Paleta de colores ────────────────────────────────────────────────────────
GREEN  = (0.114, 0.620, 0.459)   # verde-sas  #1D9E75
RED    = (0.886, 0.294, 0.290)   # rojo-alerta #E24B4A
AMBER  = (0.961, 0.620, 0.043)   # amber-500
DARK   = (0.122, 0.137, 0.153)   # fondo-oscuro #1e2327
GRAY   = (0.60,  0.60,  0.60)
LGRAY  = (0.93,  0.93,  0.93)
WHITE  = (1.0,   1.0,   1.0)

SIGNAL_COLOR = {
    "strong":   RED,
    "moderate": AMBER,
    "weak":     (0.220, 0.741, 0.984),  # sky-400
    "none":     GRAY,
}


def _build_pdf(db: Session) -> bytes:
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=(21 * cm, 29.7 * cm),  # A4
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.5 * cm, bottomMargin=2 * cm,
        title="Andalucía Espera — Informe estadístico",
        author="Andalucía Espera (GPL-3.0)",
        subject="Listas de espera SAS vs privatización sanitaria",
    )

    styles = getSampleStyleSheet()
    W = doc.width

    def style(name="Normal", **kwargs):
        return ParagraphStyle(name, parent=styles[name], **kwargs)

    S = {
        "h1":    style("Heading1", fontSize=20, textColor=colors.Color(*GREEN), spaceAfter=6, leading=24),
        "h2":    style("Heading2", fontSize=13, textColor=colors.Color(*DARK),  spaceAfter=4, leading=16),
        "h3":    style("Heading3", fontSize=10, textColor=colors.Color(*DARK),  spaceAfter=2, spaceBefore=8),
        "body":  style("Normal",   fontSize=9,  leading=13, spaceAfter=4),
        "small": style("Normal",   fontSize=7.5, textColor=colors.Color(*GRAY), leading=10),
        "badge": style("Normal",   fontSize=8,  leading=10),
        "warn":  style("Normal",   fontSize=8,  textColor=colors.Color(*RED), leading=10),
        "center":style("Normal",   fontSize=9,  alignment=TA_CENTER),
        "right": style("Normal",   fontSize=9,  alignment=TA_RIGHT),
        "cover_title": style("Heading1", fontSize=28, textColor=colors.Color(*GREEN), leading=34, spaceAfter=4),
        "cover_sub":   style("Normal",   fontSize=13, textColor=colors.Color(*DARK),  leading=18),
    }

    def hr(color=LGRAY, thickness=0.5):
        return HRFlowable(width="100%", thickness=thickness, color=colors.Color(*color), spaceAfter=8, spaceBefore=4)

    def sp(h=0.3):
        return Spacer(1, h * cm)

    def tbl_style(header_color=DARK, row_alt=LGRAY):
        return TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0),  colors.Color(*header_color)),
            ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
            ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, 0),  8),
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(*row_alt)]),
            ("GRID",        (0, 0), (-1, -1), 0.25, colors.Color(*GRAY)),
            ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING",   (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ])

    story = []
    now = datetime.now()

    # ── PORTADA ───────────────────────────────────────────────────────────────
    story += [
        sp(3),
        Paragraph("Andalucía Espera", S["cover_title"]),
        Paragraph("Análisis estadístico de listas de espera SAS", S["cover_sub"]),
        sp(0.5),
        hr(GREEN, thickness=2),
        sp(0.5),
        Paragraph(
            "Listas de espera del SAS · Privatización sanitaria · Red de actores",
            style("Normal", fontSize=11, textColor=colors.Color(*GRAY)),
        ),
        sp(3),
        Paragraph(f"Generado el {now.strftime('%d/%m/%Y a las %H:%M')}", S["small"]),
        Paragraph("Datos: BOJA / Junta de Andalucía (CC BY 4.0) · GPL-3.0", S["small"]),
        Paragraph(
            "⚠ ADVERTENCIA: Las asociaciones estadísticas detectadas NO implican causalidad. "
            "Los datos de listas de espera son sintéticos calibrados con parámetros reales del SAS.",
            S["warn"],
        ),
    ]

    # ── RESUMEN EJECUTIVO ─────────────────────────────────────────────────────
    story += [sp(1), hr(), Paragraph("Resumen ejecutivo", S["h1"])]

    results = (
        db.query(AnalysisResult)
        .order_by(AnalysisResult.ejecutado_en.desc())
        .limit(300)
        .all()
    )
    events_db = db.query(PrivatizacionEvent).all()
    records_count = db.query(WaitingRecord).count()

    by_key: dict[str, AnalysisResult] = {}
    rank = {"strong": 3, "moderate": 2, "weak": 1, "none": 0}
    for r in results:
        k = f"{r.provincia}::{r.especialidad}"
        if k not in by_key or rank.get(r.signal_strength, 0) > rank.get(by_key[k].signal_strength, 0):
            by_key[k] = r

    strong   = [r for r in by_key.values() if r.signal_strength == "strong"]
    moderate = [r for r in by_key.values() if r.signal_strength == "moderate"]
    weak     = [r for r in by_key.values() if r.signal_strength == "weak"]

    summary_data = [
        ["Indicador", "Valor"],
        ["Registros de listas de espera analizados", f"{records_count:,}".replace(",", ".")],
        ["Eventos de privatización / recortes documentados", str(len(events_db))],
        ["Combinaciones provincia × especialidad analizadas", str(len(by_key))],
        ["Señales estadísticas fuertes (p<0.05, efecto≥0.25)", str(len(strong))],
        ["Señales moderadas (p<0.05, efecto≥0.15)", str(len(moderate))],
        ["Señales débiles (p<0.05, efecto≥0.08)", str(len(weak))],
        ["Fecha del último análisis",
         results[0].ejecutado_en.strftime("%d/%m/%Y %H:%M") if results else "—"],
    ]
    t = Table(summary_data, colWidths=[W * 0.70, W * 0.30])
    t.setStyle(tbl_style())
    story += [t, sp()]

    # ── SEÑALES ESTADÍSTICAS ──────────────────────────────────────────────────
    story += [hr(), Paragraph("Señales estadísticas destacadas", S["h1"])]
    story.append(Paragraph(
        "Combinaciones con asociación fuerte o moderada entre eventos de privatización "
        "y demora de espera. Método: Mann-Whitney U + corrección FDR (Benjamini-Hochberg). "
        "Ventana: 90 días post-evento vs. línea base 1 año anterior.",
        S["body"],
    ))
    story.append(sp(0.3))

    top = sorted(
        [r for r in by_key.values() if r.signal_strength in ("strong", "moderate")],
        key=lambda r: (rank.get(r.signal_strength, 0), -r.p_value),
        reverse=True,
    )[:25]

    if top:
        rows = [["Provincia", "Especialidad", "Señal", "p-valor", "Efecto", "Lag"]]
        for r in top:
            lag = f"{r.best_lag_hours // 24}d" if r.best_lag_hours else "—"
            rows.append([
                r.provincia or "—",
                (r.especialidad or "—").capitalize(),
                r.signal_strength.capitalize(),
                f"{r.p_value:.4f}",
                f"{'+'if r.effect_size>0 else ''}{r.effect_size:.3f}",
                lag,
            ])
        t = Table(rows, colWidths=[W*0.18, W*0.22, W*0.14, W*0.14, W*0.14, W*0.10])
        ts = tbl_style()
        for i, r in enumerate(top, start=1):
            c = SIGNAL_COLOR.get(r.signal_strength, GRAY)
            ts.add("TEXTCOLOR", (2, i), (2, i), colors.Color(*c))
            ts.add("FONTNAME",  (2, i), (2, i), "Helvetica-Bold")
        t.setStyle(ts)
        story.append(t)
    else:
        story.append(Paragraph("Sin señales significativas en el último análisis.", S["body"]))

    # ── MARCO LEGAL ───────────────────────────────────────────────────────────
    story += [sp(), hr(), Paragraph("Marco legal y estado de cumplimiento", S["h1"])]

    ESTADO_LABEL = {"incumplido": "INCUMPLIDO", "parcial": "PARCIAL", "activo": "ACTIVO"}
    ESTADO_COLOR = {"incumplido": RED, "parcial": AMBER, "activo": GREEN}

    for ley in _LEYES:
        ultimo_val = float(ley["hitos"][-1][1])
        estado = "activo" if ultimo_val >= 1.0 else ("parcial" if ultimo_val >= 0.5 else "incumplido")
        estado_c = colors.Color(*ESTADO_COLOR[estado])

        header = Table(
            [[
                Paragraph(f"<b>{ley['ley']}</b>", S["body"]),
                Paragraph(f"<b><font color='{estado_c.hexval()}'>{ESTADO_LABEL[estado]}</font></b>", S["badge"]),
            ]],
            colWidths=[W * 0.78, W * 0.22],
        )
        header.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE")]))

        story.append(KeepTogether([
            header,
            Paragraph(f"<i>Garantía:</i> {ley['garantia']}", S["small"]),
            Paragraph(f"<i>Realidad:</i> {ley['realidad']}", S["small"]),
            sp(0.15),
        ]))

    # ── FLUJO DE DINERO ───────────────────────────────────────────────────────
    story += [hr(), Paragraph("Flujo de dinero público a sanidad privada (2018–2025)", S["h1"])]

    total = sum(d["gasto_millones"] for d in BUDGET_SERIES if not d.get("proyeccion"))
    story.append(Paragraph(
        f"Gasto ejecutado acumulado 2018-2024: <b>{total} M€</b>. "
        f"Presupuesto 2025: <b>502 M€</b>. "
        f"Acuerdo marco septiembre 2025: <b>533 M€</b> a 4 años con 38 empresas adjudicatarias.",
        S["body"],
    ))

    budget_rows = [["Año", "Gasto (M€)", "Déficit prof. (%)", "Pacientes espera", "Nota"]]
    for d in BUDGET_SERIES:
        nota = "Presupuestado" if d.get("proyeccion") else "Ejecutado"
        budget_rows.append([
            str(d["año"]),
            str(d["gasto_millones"]),
            f"{d['deficit_pct']}%",
            f"{d['pacientes_espera']:,}".replace(",", "."),
            nota,
        ])
    t = Table(budget_rows, colWidths=[W*0.10, W*0.18, W*0.22, W*0.28, W*0.22])
    t.setStyle(tbl_style())
    story.append(t)

    # ── METODOLOGÍA Y DESCARGO ────────────────────────────────────────────────
    story += [sp(), hr(), Paragraph("Metodología y descargo de responsabilidad", S["h1"])]

    metodologia = [
        ("<b>Motor estadístico</b>: chrono-correlator v1.2.0 (Apache 2.0). "
         "Test de Mann-Whitney U para comparar la distribución de demoras "
         "en los 90 días posteriores a cada evento vs. línea base del año anterior."),
        ("<b>Corrección de múltiples comparaciones</b>: FDR (Benjamini-Hochberg) "
         "sobre 96 combinaciones simultáneas (8 provincias × 12 especialidades)."),
        ("<b>Estrategia de línea base</b>: same_month — cada evento se compara "
         "con el mismo mes del año anterior para reducir ruido estacional."),
        ("<b>Umbrales de señal</b>: fuerte = efecto ≥ 0.25 + consistencia ≥ 55%; "
         "moderada = efecto ≥ 0.15 + consistencia ≥ 35%; débil = efecto ≥ 0.08."),
        ("<b>Lag sweep</b>: find_best_lag barre 0–720 horas en pasos de 72 h "
         "para encontrar el desfase con mayor efecto estadístico."),
        ("<b>Datos de listas de espera</b>: sintéticos calibrados con parámetros "
         "reales del SAS (datos oficiales sin API pública disponible). "
         "Eventos: BOJA y fuentes oficiales documentadas."),
        ("⚠ <b>ASOCIACIÓN ESTADÍSTICA ≠ CAUSALIDAD</b>. Factores estacionales, "
         "demográficos, pandémicos u otros no controlados pueden explicar "
         "los patrones detectados. Este informe no atribuye responsabilidad "
         "individual a ningún actor."),
    ]
    for p in metodologia:
        story.append(Paragraph(p, S["small"]))
        story.append(sp(0.1))

    story += [
        sp(0.3),
        hr(GRAY),
        Paragraph(
            f"Andalucía Espera · GPL-3.0 · github.com/Raulcadiz/andalucia-espera · "
            f"Generado el {now.strftime('%d/%m/%Y')}",
            style("Normal", fontSize=7, textColor=colors.Color(*GRAY), alignment=TA_CENTER),
        ),
    ]

    doc.build(story)
    return buf.getvalue()


@router.get("/pdf")
def download_pdf(db: Session = Depends(get_db)):
    """Genera y descarga el informe estadístico completo en PDF."""
    try:
        pdf_bytes = _build_pdf(db)
    except ImportError:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="reportlab no está instalado. Ejecuta: pip install reportlab>=4.2.0",
        )
    except Exception as exc:
        logger.error("Error generando PDF: %s", exc)
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(exc))

    fecha = datetime.now().strftime("%Y%m%d")
    filename = f"andalucia-espera-{fecha}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
