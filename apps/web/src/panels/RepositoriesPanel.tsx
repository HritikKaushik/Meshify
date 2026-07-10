import { useState } from 'react';
import type { MeshifyApi, Repository } from '../api';
import { Field, Result, Section, useAsync } from '../ui';

export function RepositoriesPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const [remoteUrl, setRemoteUrl] = useState('https://github.com/octocat/Hello-World');
	const connect = useAsync<unknown>();
	const list = useAsync<Repository[]>();
	const sync = useAsync<unknown>();

	return (
		<Section title="Repositories" subtitle="Connect a GitHub repo (needs a configured GitHub App) or list/sync existing ones.">
			<div className="row">
				<Field label="GitHub remote URL">
					<input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} />
				</Field>
				<button className="primary" onClick={() => remoteUrl && connect.run(() => api.connectGitHub(projectId, remoteUrl))}>
					Connect
				</button>
			</div>
			{connect.state.status !== 'idle' && <Result state={connect.state} />}

			<h3>Connected repositories</h3>
			<button onClick={() => list.run(() => api.listRepositories(projectId))}>Refresh list</button>
			{list.state.status === 'success' && (
				<ul className="project-list">
					{list.state.value.length === 0 && <li className="muted">None connected.</li>}
					{list.state.value.map((r) => (
						<li key={r.id}>
							<code>{r.source}</code>
							<span className="path">{r.remoteUrl ?? '(zip upload)'}</span>
							<span className={`badge ${r.syncStatus}`}>{r.syncStatus}</span>
							<span className="spacer" />
							<button onClick={() => sync.run(() => api.syncRepository(projectId, r.id))}>Sync</button>
						</li>
					))}
				</ul>
			)}
			{list.state.status === 'error' && <Result state={list.state} />}
			{sync.state.status !== 'idle' && <Result state={sync.state} />}
		</Section>
	);
}
