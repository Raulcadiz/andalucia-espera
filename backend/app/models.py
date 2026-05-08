from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class WaitingRecord(Base):
    __tablename__ = "waiting_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    provincia: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    especialidad: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    pacientes_espera: Mapped[int] = mapped_column(Integer, nullable=False)
    demora_media_dias: Mapped[float] = mapped_column(Float, nullable=False)
    fuente: Mapped[str] = mapped_column(String(256), nullable=False, default="sintético")
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PrivatizacionEvent(Base):
    __tablename__ = "privatizacion_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(128), nullable=False)
    descripcion: Mapped[str] = mapped_column(String(512), nullable=False)
    consejeria: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    importe_euros: Mapped[float | None] = mapped_column(Float, nullable=True)
    fuente_url: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    confirmado: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ejecutado_en: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )
    metrica: Mapped[str] = mapped_column(String(256), nullable=False)
    provincia: Mapped[str | None] = mapped_column(String(64), nullable=True)
    especialidad: Mapped[str | None] = mapped_column(String(128), nullable=True)
    p_value: Mapped[float] = mapped_column(Float, nullable=False)
    effect_size: Mapped[float] = mapped_column(Float, nullable=False)
    signal_strength: Mapped[str] = mapped_column(String(32), nullable=False)
    narrative: Mapped[str | None] = mapped_column(String(4096), nullable=True)
    lookback_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=2160)
    n_events: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_lag_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    consistency: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_median: Mapped[float | None] = mapped_column(Float, nullable=True)
