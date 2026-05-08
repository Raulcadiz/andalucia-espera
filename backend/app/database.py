import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv()

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./data/andalucia.db")

# Ensure the data directory exists for SQLite paths
if _raw_url.startswith("sqlite:///"):
    _db_path = Path(_raw_url.replace("sqlite:///", ""))
    _db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    _raw_url,
    connect_args={"check_same_thread": False} if "sqlite" in _raw_url else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
