import { useState } from 'react';
import type { MeshifyApi, Project } from '../api';
import type { KnownProject } from '../store';
import { Field, Result, Section, useAsync } from '../ui';

export function ProjectsPanel(props: {
	api: MeshifyApi;
	known: KnownProject[];
	activeId: string | null;
	onAdd: (p: Project) => void;
	onRemove: (id: string) => void;
	onSelect: (id: string) => void;
}) {
	const [name, setName] = useState('Demo Project');
	const [description, setDescription] = useState('');
	const create = useAsync<Project>();
	const get = useAsync<Project>();

	return (
		<Section title="Projects" subtitle="No list endpoint exists, so this console remembers projects you create here.">
			<div className="row">
				<Field label="Name">
					<input value={name} onChange={(e) => setName(e.target.value)} />
				</Field>
				<Field label="Description (optional)">
					<input value={description} onChange={(e) => setDescription(e.target.value)} />
				</Field>
				<button
					className="primary"
					onClick={() =>
						create.run(async () => {
							const p = await props.api.createProject({ name, description: description || undefined });
							props.onAdd(p);
							props.onSelect(p.id);
							return p;
						})
					}
				>
					Create project
				</button>
			</div>
			<Result state={create.state} />

			<h3>Known projects</h3>
			{props.known.length === 0 && <p className="muted">None yet — create one above.</p>}
			<ul className="project-list">
				{props.known.map((p) => (
					<li key={p.id} className={p.id === props.activeId ? 'active' : ''}>
						<button className="link" onClick={() => props.onSelect(p.id)}>
							{p.id === props.activeId ? '● ' : '○ '}
							{p.name}
						</button>
						<code>{p.id}</code>
						<span className="spacer" />
						<button onClick={() => get.run(() => props.api.getProject(p.id))}>Get</button>
						<button
							className="danger"
							onClick={async () => {
								if (!confirm(`Delete project ${p.name}? This removes its Qdrant collections.`)) return;
								await props.api.deleteProject(p.id).catch(() => undefined);
								props.onRemove(p.id);
							}}
						>
							Delete
						</button>
					</li>
				))}
			</ul>
			<Result state={get.state} />
		</Section>
	);
}
