<div align="center">

# 🛰️ Cargonaut

**A logistics control tower — live fleet tracking, dispatch optimization, and multi-tenant operations, in one app.**

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostGIS](https://img.shields.io/badge/PostgreSQL_16-PostGIS_3.4-336791?logo=postgresql&logoColor=white)](https://postgis.net)
[![React 18](https://img.shields.io/badge/React_18-Vite-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-A855F7)](LICENSE)

</div>

---

## What it is

Cargonaut is a full-stack operations console for a freight fleet. Dispatchers see every vehicle,
its live position, its remaining stops, and how full it is — then act on it without leaving the screen.

The interface is a three-pane control tower: navigation, a filterable fleet list, and a detail panel
with capacity, route map, documents, and cargo photo proof. **Dark theme is the default**, with light
and system options in Settings.

| | |
|---|---|
| **Live tracking** | Per-vehicle countdown timers, waypoint rails, and a Leaflet map with route polylines and animated position markers |
| **Load capacity** | Illustrated side-view vehicles (semi / box truck / van) that fill proportionally to their cargo load |
| **Dispatch** | Greedy VRP assignment of orders to drivers, offloaded to Celery |
| **Multi-tenant** | Every row is scoped by `tenant_id`, enforced with PostgreSQL Row-Level Security |
| **Analytics** | KPI cards with sparklines, volume trends, fleet composition, SLA compliance |
| **Theming** | One CSS-variable palette drives both themes, including the map tiles and vehicle illustrations |

---

## Stack

| Layer | Technology |
|-------|-----------|
| API | Python 3.12 · FastAPI (fully async) · SQLAlchemy 2.0 |
| Database | PostgreSQL 16 + PostGIS 3.4 — geofencing and distance math in the DB |
| Background work | Celery + Redis — route optimization and telemetry ingestion |
| Optimizer | Pandas + greedy VRP heuristic (swap in OR-Tools for production loads) |
| Frontend | React 18 · Vite 6 · TailwindCSS · TanStack Query · Zustand · Leaflet · Recharts |
| Auth | JWT bearer tokens carrying `tenant_id`, consumed by RLS policies |
| Delivery | Docker Compose (5 services) · nginx-served SPA · GitHub Actions |

---

## Run it

### Docker (everything)

```bash
git clone https://github.com/NikunjSharma-dev/cargonaut
cd cargonaut
cp .env.example .env
docker compose up --build -d
```

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |

nginx inside the frontend container proxies `/api/` and `/ws/` to the API service, so the browser
only ever talks to port 3000 — no CORS hop in local development.

### Frontend only

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000, proxies /api to :8000
```

### API only

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

---

## Project layout

```
├── app/                     FastAPI service
│   ├── api/v1/endpoints/    auth · orders · drivers · vehicles · hubs
│   │                        dispatch · tracking · analytics · tenants
│   ├── core/                config, database session, security/JWT
│   ├── models/              SQLAlchemy models (tenant-scoped)
│   ├── schemas/             Pydantic request/response contracts
│   ├── services/            VRP optimizer
│   └── workers/             Celery app and tasks
├── frontend/
│   └── src/
│       ├── components/      layout shell, UI kit, vehicle illustrations
│       ├── pages/           dashboard · tracking · orders · dispatch · fleet
│       │                    drivers · hubs · analytics · settings
│       ├── store/           auth and theme (Zustand + persist)
│       └── index.css        design tokens for both themes
├── analytics/sql_views/     reporting views for BI tools
├── infra/                   API Dockerfile, DB init, Prometheus config
├── migrations/              Alembic
└── docker-compose.yml
```

---

## Theming

Colors live in one place: `frontend/src/index.css` defines a light palette on `:root` and overrides
it under `.dark`. Tailwind's semantic tokens (`bg-app-surface`, `text-heading`, `border-app-border`, …)
resolve to those variables, so both themes stay in sync from a single edit. The preference persists to
`localStorage` and is applied by an inline script before first paint, so there is no flash of the wrong theme.

Change the accent color for the whole app:

```css
/* frontend/src/index.css */
:root { --primary: #e8606d; }   /* light */
.dark { --primary: #f06d79; }   /* dark  */
```

---

## Deployment

The frontend deploys to **GitHub Pages** on every push to `main` that touches `frontend/`
(`.github/workflows/deploy-pages.yml`). The workflow injects the project base path, builds, and adds a
`404.html` SPA fallback so deep links resolve.

> **Note:** GitHub Pages is static hosting — it serves the UI only. The FastAPI service, Postgres,
> Redis, and Celery worker need a host that runs processes. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for
> backend hosting options and the environment variables to set.

---

## Testing

```bash
pytest                    # API tests
cd frontend && npm run lint
```

---

## License

MIT — see [LICENSE](LICENSE).
