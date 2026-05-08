# Andalucía Espera

Dashboard estadístico que analiza si las listas de espera del Servicio Andaluz de Salud (SAS)
cambian sistemáticamente antes o después de eventos de privatización o recortes presupuestarios.

## Advertencia metodológica

Este proyecto detecta **asociaciones estadísticas**, no causalidad. Un patrón detectado
significa que los datos muestran una correlación temporal, **no** que la privatización
sea la causa del cambio en las listas de espera.

## Stack

| Componente | Tecnología |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLite |
| Análisis | [chrono-correlator](https://github.com/Raulcadiz/chrono-correlator) |
| Frontend | React 18 + Vite + Recharts + Tailwind CSS |
| Deploy | Nginx (puerto 112) + systemd |

## Arranque rápido (desarrollo)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8112

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

La API queda en http://localhost:8112  
El frontend en http://localhost:5173

## Fuentes de datos públicas

- **SAS listas de espera**: datos.gob.es + juntadeandalucia.es/sas
- **BOJA contratos**: boja.juntadeandalucia.es
- **IECA estadísticas**: juntadeandalucia.es/institutodeestadisticaycartografia

Si las URLs no están disponibles, el sistema arranca en **modo desarrollo** con datos
sintéticos realistas basados en patrones 2018-2024.

## Deploy en VPS

```bash
# Construir frontend
cd frontend && npm run build
sudo cp -r dist/* /var/www/andalucia-espera/

# Instalar servicio
sudo cp systemd/andalucia-espera.service /etc/systemd/system/
sudo systemctl enable andalucia-espera
sudo systemctl start andalucia-espera

# Configurar Nginx
sudo cp nginx/andalucia-espera.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/andalucia-espera.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Licencia

GPL-3.0 — Raúl Gallardo (g3v3r)
