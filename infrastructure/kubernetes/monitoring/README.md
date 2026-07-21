# Monitoring manifests (optional)

Prometheus Operator resources for scraping + alerting on Meshify. **Requires the
[Prometheus Operator](https://github.com/prometheus-operator/prometheus-operator)
CRDs** (e.g. via `kube-prometheus-stack`), so they are deliberately **not** in the
base kustomization — a `kubectl apply -k overlays/<env>` on a cluster without the
operator would fail on the unknown CRDs.

Apply separately once the operator is installed:

```bash
kubectl -n meshify apply -f infrastructure/kubernetes/monitoring/
```

- `servicemonitor.yaml` — scrapes platform-api `/metrics` (token-gated via `METRICS_TOKEN` from the `meshify-secrets` Secret).
- `prometheusrule.yaml` — starter alerts (target down, 5xx rate, p95 latency, not-ready, queue backlog). Tune thresholds to your traffic.

For the Render/Cloudflare (non-K8s) path, scrape `/metrics` with a Grafana Cloud
Agent instead — see [docs/operations/OBSERVABILITY.md](../../../docs/operations/OBSERVABILITY.md).
