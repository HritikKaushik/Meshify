# Meshify — Deployment Runbook (A–Z)

Zero-to-live on the **low-cost always-on path**: **Railway** (all 5 app services in
one project) + managed **Neon / Upstash / Qdrant Cloud / Backblaze B2** + **RocketRide
cloud**, with **Cloudflare** optional in front for CDN/WAF. Do the steps in order; each
names the exact commands and the env vars it sets. Companion docs:
`apps/*/railway.toml` (per-service Railway config),
[PRODUCTION_DEPLOYMENT_AUDIT.md](PRODUCTION_DEPLOYMENT_AUDIT.md) (§7 = full env table,
§4 = readiness), [BACKUP_DR](BACKUP_DR.md), [KEY_ROTATION](KEY_ROTATION.md),
[OBSERVABILITY](OBSERVABILITY.md), [ENCRYPTION](ENCRYPTION.md).

> **Reality check (from the audit):** everything below is built and locally
> verified (the web image is confirmed to boot on Railway's injected `$PORT` and
> proxy `/api` over the IPv6 private network), but this is the **first** real
> deploy — expect to iterate on platform-specific quirks (private-DNS names, build
> args, custom-domain TLS). **Cost:** Railway has no permanent free tier — budget
> ~$5–20/mo (Hobby plan, usage-billed) for all five always-on services combined.
> Unlike the Render/Fly split, there is **no "background worker = paid" penalty**
> and **no spin-down**, so the worker + observability are ordinary services here.

---

## A. Prerequisites
- **Tools:** `git`, `node 22`, `pnpm 9`, `docker` (for the optional local boot), `openssl`, the `gh` CLI (optional), `flyctl`/`kubectl` only if you take those paths.
- **Accounts:** GitHub, Railway, Backblaze (B2), Neon, Upstash, Qdrant Cloud, Clerk (production instance), RocketRide; optionally Cloudflare (+ a domain) for CDN/WAF, and a GitHub App / Slack App.
- **Railway CLI** (for the CI rollout and one-off commands): `npm i -g @railway/cli`.
- Repo pushed to GitHub (CI builds/pushes images to GHCR on `main`).

## B. (Optional) prove it locally first
```bash
git clone https://github.com/HritikKaushik/Meshify.git && cd Meshify
pnpm install
cp .env.example .env            # fill in dev values
# QDRANT_URL=http://qdrant:6333 is required for the all-in-docker stack
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml run --rm --no-deps \
  -e DATABASE_URL=postgres://meshify:meshify@postgres:5432/meshify \
  platform-api node node_modules/@meshify/data-access/dist/migrate.js
curl -s localhost:5174/api/health   # web → bff → platform-api chain
```

## C. Generate production secrets
```bash
openssl rand -base64 32   # PLATFORM_API_KEY_PEPPER   (SAME value on API + BFF)
openssl rand -base64 32   # ORG_KEY_ENCRYPTION_KEY
openssl rand -base64 32   # INTEGRATION_ENCRYPTION_KEY
openssl rand -base64 32   # METRICS_TOKEN
```
Keep these in a password manager / secrets vault — **losing `ORG_KEY_ENCRYPTION_KEY`
makes every stored credential unrecoverable** (see BACKUP_DR). Placeholder/low-entropy
values are rejected at boot in production.

## D. Provision managed data services
| Service | Steps | Env produced |
|---|---|---|
| **Neon** (Postgres) | New project → copy the **pooled** connection string | `DATABASE_URL` |
| **Upstash** (Redis) | New DB → copy the TLS URL | `REDIS_URL` (`rediss://…`) |
| **Qdrant Cloud** | New free cluster → URL + API key | `QDRANT_URL`, `QDRANT_API_KEY` |
| **Backblaze B2** | Create a **private** bucket `meshify-documents`; create an **Application Key** scoped to it. Note the bucket's endpoint + region. | `S3_ENDPOINT` (`https://s3.<region>.backblazeb2.com`), `S3_REGION` (the real region, e.g. `us-west-004` — **not** `auto`), `S3_ACCESS_KEY_ID` (B2 `keyID`), `S3_SECRET_ACCESS_KEY` (B2 `applicationKey`), `S3_FORCE_PATH_STYLE=false` |
| **RocketRide** | Use the managed cloud engine (verified reachable) | `ROCKETRIDE_URI=https://api.rocketride.ai`, `ROCKETRIDE_APIKEY`, `ROCKETRIDE_OPENAI_KEY` |

## E. Apply database migrations (once now, and every release)
```bash
DATABASE_URL="postgres://…neon-pooled…" pnpm --filter @meshify/data-access migrate
```
In CI this is the gated `migrate` job in [`deploy.yml`](../../.github/workflows/deploy.yml).

## F. Configure Clerk (production instance)
1. Create a **production** Clerk app; **enable Organizations** (RBAC depends on the `org:admin` role).
2. Copy `pk_live_…` (publishable → `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_PUBLISHABLE_KEY`) and `sk_live_…` (`CLERK_SECRET_KEY`).
3. Add your app origin (Step K/L) to Clerk's allowed origins.

## G. Configure the GitHub App (optional — repo ingestion)
Create the App → webhook URL `https://app.<domain>/api/v1/webhooks/github`; enable
"Request user authorization (OAuth) during installation". Copy `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`,
`GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`.

## H. Configure the Slack App (optional — conversation ingestion)
Set the OAuth redirect to `https://app.<domain>/oauth/slack/callback`; copy
`SLACK_CLIENT_ID/SECRET`, `SLACK_SIGNING_SECRET`, and set `SLACK_REDIRECT_URI`.

## I. Deploy the backend on Railway
1. Railway → **New Project → Deploy from GitHub repo** → select this repo. Create **five
   services** in the project, all pointing at the same repo. For **each** service set:
   - **Root Directory** = `/` (repo root) — the Dockerfiles use the pnpm-workspace
     context, so the build context must be the root, **not** the app subdir.
   - **Railway Config File** (Settings → Config-as-code) = `apps/<svc>/railway.toml`.
     This is **required** — Railway looks for the config at the root directory by
     default, so without pointing it at the app's `railway.toml` it will **ignore the
     Dockerfile and fall back to its Railpack auto-builder**, which fails on this repo
     with `✖ No start command detected` (it can't guess an entrypoint for a workspace).
     Setting the config path applies the Dockerfile builder, healthcheck, restart
     policy, and — for observability — `numReplicas = 1`.
     - *Alternative if you can't find that setting:* add a service variable
       `RAILWAY_DOCKERFILE_PATH=apps/<svc>/Dockerfile` (forces the Dockerfile builder);
       then set healthcheck/replicas in the dashboard since the toml won't be read.

     | Service | Config file | Public? |
     |---|---|---|
     | `meshify-platform-api` | `apps/platform-api/railway.toml` | private |
     | `meshify-bff` | `apps/bff/railway.toml` | private |
     | `meshify-worker` | `apps/worker/railway.toml` | private |
     | `meshify-observability` | `apps/observability/railway.toml` | private (1 replica) |
     | `meshify-web` | `apps/web/railway.toml` | **public** (Step K) |

2. **Enable Private Networking** (Project → Settings; on by default). Services reach each
   other at `<name>.railway.internal` over IPv6 — the Node apps bind `::` by default, so
   this works with no code change. Set the cross-service URLs:
   - `meshify-web` → `BFF_UPSTREAM=http://meshify-bff.railway.internal:3001`
   - `meshify-bff` → `PLATFORM_API_ORIGIN=http://meshify-platform-api.railway.internal:3000`
3. **Env vars.** Put the shared backend config (Steps C/D/G) in **Shared Variables** at
   the project/environment level, then reference them from platform-api, worker, and
   observability with `${{shared.VAR}}`. **Critical:** make `PLATFORM_API_KEY_PEPPER` a
   shared variable referenced by **both** the BFF and the backend so the value is
   byte-identical. Per-service: `NODE_ENV=production`; `PLATFORM_PORT=3000` (API);
   `BFF_PORT=3001` + `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` + `ORG_KEY_ENCRYPTION_KEY`
   + `DATABASE_URL` (BFF).
4. Set `APP_ORIGIN` on `meshify-bff` to your public app URL (Step K) — the BFF
   **refuses to boot** without it in production (CSRF allowlist).
5. Set `VITE_CLERK_PUBLISHABLE_KEY` on `meshify-web` — Railway passes service variables
   as **Docker build args**, so it reaches the Vite build `ARG` (public key, safe).
6. `meshify-observability` stays at `numReplicas = 1` (its `railway.toml`); it uses a
   Postgres advisory lock, so a brief 2-replica overlap during a deploy is safe, but do
   not scale it deliberately.
7. Deploy. Watch each service's build/deploy logs.

## J. (Optional) run Postgres / Redis / Qdrant on Railway too
The default keeps the data tier on **managed Neon / Upstash / Qdrant Cloud** (better free
tiers, Neon PITR). If you prefer one bill, Railway can host all three as services (Postgres
and Redis are one-click; Qdrant from its Docker image) — you then lose Neon's branching/PITR
and own the backups yourself (see BACKUP_DR). Point `DATABASE_URL` / `REDIS_URL` /
`QDRANT_URL` at the internal `*.railway.internal` addresses.

## K. Public domain + TLS
- Give **only** `meshify-web` a public domain: use the generated `*.up.railway.app`, or
  attach a custom domain `app.<domain>` (Railway provisions TLS automatically). The web
  nginx serves the SPA and proxies `/api` to the BFF over the private network — **one
  public origin, no CORS**, and the browser never holds a platform-api/provider credential.
- Keep the other four services **private** (no public domain).
- (Optional) put **Cloudflare** in front of the web domain for CDN/WAF/edge headers —
  proxy the DNS record; Railway's origin TLS stays valid.

## L. Security headers + single-origin
- The web nginx already sets X-Frame-Options / nosniff / Referrer-Policy. Add **HSTS** and
  a **CSP**: if you front with Cloudflare, set them at the edge; **without Cloudflare**,
  add them to `apps/web/nginx.conf.template` (Railway's proxy passes app headers through).
- Set `APP_ORIGIN=https://app.<domain>` on the BFF and match it in Clerk's allowed origins.

## M. Observability wiring (see OBSERVABILITY.md)
- `/metrics` on platform-api and worker is gated by `METRICS_TOKEN` (Step C). Scrape it
  with a **Grafana Cloud** agent (free) using that token; keep `/metrics` off the public ingress.
- To enable **tracing**, set `OTEL_EXPORTER_OTLP_ENDPOINT` (an OTLP/HTTP collector) and
  `OTEL_SERVICE_NAME` per service; unset = no-op.
- On K8s, apply `infrastructure/kubernetes/monitoring/` (ServiceMonitor + PodMonitor +
  PrometheusRule) once the Prometheus Operator is installed.

## N. Backups & DR (see BACKUP_DR.md)
- Enable **Neon PITR** (choose retention ≥ your RPO); create a branch before risky migrations.
- Schedule **Qdrant Cloud snapshots**; B2 is durable (enable Object Lock / file versioning if you want overwrite recovery).
- **Back up the crypto keys out-of-band** — a DB restore is useless without them.

## O. CI/CD — wire the deploy workflow (see deploy.yml)
In the GitHub repo settings add:
- **Variables:** `VITE_CLERK_PUBLISHABLE_KEY` (image build), `PROD_APP_URL` (smoke test).
- **Secrets:** `PROD_DATABASE_URL` (migrate job) and `RAILWAY_TOKEN` — a Railway **project
  token** (Project → Settings → Tokens) scoped to the production environment. The rollout
  step runs `railway up --service <name>` for each service, building that service's
  Dockerfile from the tagged commit. If `RAILWAY_TOKEN` is unset the step is a no-op
  warning, so you can wire it up later — or skip it entirely and use Railway's native
  **GitHub auto-deploy** (each service redeploys on push to `main`) instead.
- A push to `main` runs CI (lint, audit, gitleaks, Trivy, image build/push). A `vX.Y.Z`
  **tag** runs `deploy.yml`: migrate → rollout (`railway up` per service) → smoke.

## P. First-deploy verification (smoke tests)
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.<domain>/api/health   # → 200 (web→bff→api)
```
Then in the app: sign in → create a project → upload a doc → confirm the ingest job
completes → run an **Ask Mesh** query and confirm a **cited** answer.
Confirm RocketRide cloud from your machine:
```bash
ROCKETRIDE_URI=https://api.rocketride.ai pnpm --filter @meshify/rocketride-gateway exec \
  tsx --env-file="$PWD/.env" src/check.ts        # → All checks passed.
```

## Q. Monitoring & alerts
- Uptime check on `https://app.<domain>/api/health` (BetterStack / UptimeRobot free, or Cloudflare Health Checks if you front with it).
- Grafana Cloud dashboard from `/metrics`; wire the starter alerts (5xx rate, p95 latency, queue backlog, target down) and **tune the thresholds** to your traffic.
- Ship stdout (pino JSON) to a log backend.

## R. Ongoing operations
- **Release:** push a `vX.Y.Z` tag → `deploy.yml` migrates then rolls out then smokes.
- **Rollback:** on Railway, open the service → **Deployments** → **Redeploy** the prior
  successful deployment (or `railway redeploy --service <name>`); K8s: re-apply the
  previous pinned tag. Migrations are expand/contract, so the old version keeps working
  during a roll.
- **Rotate keys** periodically per [KEY_ROTATION.md](KEY_ROTATION.md) — mind the special
  blast radius of `PLATFORM_API_KEY_PEPPER` and `ORG_KEY_ENCRYPTION_KEY`.
- **Zero-downtime:** platform-api rolls with `maxUnavailable:0`; observability uses
  leader election so a roll hands off cleanly.

## S. Scale-later — Kubernetes path
When you outgrow the free tier, the same images deploy via the manifests in
`infrastructure/kubernetes/` (Kustomize base + prod overlay):
```bash
kubectl -n meshify apply -f infrastructure/kubernetes/base/app-secrets.example.yaml  # after filling real values
kubectl -n meshify apply -f infrastructure/kubernetes/base/migrate.job.yaml
kubectl apply -k infrastructure/kubernetes/overlays/prod   # set the ingress host first!
kubectl -n meshify apply -f infrastructure/kubernetes/monitoring/                     # if Prometheus Operator is installed
```
See [infrastructure/kubernetes/README.md](../../infrastructure/kubernetes/README.md).

---

### Env-var placement cheat-sheet
`PLATFORM_API_KEY_PEPPER` → **BFF + backend group (identical)** · `APP_ORIGIN` → **BFF (required in prod)** ·
`VITE_CLERK_PUBLISHABLE_KEY` → **web (build arg)** · `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`ORG_KEY_ENCRYPTION_KEY`/`DATABASE_URL` → **BFF** ·
everything else (DB/Redis/Qdrant/S3/RocketRide/GitHub/Slack/`METRICS_TOKEN`) → **backend group** (platform-api/worker/observability). Full table: audit §7.
Two most common mistakes: `PLATFORM_API_KEY_PEPPER` not identical on BFF and API; `APP_ORIGIN` unset on the BFF in prod.
