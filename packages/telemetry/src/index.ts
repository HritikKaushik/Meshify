/**
 * OpenTelemetry bootstrap. **Side-effecting** — import it FIRST in an app
 * entrypoint (before express/pg/etc.), so the auto-instrumentations patch those
 * CJS deps as they load:
 *
 *   import '@meshify/telemetry'; // must be the first import
 *
 * No-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (e.g. an OTLP/HTTP collector,
 * Grafana Tempo, Honeycomb). Set `OTEL_SERVICE_NAME` per service so spans are
 * attributed correctly. The heavy SDK is dynamically imported only when enabled,
 * so a disabled deployment pays nothing. The top-level await ensures the SDK has
 * started before the importing module's remaining imports evaluate.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
	const { NodeSDK } = await import('@opentelemetry/sdk-node');
	const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
	const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

	const sdk = new NodeSDK({
		traceExporter: new OTLPTraceExporter(),
		instrumentations: [
			getNodeAutoInstrumentations({
				// fs spans are extremely noisy and rarely useful.
				'@opentelemetry/instrumentation-fs': { enabled: false },
			}),
		],
	});

	sdk.start();

	const shutdown = (): void => {
		void sdk.shutdown().catch(() => undefined);
	};
	process.once('SIGTERM', shutdown);
	process.once('SIGINT', shutdown);
}
