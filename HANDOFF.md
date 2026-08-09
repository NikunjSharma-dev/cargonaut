# Cargonaut — Build Handoff

Multi-tenant SaaS fleet management platform. Phase 1 items 1–3 of 12 are done and pushed.
This document is written to be pasted into a fresh AI session as context.

**Repo:** `/Users/niks/vscode/fleetforge` (dir is `fleetforge`, product is `Cargonaut`)
**Remote:** `https://github.com/NikunjSharma-dev/cargonaut.git`
**Branch with the work:** `feat/phase1-tracking-geofencing-shifts` (commit `8234661`, not yet merged, no PR opened)
**Baseline as of handoff:** 43 pytest tests pass, `ruff check app/` clean, `npx vite build` succeeds.

---

## Stack

| Layer | What |
|---|---|
| Backend | FastAPI 0.115, SQLAlchemy 2.0 async, PostgreSQL 16 + PostGIS, Alembic |
| Frontend | React 18, Vite 6, Tailwind 3.4, **Mapbox GL JS** (Leaflet was removed), Zustand, TanStack Query v5, recharts |
| Auth | JWT, multi-tenant; every row carries `tenant_id`, plus Postgres RLS |
| Jobs | Celery + Redis (`worker` and `beat` services) |
| Deploy | Docker Compose locally; GitHub Pages for the frontend demo build |

---

## Done

### 1. Live vehicle tracking with route replay ✅
- Reuses the existing **`gps_pings`** table instead of adding `vehicle_locations` — it already stored the same shape. Migration `004` adds only the `(vehicle_id, timestamp)` index.
- `GET /api/v1/tracking/vehicles/{id}/history?start=&end=&limit=` — tenant-scoped, oldest-first, haversine trail length, `truncated` flag.
- `frontend/src/components/RouteReplayMap.jsx` + `RouteScrubber.jsx`, wired into `TrackingPage.jsx`.

### 2. Geofencing + alerts ✅
- Migration `005`: `geofences`, `geofence_events`.
- `app/services/geofencing.py` (pure geometry) and `geofence_detection.py` (DB-aware).
- Full CRUD at `/api/v1/geofences/`, alert feed at `/geofences/events`, acknowledge endpoint.
- `GeofencesPage.jsx` with click-to-draw circle + polygon; `useGeofenceAlerts` hook mounted in `AppLayout` toasts crossings app-wide.
- `sweep_geofences` Celery beat task every 10 min as a safety net.

### 3. Driver assignment & shift scheduling ✅
- Migration `006`: `shifts`. Full CRUD at `/api/v1/shifts/`.
- **Double-booking rejected server-side for both driver and vehicle**, 409 with a message naming the conflict.
- `ShiftsPage.jsx` — week navigator, 7-day grid, create/edit/delete modal.

---

## Remaining TODO

### Phase 1 — Core Fleet ✅
- [x] **4. Fuel & maintenance log tracking** — `maintenance_logs` table (vehicle_id, type, cost, odometer, date, notes). Migration 007, CRUD API + per-vehicle table view with "Add Log" modal in `MaintenancePage.jsx`.
- [x] **5. Multi-tenant RBAC** — roles `admin` / `dispatcher` / `driver`. Wired `require_role()` across endpoints. Frontend filters sidebar and scopes driver access to assigned vehicle.

### Phase 2 — AI/ML ✅
- [x] **6. ETA prediction** — XGBoost regression on historical trips (`app/ml/eta_model.pkl`). Serves at `POST /predict/eta`. `scripts/generate_synthetic_trips.py` generated 5k training records. Predicted ETA badge on active delivery card.
- [x] **7. Route optimization (multi-stop)** — 2-Opt local search solver served at `POST /dispatch/optimize/route`. Frontend shows optimized vs original order sequence with saved distance and percentage.
- [x] **8. Anomaly detection** — Isolation Forest on trip features (avg speed, idle time, fuel rate, harsh braking). Serves at `POST /predict/anomalies` and `GET /predict/anomalies`. AI Telemetry Anomaly Panel rendered in `AnalyticsPage.jsx`.
- [x] **9. Dispatch AI assistant** — Chat panel in `DispatchPage.jsx` with typed tool calling (`get_nearest_available`, `create_geofence`, `assign_vehicle`). Server-side confirmation gate for destructive actions.

### Phase 3 — Polish/UX ✅
- [x] **10. Analytics dashboard** — KPI cards (on-time %, active vehicles, avg delivery time, distance today) + recharts in `DashboardPage.jsx` and `AnalyticsPage.jsx`.
- [x] **11. Theme + empty/loading states** — verified light/dark theme tokens across all new pages; fixed `apiFetch()` error propagation in `frontend/src/utils/api.js`.
- [x] **12. Public demo mode** — `DEMO_MODE` env flag; `POST /auth/guest` endpoint for instant read-only guest login straight into populated demo dashboard.

---

## Critical gotchas — read before touching this code

These cost real debugging time. They are not obvious from reading the source.

**1. Mapbox: never guard layer creation on `isStyleLoaded()`.**
`Style.loaded()` returns false until *every basemap tile* has downloaded, so it is false during the `style.load` event. Guarding `addSource`/`addLayer` on it means they never run and the map renders as an empty basemap. Gate on a counter incremented by the `style.load` handler instead — see `RouteReplayMap.jsx`. This bug shipped twice and was caught only in review.

**2. Map bugs are invisible locally without a token.**
With no `VITE_MAPBOX_TOKEN`, both map components render a "Map unavailable" panel, so anything broken inside them looks fine. Set a token before doing map work.

**3. `VITE_*` vars are build-time, not runtime.**
Vite inlines them. The nginx stage in `frontend/Dockerfile` has no build step, so a compose `environment:` entry never reaches the bundle. They must be `build.args` + `ARG`/`ENV` in the Dockerfile. Already wired for `VITE_API_URL`, `VITE_WS_URL`, `VITE_MAPBOX_TOKEN`.

**4. Never wrap a raw PostGIS query in a bare `except`.**
On PostgreSQL a failed statement poisons the whole transaction; the caller's next `flush()`/`commit()` then raises `InFailedSqlTransaction`. Use `async with db.begin_nested():` (SAVEPOINT) so the fallback path leaves a usable transaction. Pattern is in `geofence_detection.py::_fences_containing`.

**5. UUID columns are `UUID(as_uuid=False)` — i.e. strings.**
Pydantic parses `UUID` fields into `uuid.UUID` objects. Passing one into a model attribute makes SQLAlchemy call `.replace()` on it and crash. **Always `str()` a UUID before assigning it to a model.** This was a live bug in `POST /drivers/`; now fixed, but the same trap exists anywhere new.

**6. `npm run lint` is broken repo-wide.**
ESLint 9 needs `eslint.config.js` and there isn't one. Don't add one mid-feature — it would flood the diff with pre-existing errors. **`npx vite build` is the real frontend gate.**

**7. Tests run on in-memory SQLite, not Postgres.**
`tests/test_api.py` monkeypatches every `Geometry` column to `Text` at import. So **PostGIS functions never execute under test** — any `ST_*` code path needs a Python fallback that the tests actually exercise. Set `TEST_DATABASE_URL` to run against real Postgres.

**8. Use `ruff` directly, not `python -m ruff`.**
`python -m ruff check .` hangs in this environment. `ruff check app/` returns instantly.

**9. Three pre-existing ruff errors in `tests/test_api.py`** (import placement/sorting). They predate this work; `ruff check app/` is the clean gate.

---

## Known issues not yet fixed

- **`apiFetch()` in `frontend/src/utils/api.js:88` swallows every error and returns `{}`.** This contradicts commit `59b0b01` ("Never fabricate API payloads on failure") and will actively undermine item 11's empty states — a failed fetch is indistinguishable from empty data. Worth fixing as part of Phase 3.
- **README still documents Leaflet** (3 mentions) including "tiles that invert in dark mode". Inaccurate since the Mapbox swap — Mapbox uses real `dark-v11`/`light-v11` styles.
- **Bundle is 2.77 MB** (~767 KB gzip); mapbox-gl is ~800 KB of it. Vite warns on every build. Consider a dynamic import for map routes before the Pages demo ships.
- **`TrackingPage.jsx` fleet list is hardcoded demo data** (the `FLEET` const), not API-driven. Cards match real vehicles by `registration_number`; unmatched cards fall back to a static path with a visible note.
- **No RBAC anywhere yet.** Every endpoint is authenticated and tenant-scoped, but role is never checked — a `driver` can read the whole tenant's geofences and roster. That's item 5.

---

## Conventions to follow

**Backend**
- Endpoints live in `app/api/v1/endpoints/`, registered in `app/api/v1/router.py`.
- Always scope by tenant: `where(Model.tenant_id == current_user.tenant_id)`. **A row from another tenant must 404, never 403.** There's a test asserting this per feature.
- Path params for ids: type them `UUID` so a malformed id yields 422 rather than a 500, then `str()` before comparing to a column.
- Pure logic goes in `app/services/`; keep it DB-free so it's unit-testable.
- Migrations follow the numbered pattern `00N_description.py` with an explicit `down_revision`. Current head: **`006_driver_shifts`**.

**Frontend**
- TanStack Query v5 object syntax; `api` from `../utils/api` with paths that **omit** the `/api/v1` prefix.
- UI primitives from `../components/ui`: `SectionHeader`, `EmptyState`, `Modal`, `FormField`, `Spinner`, `StatusBadge`.
- **Semantic tokens only** — `bg-app-surface`, `bg-app-panel`, `border-app-border`, `text-heading`, `text-muted`, `text-primary`, `bg-primary-soft`, and the `.input` / `.select` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` classes. **Never hardcode a hex or use a `dark:` variant** — tokens handle both themes; dark is the default.
- For JS-driven colors (canvas, Mapbox), use `useResolvedTheme()` from `store/themeStore.js`. Subscribing to the raw store value misses OS-level flips under `theme: 'system'`.
- New page checklist: route in `App.jsx`, nav item in `Sidebar.jsx` (`NAV_ITEMS`), title in `AppLayout.jsx` (`PAGE_TITLES`).
- Comments explain *why*, not *what*.

**Testing** — every new endpoint gets at least: happy path, an auth failure (no token → **403**, since `HTTPBearer` returns 403 not 401), and a cross-tenant isolation check.

---

## Design decisions already made (don't relitigate)

| Decision | Choice | Why |
|---|---|---|
| Map library | **Mapbox GL JS** | User chose it over the incumbent Leaflet; Leaflet fully removed |
| Breadcrumb storage | **Reuse `gps_pings`** | Already had the exact shape; avoids two sources of truth |
| Geofence shape | **Both circle + polygon, stored as polygon** | Circles buffered to a ring at write time → one containment query |
| Geofence detection | **Inline on ping ingest**, Celery sweep as safety net | Instant, no polling lag, matches the existing delivery-geofence path |
| Shift windows | **Half-open `[start, end)`** | An 18:00 handover isn't an overlap |
| Geofence event log | **Every transition recorded**, `is_alert` gates surfacing | The event log *is* the occupancy state machine — suppressing a write strands the fence and loses the matching exit |

---

## Open questions needing a human decision

1. **Item 7:** OR-Tools (heavier, better solutions) vs nearest-neighbour + 2-opt (already partly built)?
2. **Item 9:** Anthropic API key handling, and how far the confirm-before-execute gate should extend — all writes, or only destructive ones?
3. **Item 12:** How locked-down is the guest login? Read-only enforcement needs to be server-side, not just hidden UI.
4. Should the Mapbox bundle be code-split before the GitHub Pages demo ships?

---

## Commands

```bash
# Tests (~12s). Use the timeout; a bare run can look like a hang.
timeout 300 python -m pytest -q -p no:cacheprovider

# Lint backend — NOT `python -m ruff`, that hangs
ruff check app/

# Frontend build (the real lint gate)
cd frontend && npx vite build

# Migrations
alembic upgrade head

# Full stack — now includes a `beat` container for the geofence sweep
docker compose up
```

**Environment:** `VITE_MAPBOX_TOKEN` must be set (URL-restricted public token) both locally and as a GitHub repo secret for the Pages workflow. Without it, maps degrade to a "Map unavailable" panel rather than breaking.

---

## Workflow the user expects

- Work **one item end-to-end** (migration → API → frontend) before starting the next. Run tests + build after each.
- Run `/code-review` on the diff after each numbered item, before checking it off. It has caught two ship-blocking bugs so far — take it seriously, but verify claims rather than accepting them blindly.
- Run `/security-review` before finalizing any PR — especially items 5, 9, and 12.
- Ask rather than guess on design decisions; the user wants to be consulted.
- **`/doctor` is a built-in CLI command the user must type themselves. `/debug` and `/batch` are NOT installed** despite being mentioned in the original brief.
