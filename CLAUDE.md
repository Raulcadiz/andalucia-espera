# andalucia-espera

Dashboard estadístico: listas de espera SAS vs
eventos de privatización en Andalucía.

## Stack
Backend: Python 3.12 + FastAPI + SQLite + APScheduler
Análisis: chrono-correlator (pip install chrono-correlator)
Frontend: React 18 + Vite + Recharts + Tailwind CSS
Deploy: VPS Linux + Nginx + systemd + Puerto 0112

## Fuentes de datos
- SAS listas de espera: datos.gob.es + juntadeandalucia.es/sas
- BOJA contratos: boja.juntadeandalucia.es
- IECA estadísticas: juntadeandalucia.es/institutodeestadisticaycartografia

## Reglas
- Sin dependencias innecesarias
- SQLite local, sin servidor de BD externo
- El análisis estadístico NUNCA afirma causalidad
- Datos públicos únicamente
- GPL-3.0
