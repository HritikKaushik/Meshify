# Meshify — Deployment Runbook (A–Z)

Zero-to-live for the **free-tier path**: **Render** (5 app services) + **Cloudflare**
(DNS/CDN/TLS + edge headers) + managed **Neon / Upstash / Qdrant Cloud / Backblaze B2**
+ **RocketRide cloud**. Do the steps in order; each names the exact commands and the
env vars it sets. Companion docs: [`render.yaml`](../../render.yaml) (the Blueprint),
[PRODUCTION_DEPLOYMENT_AUDIT.md](PRODUCTION_DEPLOYMENT_AUDIT.md) (§7 = full env table,
§4 = readiness), [BACKUP_DR](BACKUP_DR.md), [KEY_ROTATION](KEY_ROTATION.md),
[OBSERVABILITY](OBSERVABILITY.md), [ENCRYPTION](ENCRYPTION.md).

> **Reality check (from the audit):** everything below is built and locally
> verified, but this is the **first** real deploy — expect to iterate on
> platform-specific quirks (Render build args, internal DNS, Cloudflare routing).
> Budget ~$5–15/mo for the two always-on consumers (worker, observability); the
> rest is genuinely free-tier.

---

## A. Prerequisites
- **Tools:** `git`, `node 22`, `pnpm 9`, `docker` (for the optional local boot), `openssl`, the `gh` CLI (optional), `flyctl`/`kubectl` only if you take those paths.
- **Accounts:** GitHub, Render, Cloudflare (+ a domain on it), Backblaze (B2), Neon, Upstash, Qdrant Cloud, Clerk (production instance), RocketRide; optionally a GitHub App and a Slack App.
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

## I. Deploy the backend on Render (Blueprint)
1. Render → **New → Blueprint** → select this repo (`render.yaml`). It defines
   `meshify-platform-api`, `meshify-bff`, `meshify-worker`, `meshify-observability`,
   and `meshify-web`, plus a shared `meshify-backend` env group.
2. Fill every `sync:false` value from Steps C/D/F/G/H. **Critical:** set the **same**
   `PLATFORM_API_KEY_PEPPER` on `meshify-bff` and the `meshify-backend` group.
3. Set `APP_ORIGIN` on `meshify-bff` to your public app URL (Step L) — the BFF
   **refuses to boot** without it in production (CSRF allowlist).
4. Set `VITE_CLERK_PUBLISHABLE_KEY` on `meshify-web` (Render exposes it to the Docker
   build as a build arg).
5. `observability` stays at 1 replica by default; it now uses a Postgres advisory
   lock, so bumping to 2 for hot-standby HA is safe.
6. Apply.

> **Strict-$0 variant:** Render background workers are paid. Delete the two
> `type: worker` services from `render.yaml` and run `apps/worker` + `apps/observability`
> on a **Fly.io** free machine with the same `meshify-backend` env — nothing else changes.

## J. Deploy the web SPA
Two options:
- **On Render** (default in `render.yaml`): the `meshify-web` nginx image serves the
  SPA and proxies `/api` → `meshify-bff` internally — one public origin, no CORS.
- **On Cloudflare Pages** (managed CDN): build and upload `apps/web/dist`, then add a
  Cloudflare rule so `app.<domain>/api/*` proxies to the BFF (preserves single-origin),
  and remove `meshify-web` from `render.yaml`.
  ```bash
  VITE_CLERK_PUBLISHABLE_KEY=pk_live_… pnpm --filter @meshify/web build
  ```

## K. DNS, custom domain, TLS
- Point `app.<domain>` at `meshify-web` (Render custom domain) or Cloudflare Pages.
- Keep `meshify-platform-api` / `meshify-bff` on **private/internal** hostnames the
  browser never hits (the web nginx reaches the BFF; the BFF reaches the API).
- Cloudflare universal SSL is automatic.

## L. Edge headers + single-origin
- The app sets X-Frame-Options / nosniff / Referrer-Policy itself; add **HSTS** and a
  **CSP** at the Cloudflare edge (they belong at the TLS terminator).
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
- **Secrets:** `PROD_DATABASE_URL` (migrate job), and per-service `RENDER_DEPLOY_HOOK_PLATFORM_API` / `_BFF` / `_WORKER` / `_OBSERVABILITY` / `_WEB` (Render → each service → Settings → Deploy Hook). Unset hooks are skipped, so wire them incrementally.
- A push to `main` runs CI (lint, audit, gitleaks, Trivy, image build/push). A `vX.Y.Z` **tag** runs `deploy.yml`: migrate → rollout (fires the hooks) → smoke.

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
- Uptime check on `https://app.<domain>/api/health` (Cloudflare Health Checks / BetterStack free).
- Grafana Cloud dashboard from `/metrics`; wire the starter alerts (5xx rate, p95 latency, queue backlog, target down) and **tune the thresholds** to your traffic.
- Ship stdout (pino JSON) to a log backend.

## R. Ongoing operations
- **Release:** push a `vX.Y.Z` tag → `deploy.yml` migrates then rolls out then smokes.
- **Rollback:** re-deploy the previous image tag (Render: redeploy the prior deploy;
  K8s: re-apply the previous pinned tag). Migrations are expand/contract, so the old
  version keeps working during a roll.
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
