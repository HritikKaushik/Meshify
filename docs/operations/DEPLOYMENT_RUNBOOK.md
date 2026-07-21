# Meshify — Free-tier Deployment Runbook

The concrete, do-this-in-order companion to [`render.yaml`](../../render.yaml). Target
topology: **Render** (5 app services) + **Cloudflare** (DNS/CDN/TLS + optional web
hosting) + managed **Neon / Upstash / Qdrant Cloud / Cloudflare R2** + **RocketRide
cloud**. For the architecture rationale, cost tables, and the full audit see
[PRODUCTION_DEPLOYMENT_AUDIT.md](PRODUCTION_DEPLOYMENT_AUDIT.md).

> **Cost reality:** front + data tiers are genuinely free; the two always-on
> consumers (worker, observability) are the only paid slots on Render (~$7 each)
> — or run them on a Fly.io free machine. Free Render `web` services cold-start
> after idle; move to paid before real users.

---

## 0. Prerequisites
- Accounts: Render, Cloudflare, Neon, Upstash, Qdrant Cloud, Clerk (production instance), plus a GitHub App and (optional) Slack App.
- A domain on Cloudflare (e.g. `yourdomain.com`).
- The repo pushed to GitHub (CI builds/pushes images to GHCR on `main`).

## 1. Generate production secrets
```bash
openssl rand -base64 32   # PLATFORM_API_KEY_PEPPER  (same value for API + BFF)
openssl rand -base64 32   # ORG_KEY_ENCRYPTION_KEY
openssl rand -base64 32   # INTEGRATION_ENCRYPTION_KEY
```
Placeholder / low-entropy values are **rejected at boot** in production (`@meshify/config`).

## 2. Provision managed data services
| Service | Do | Env value(s) |
|---|---|---|
| **Neon** (Postgres) | Create project → copy the **pooled** connection string | `DATABASE_URL` |
| **Upstash** (Redis) | Create DB → copy the TLS URL | `REDIS_URL` (`rediss://…`) |
| **Qdrant Cloud** | Create free cluster | `QDRANT_URL`, `QDRANT_API_KEY` |
| **Cloudflare R2** | Create bucket `meshify-documents` + S3 API token | `S3_ENDPOINT` (`https://<acct>.r2.cloudflarestorage.com`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=false` |
| **RocketRide** | Use the managed cloud engine | `ROCKETRIDE_URI=https://api.rocketride.ai`, `ROCKETRIDE_APIKEY`, `ROCKETRIDE_OPENAI_KEY` |

## 3. Run database migrations (one-time, and on every release)
```bash
DATABASE_URL="postgres://…neon-pooled…" pnpm --filter @meshify/data-access migrate
```
In CI this is the `migrate` job in [`deploy.yml`](../../.github/workflows/deploy.yml), gated before rollout.

## 4. Configure Clerk (production instance)
- Create a **production** Clerk app; enable **Organizations** (RBAC depends on the `org:admin` role).
- Copy `pk_live_…` (publishable) and `sk_live_…` (secret).
- Set the allowed origin to your app domain (step 7).

## 5. Deploy the stack on Render (Blueprint)
1. Render → **New → Blueprint** → point at this repo (`render.yaml`).
2. Fill every `sync: false` value: the crypto keys (step 1), the data-service URLs (step 2), Clerk keys, and — critically — set the **same** `PLATFORM_API_KEY_PEPPER` on both `meshify-bff` and the `meshify-backend` group, or the BFF's minted keys won't verify.
3. On `meshify-web`, set `VITE_CLERK_PUBLISHABLE_KEY` (public) — Render exposes it to the Docker build as a build arg.
4. Set `APP_ORIGIN` on `meshify-bff` to your public app URL (step 7). It's **required** — the BFF refuses to boot without it (CSRF allowlist).
5. Apply. `meshify-web` is the public origin; it serves the SPA and proxies `/api` → `meshify-bff` (single origin — no CORS, the browser never holds a backend credential).

> **Strict $0 variant:** delete the two `type: worker` services from the Blueprint and run `apps/worker` + `apps/observability` on a Fly.io free machine with the same `meshify-backend` env. Everything else is unchanged.

## 6. (Alternative) web on Cloudflare Pages
Prefer a managed CDN for the SPA? Build `apps/web` and deploy `apps/web/dist` to Pages:
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_… pnpm --filter @meshify/web build
```
Then add a Cloudflare rule so `app.yourdomain.com/api/*` proxies to the `meshify-bff` Render URL (preserves single-origin), and drop `meshify-web` from `render.yaml`.

## 7. DNS, custom domain, TLS, edge headers (Cloudflare)
- Point `app.yourdomain.com` at `meshify-web` (Render custom domain, or Pages).
- Cloudflare universal SSL is automatic. Add **HSTS** and a **CSP** at the Cloudflare edge (the app sets X-Frame-Options/nosniff/Referrer-Policy itself; HSTS/CSP belong at the edge).
- Set `APP_ORIGIN=https://app.yourdomain.com` on the BFF and the Clerk allowed origin to match.

## 8. GitHub App (optional — repo ingestion)
Create the App → webhook URL `https://app.yourdomain.com/api/v1/webhooks/github` → enable "Request user authorization (OAuth) during installation" → set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`.

## 9. Slack App (optional — conversation ingestion)
Set the OAuth redirect to `https://app.yourdomain.com/oauth/slack/callback`; set `SLACK_CLIENT_ID/SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_REDIRECT_URI`.

## 10. Verify
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.yourdomain.com/api/health   # → 200 (BFF → platform-api)
```
Then sign in → create a project → upload a doc → confirm the ingest job completes → run an Ask Mesh query and confirm a cited answer.
Confirm RocketRide cloud connectivity from your machine:
```bash
ROCKETRIDE_URI=https://api.rocketride.ai pnpm --filter @meshify/rocketride-gateway exec tsx --env-file="$PWD/.env" src/check.ts
# → All checks passed.
```

## 11. Backups, monitoring, releases
- **Backups:** enable Neon PITR/branching; schedule Qdrant snapshots.
- **Monitoring:** uptime check on `https://app.yourdomain.com/api/health` (Cloudflare Health Checks / BetterStack free); ship logs to a free tier.
- **Releases:** push a `vX.Y.Z` tag → [`deploy.yml`](../../.github/workflows/deploy.yml) runs migrate → rollout → smoke. Wire the rollout step to Render deploy hooks (one per service) — see the scaffold's comments.

---

### Env-var quick reference
Full table with secret/rotation flags is in [PRODUCTION_DEPLOYMENT_AUDIT.md §7](PRODUCTION_DEPLOYMENT_AUDIT.md). The single most common mistake: `PLATFORM_API_KEY_PEPPER` must be **identical** on the BFF and platform-api/worker; `APP_ORIGIN` is **required** on the BFF in production.
