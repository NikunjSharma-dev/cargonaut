# Deployment

Cargonaut is four moving parts. Only the first is static:

| Part | What it needs |
|------|---------------|
| React SPA | Static file hosting + CDN |
| FastAPI service | A process that stays up, HTTP + WebSocket |
| Celery worker | A second long-running process (no HTTP) |
| Postgres + PostGIS, Redis | Managed data services |

**GitHub Pages can only host the first one.** It has no server, so the API, worker, database, and
Redis have to live somewhere else, and the SPA is pointed at that API over the public internet.

---

## 1. Frontend → GitHub Pages

Already wired up in `.github/workflows/deploy-pages.yml`. To turn it on:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. Push to `main` (or run the workflow manually from the Actions tab)
3. The site lands at `https://<user>.github.io/<repo>/`

The workflow sets `VITE_BASE=/<repo>/` so asset URLs resolve under the subpath, and copies
`index.html` to `404.html` so deep links like `/tracking` reach the client-side router.

### Pointing the SPA at a real API

Vite inlines env vars **at build time**, so the API URL is baked into the bundle:

```yaml
# in the build step of deploy-pages.yml
env:
  VITE_BASE: /${{ github.event.repository.name }}/
  VITE_API_URL: https://cargonaut-api.onrender.com   # your deployed API
```

Then on the API, allow the Pages origin:

```
ALLOWED_ORIGINS=https://<user>.github.io
```

Without `VITE_API_URL` the app falls back to the relative `/api/v1`, which does not exist on Pages —
the UI still renders (the tracking screen ships with sample fleet data) but live data calls fail.
That is fine for a visual demo, not for a working deployment.

> **Consider Cloudflare Pages / Netlify / Vercel instead.** All three give you per-environment
> variables, instant rollbacks, no base-path juggling, and a proper SPA rewrite rule — none of which
> Pages has. Pages is the right pick only if you specifically want the repo and the site in one place.

---

## 2. Backend hosting — the actual decision

You asked about **Neon + a Redis server**. That combination works, with one caveat about Celery.
Here are the three configurations worth considering.

### Option A — Render, everything in one place ✅ recommended to start

| Component | Service |
|-----------|---------|
| API | Render **Web Service** (Docker, `infra/Dockerfile.api`) |
| Worker | Render **Background Worker**, same image, Celery command |
| Database | Render **Postgres** (enable the `postgis` extension) |
| Redis | Render **Key Value** |

**Why:** one provider, one bill, private networking between services, and a background-worker
primitive that fits Celery exactly. `docker-compose.yml` maps almost 1:1 onto it.
**Watch out:** free instances sleep after inactivity, so the first request after idle is slow, and
free Postgres instances expire — use paid tiers for anything real.

### Option B — Neon + Upstash + Fly.io (your suggestion, refined)

| Component | Service |
|-----------|---------|
| Database | **Neon** — serverless Postgres, scales to zero, DB branching per PR |
| Redis | **Upstash** — serverless Redis over TLS (`rediss://`) |
| API + worker | **Fly.io** machines (or Railway) |

**Why Neon is genuinely good here:** it scales to zero (you pay nothing while idle), branches the
database per pull request, and supports the `postgis` extension this project needs —
run `CREATE EXTENSION IF NOT EXISTS postgis;` once, and confirm it's available on your plan before
committing.

**The Celery caveat, and it matters:** Celery workers *poll* the broker continuously. On a
per-command-priced serverless Redis like Upstash, an idle worker still burns commands around the
clock and can chew through a free tier without doing any work. Options:

- give the worker a plan priced on bandwidth/connections rather than per-command,
- raise the polling interval (`broker_transport_options={'polling_interval': 5}`),
- or drop Celery for this workload — the current tasks are light enough for FastAPI
  `BackgroundTasks`, which removes both Redis and the worker from your bill entirely.

Redis is also used for caching/pub-sub here, so Upstash still earns its place even if Celery goes.

### Option C — Railway, fastest to stand up

One project holds the API, worker, Postgres, and Redis; it reads `docker-compose.yml` and infers most
of it. Usage-credit pricing, excellent DX. Least control of the three, and costs creep once the trial
credit is gone.

### My recommendation

**Start with Render (Option A)** — the mapping from your Compose file is nearly mechanical, and having
the worker next to the API on a private network avoids a class of connection problems. **Move the
database to Neon (Option B)** when you want per-PR database branches or scale-to-zero economics;
Neon is a better database product than any bundled Postgres, and it's a connection-string swap.

Avoid: Vercel/Netlify **functions** for this API — no persistent WebSocket for the GPS stream and no
place for a Celery worker to live.

---

## 3. Environment variables

Set these on the API and the worker:

```bash
DATABASE_URL=postgresql+asyncpg://user:pass@host/db   # asyncpg driver, not psycopg2
REDIS_URL=rediss://...                                # TLS for managed Redis
CELERY_BROKER_URL=rediss://.../1
CELERY_RESULT_BACKEND=rediss://.../2
SECRET_KEY=<64+ random chars>                         # never reuse the dev value
ALLOWED_ORIGINS=https://<user>.github.io
ALLOWED_HOSTS=<api-host>
DEBUG=false
```

Neon requires SSL — append `?ssl=require` to `DATABASE_URL` if the driver doesn't negotiate it.

Run migrations once against the managed database before first boot:

```bash
DATABASE_URL=... alembic upgrade head
```

---

## 4. Pre-flight checklist

- [ ] `SECRET_KEY` regenerated (the value in `.env.example` is a placeholder)
- [ ] `DEBUG=false` in production
- [ ] `postgis` extension created on the managed database
- [ ] `alembic upgrade head` applied
- [ ] An admin user seeded — a fresh database has none, so login returns 401
- [ ] `ALLOWED_ORIGINS` matches the deployed frontend origin exactly (scheme included)
- [ ] `VITE_API_URL` set in the Pages workflow and the frontend rebuilt
