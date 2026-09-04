# Kubernetes deployment

Manifests for the three Meshify workloads. Kustomize base + per-environment overlays.

```
kubernetes/
├── base/                          Namespaced workloads (namespace: meshify)
│   ├── namespace.yaml
│   ├── app-config.configmap.yaml  Non-secret env, shared by all apps
│   ├── app-secrets.example.yaml   TEMPLATE — provide the real Secret out-of-band
│   ├── platform-api.*             Deployment, Service, HPA (CPU), Ingress
│   ├── worker.*                   Deployment + KEDA ScaledObject (queue depth)
│   ├── observability.deployment   Single instance (Recreate, no autoscale)
│   ├── pdb.yaml                   PodDisruptionBudgets (api, worker)
│   ├── migrate.job.yaml           Pre-rollout schema migration (run separately)
│   └── kustomization.yaml
└── overlays/
    ├── dev/                       1 API replica, worker scale-to-zero, no PDBs, :dev
    └── prod/                      HPA 3–20, worker ≤20, pinned image tags
```

## Prerequisites

- The stateful dependencies — **PostgreSQL, Redis, Qdrant, object storage (Backblaze B2/S3/MinIO), and the RocketRide server** — are expected to exist already (managed services in prod, or in-cluster). The `ConfigMap`/`Secret` point the apps at them; these manifests do **not** provision them.
- **KEDA** installed in the cluster (for worker queue-depth autoscaling).
- **metrics-server** (for the platform-api CPU HPA).
- An ingress controller + cert-manager if you use `platform-api.ingress.yaml`.

## First deploy

```bash
# 1. Provide secrets (never committed). Edit a copy of the template, then apply,
#    or wire up sealed-secrets / external-secrets instead.
cp base/app-secrets.example.yaml /tmp/app-secrets.yaml   # fill in real values
kubectl create namespace meshify --dry-run=client -o yaml | kubectl apply -f -
kubectl -n meshify apply -f /tmp/app-secrets.yaml

# 2. Adjust base/app-config.configmap.yaml to point at your Postgres/Redis/Qdrant/S3/RocketRide.
#    For prod, ALSO set your real API host: replace api.REPLACE-ME.example.com in
#    overlays/prod/kustomization.yaml (Ingress patch). Applying with the placeholder
#    deploys a non-functional Ingress.

# 3. Run migrations and wait for completion (uses the platform-api image).
kubectl -n meshify apply -f base/migrate.job.yaml
kubectl -n meshify wait --for=condition=complete job/meshify-migrate --timeout=120s

# 4. Roll out the workloads.
kubectl apply -k overlays/prod        # or overlays/dev
```

## Upgrades

1. Build & push new images; set the tag in the overlay's `images:` (prod pins an explicit version — never `:latest`).
2. Run the migrate Job for the new version **before** rolling out (idempotent; delete the finished Job first since a Job name is immutable).
3. `kubectl apply -k overlays/<env>` — rolling update with `maxUnavailable: 0`.

## Scaling model

- **platform-api** — stateless (auth, rate-limit, chat history all live in Postgres/Redis), so it scales horizontally on CPU via the HPA. Anti-affinity spreads replicas across nodes; a PDB keeps ≥1 up during drains.
- **worker** — scales on BullMQ backlog (`bull:<queue>:wait` list length) via KEDA across the three ingest/sync queues. In-flight jobs return to the queue on SIGTERM and are retried, so scale-down is safe.
- **observability** — pinned to a single replica with a `Recreate` strategy. Extra replicas are safe (each instance contends for a Postgres advisory lock at boot; only the holder subscribes and writes `pipeline_runs`, the rest wait as hot standbys), but a second one buys nothing except failover, so there is no HPA/ScaledObject or PDB for it.

## Secrets & key rotation

`PLATFORM_API_KEY_PEPPER` peppers every stored API-key hash — rotating it invalidates all issued keys, so re-issue keys (`pnpm --filter @meshify/data-access issue-api-key`) after a rotation. Prefer sealed-secrets or an external secrets operator over the plaintext template in any real environment.
