import { useState } from 'react';
import type { MeshifyApi, SearchResponse } from '../api';
import { Field, Result, Section, useAsync } from '../ui';

export function SearchPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const [query, setQuery] = useState('What is this project about?');
	const [mode, setMode] = useState('semantic');
	const search = useAsync<SearchResponse>();

	return (
		<Section title="Search" subtitle="Semantic retrieval over the project's vectors. keyword/hybrid currently degrade to semantic (documented).">
			<div className="row">
				<Field label="Query">
					<input value={query} onChange={(e) => setQuery(e.target.value)} />
				</Field>
				<Field label="Mode">
					<select value={mode} onChange={(e) => setMode(e.target.value)}>
						<option value="semantic">semantic</option>
						<option value="keyword">keyword</option>
						<option value="hybrid">hybrid</option>
					</select>
				</Field>
				<button className="primary" onClick={() => query && search.run(() => api.search(projectId, query, mode))}>
					Search
				</button>
			</div>

			{search.state.status === 'success' && (
				<div>
					{search.state.value.warning && <p className="warning">⚠ {search.state.value.warning}</p>}
					<p className="muted">{search.state.value.results.length} result(s)</p>
					<table className="hits">
						<thead>
							<tr>
								<th>score</th>
								<th>collection</th>
								<th>source</th>
								<th>chunk</th>
								<th>content</th>
							</tr>
						</thead>
						<tbody>
							{search.state.value.results.map((h) => (
								<tr key={h.id}>
									<td>{h.score.toFixed(3)}</td>
									<td>{h.collection}</td>
									<td className="path">{h.sourcePath}</td>
									<td>{h.chunkIndex ?? '—'}</td>
									<td>{(h.content ?? '').slice(0, 120)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{search.state.status !== 'success' && <Result state={search.state} />}
		</Section>
	);
}
