# Meshify — Observability

## What's exposed
- **platform-api `/metrics`** — Prometheus exposition: Node/process defaults
  (`process_*`, `nodejs_*`) plus an HTTP histogram
  `http_request_duration_seconds{method,route,status}`. The `route` label is the
  matched pattern (e.g. `/v1/projects/:projectId/documents/:documentId`), so
  cardinality stays bounded regardless of real ids.
- **worker `/metrics`** (on `WORKER_METRICS_PORT`, default 9091) — Node/process
  defaults plus `meshify_queue_jobs{queue,state}` (BullMQ counts per queue for
  `waiting`/`active`/`delayed`/`failed`, read live on each scrape). Same
  `METRICS_TOKEN` gate. The worker also serves `/healthz` there for liveness.
- **Health** — `/health/live` (process-only) and `/health/ready` (checks
  pg/redis/qdrant). Used by liveness/readiness probes and the deploy smoke test.
- **Structured logs** — pino JSON on stdout from every app (credential-safe
  logger in `@meshify/shared`); ship stdout to your log backend.
- **Pipeline traces** — the `observability` app persists RocketRide pipeline runs
  (`pipeline_runs`) for per-pipeline cost/latency inspection.

## Securing `/metrics`
`/metrics` leaks internal detail, so set **`METRICS_TOKEN`** in production; the
endpoint then requires `Authorization: Bearer <token>`. Unset (dev) leaves it open.

## Scraping — Render / Cloudflare (the free-tier path)
Use a **Grafana Cloud** free account + the Grafana Agent (or any Prometheus) to
scrape the platform-api service URL:

```yaml
# grafana-agent scrape_config
- job_name: meshify-platform-api
  metrics_path: /metrics
  scheme: https
  authorization:
    credentials: <METRICS_TOKEN>
  static_configs:
    - targets: ["platform-api.internal.yourhost"] # the API's reachable host:port
```
Keep the API's `/metrics` off the public ingress if possible (scrape it on an
internal address); the token is the backstop if it is reachable.

## Scraping — Kubernetes (scale-later path)
Install the Prometheus Operator (`kube-prometheus-stack`), then apply the
manifests in [`infrastructure/kubernetes/monitoring/`](../../infrastructure/kubernetes/monitoring/):
a `ServiceMonitor` (scrapes `/metrics` with the token from `meshify-secrets`) and
a `PrometheusRule` (starter alerts).

## Starter alerts (in the PrometheusRule)
- **PlatformApiDown** — target unscrapeable 2m (critical).
- **PlatformApiHighErrorRate** — >5% 5xx over 5m.
- **PlatformApiHighLatencyP95** — p95 > 1.5s over 5m.
- **PlatformApiNotReady** — pod NotReady 5m (a downstream is down).
- **WorkerQueueBacklogGrowing** — BullMQ wait list > 500 for 10m (wire to your queue/Redis metric source).

## Gaps / next steps
- **Deeper tracing granularity** — OpenTelemetry auto-instrumentation is wired
  (see below); custom spans around the AI/RAG path could add detail beyond the
  RocketRide pipeline traces.

## Distributed tracing (OpenTelemetry)
platform-api, bff, and worker auto-instrument via OpenTelemetry when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set (HTTP/OTLP), and are a no-op otherwise.
Point it at a collector / Grafana Tempo / Honeycomb, e.g.
`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`. `OTEL_SERVICE_NAME` is
set per app automatically.
