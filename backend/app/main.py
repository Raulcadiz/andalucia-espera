import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import analysis as analysis_router
from .routers import data as data_router
from .scheduler import fetch_and_store_data, start_scheduler, stop_scheduler

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)

_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    logger.info("Tablas SQLite creadas / verificadas")

    # Carga inicial de datos si la BD está vacía
    from .database import SessionLocal
    from .models import WaitingRecord
    db = SessionLocal()
    try:
        count = db.query(WaitingRecord).count()
        if count == 0:
            logger.info("BD vacía — cargando datos iniciales")
            fetch_and_store_data()
    finally:
        db.close()

    start_scheduler()
    yield

    # Shutdown
    stop_scheduler()
    logger.info("Scheduler detenido")


app = FastAPI(
    title="Andalucía Espera",
    description=(
        "Dashboard estadístico: listas de espera SAS vs "
        "eventos de privatización en Andalucía. "
        "Las correlaciones detectadas NO implican causalidad."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router.router)
app.include_router(analysis_router.router)

# Servir el frontend de React si el build existe
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # No interceptar rutas de la API
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIST / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
else:
    @app.get("/")
    def root():
        return {
            "status": "backend ok",
            "message": "Frontend no construido. Ejecuta: cd frontend && npm run build",
            "docs": "/docs",
        }
