import { useRef, useState } from 'react';
import type { Job, MeshifyApi, UploadResult } from '../api';
import { Field, Result, Section, useAsync } from '../ui';

export function DocumentsPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [jobId, setJobId] = useState('');
	const upload = useAsync<UploadResult>();
	const job = useAsync<Job>();

	return (
		<Section title="Documents" subtitle="Uploads land in object storage and enqueue an ingestion job (worker + RocketRide process it).">
			<div className="row">
				<Field label="File (PDF / DOCX / PPTX / TXT / MD)">
					<input type="file" ref={fileRef} />
				</Field>
				<button
					className="primary"
					onClick={() =>
						upload.run(async () => {
							const file = fileRef.current?.files?.[0];
							if (!file) throw new Error('Choose a file first');
							const res = await api.uploadDocument(projectId, file);
							if (res.jobId) setJobId(res.jobId);
							return res;
						})
					}
				>
					Upload
				</button>
			</div>
			<Result state={upload.state} />

			<h3>Job status</h3>
			<div className="row">
				<Field label="Job ID">
					<input value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="from an upload above" />
				</Field>
				<button onClick={() => jobId && job.run(() => api.getJob(jobId))}>Check status</button>
			</div>
			<Result state={job.state} />
		</Section>
	);
}
