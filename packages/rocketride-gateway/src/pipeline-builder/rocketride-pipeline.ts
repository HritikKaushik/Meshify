/** Local mirror of RocketRide's PipelineConfig shape (avoids a hard type dependency on SDK internals in the builder). */
export interface RocketRideComponent {
	id: string;
	provider: string;
	config: Record<string, unknown>;
	input?: Array<{ lane: string; from: string }>;
}

export interface RocketRidePipeline {
	components: RocketRideComponent[];
	source: string;
	project_id: string;
	viewport: { x: number; y: number; zoom: number };
	version: 1;
}

export function finalizePipeline(components: RocketRideComponent[], source: string, projectId: string): RocketRidePipeline {
	return {
		components,
		source,
		project_id: projectId,
		viewport: { x: 0, y: 0, zoom: 1 },
		version: 1,
	};
}
