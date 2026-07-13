import { useState } from 'react';
import type { MeshifyApi, SearchResponse } from '../api';
import { Field, Result, Section, useAsync } from '../ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';

export function SearchPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const [query, setQuery] = useState('What is this project about?');
	const [mode, setMode] = useState('semantic');
	const search = useAsync<SearchResponse>();

	return (
		<Section title="Search" subtitle="Semantic retrieval over the project's vectors. keyword/hybrid currently degrade to semantic (documented).">
			<div className="flex flex-wrap items-end gap-3">
				<Field label="Query">
					<Input value={query} onChange={(e) => setQuery(e.target.value)} />
				</Field>
				<Field label="Mode">
					<select
						className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
						value={mode}
						onChange={(e) => setMode(e.target.value)}
					>
						<option value="semantic">semantic</option>
						<option value="keyword">keyword</option>
						<option value="hybrid">hybrid</option>
					</select>
				</Field>
				<Button onClick={() => query && search.run(() => api.search(projectId, query, mode))}>Search</Button>
			</div>

			{search.state.status === 'success' && (
				<div className="mt-4">
					{search.state.value.warning && <p className="text-sm text-amber-500">⚠ {search.state.value.warning}</p>}
					<p className="mb-2 text-sm text-muted-foreground">{search.state.value.results.length} result(s)</p>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>score</TableHead>
								<TableHead>collection</TableHead>
								<TableHead>source</TableHead>
								<TableHead>chunk</TableHead>
								<TableHead>content</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{search.state.value.results.map((h) => (
								<TableRow key={h.id}>
									<TableCell>{h.score.toFixed(3)}</TableCell>
									<TableCell>{h.collection}</TableCell>
									<TableCell className="max-w-[240px] break-all font-mono text-xs">{h.sourcePath}</TableCell>
									<TableCell>{h.chunkIndex ?? '—'}</TableCell>
									<TableCell>{(h.content ?? '').slice(0, 120)}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			{search.state.status !== 'success' && <Result state={search.state} />}
		</Section>
	);
}
