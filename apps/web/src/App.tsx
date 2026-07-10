import { useMemo, useState } from 'react';
import { MeshifyApi, type HealthReport } from './api';
import { useConfig, useKnownProjects, usePersistent } from './store';
import { Result, useAsync } from './ui';
import { ProjectsPanel } from './panels/ProjectsPanel';
import { DocumentsPanel } from './panels/DocumentsPanel';
import { SearchPanel } from './panels/SearchPanel';
import { ChatPanel } from './panels/ChatPanel';
import { EvaluationPanel } from './panels/EvaluationPanel';
import { RepositoriesPanel } from './panels/RepositoriesPanel';

const TABS = ['Documents', 'Search', 'Chat', 'Evaluation', 'Repositories'] as const;
type Tab = (typeof TABS)[number];

export function App() {
	const [config, setConfig] = useConfig();
	const api = useMemo(() => new MeshifyApi(config), [config]);
	const { projects, add, remove } = useKnownProjects();
	const [activeId, setActiveId] = usePersistent<string | null>('meshify.active', null);
	const [tab, setTab] = useState<Tab>('Documents');
	const health = useAsync<HealthReport>();

	const active = projects.find((p) => p.id === activeId) ?? null;

	return (
		<div className="app">
			<header className="topbar">
				<h1>Meshify Console <span className="tag">dev</span></h1>
				<div className="conn">
					<input
						aria-label="API base URL"
						placeholder="API base URL (blank = dev proxy)"
						value={config.baseUrl}
						onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
					/>
					<input
						aria-label="API key"
						type="password"
						placeholder="API key (msk_…)"
						value={config.apiKey}
						onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
					/>
					<button onClick={() => health.run(() => api.health())}>Health</button>
					<HealthDot state={health.state} />
				</div>
			</header>

			{health.state.status === 'error' && (
				<div className="banner">
					Can't reach the API. Is platform-api running on :3000 and the dev proxy up? <Result state={health.state} />
				</div>
			)}
			{health.state.status === 'success' && <div className="banner ok">API healthy: {health.state.value.dependencies?.map((d) => `${d.name} ${d.status}`).join(' · ')}</div>}

			<main>
				<ProjectsPanel api={api} known={projects} activeId={activeId} onAdd={add} onRemove={(id) => { remove(id); if (id === activeId) setActiveId(null); }} onSelect={setActiveId} />

				{active ? (
					<div className="workspace">
						<div className="workspace-head">
							Active project: <strong>{active.name}</strong> <code>{active.id}</code>
						</div>
						<nav className="tabs">
							{TABS.map((t) => (
								<button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
									{t}
								</button>
							))}
						</nav>
						{tab === 'Documents' && <DocumentsPanel api={api} projectId={active.id} />}
						{tab === 'Search' && <SearchPanel api={api} projectId={active.id} />}
						{tab === 'Chat' && <ChatPanel api={api} projectId={active.id} />}
						{tab === 'Evaluation' && <EvaluationPanel api={api} projectId={active.id} />}
						{tab === 'Repositories' && <RepositoriesPanel api={api} projectId={active.id} />}
					</div>
				) : (
					<p className="muted center">Select or create a project to access its features.</p>
				)}
			</main>

			<footer>
				Dev console for the Meshify platform-api. The API key is stored in your browser (localStorage) — dev use only.
			</footer>
		</div>
	);
}

function HealthDot({ state }: { state: ReturnType<typeof useAsync<HealthReport>>['state'] }) {
	const color = state.status === 'success' ? '#22c55e' : state.status === 'error' ? '#ef4444' : state.status === 'pending' ? '#f59e0b' : '#94a3b8';
	return <span className="dot" style={{ background: color }} title={state.status} />;
}
