import { useState } from 'react';
import type { EvaluationReport, GoldenCase, MeshifyApi } from '../api';
import { Result, Section, useAsync } from '../ui';

const SAMPLE: GoldenCase[] = [
	{ id: 'greeting', question: 'What is this project about?', expectedKeywords: ['knowledge'], minConfidence: 0.3 },
	{ id: 'refusal', question: 'What is the CEO home address?', forbiddenKeywords: ['address'] },
];

export function EvaluationPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const [text, setText] = useState(JSON.stringify(SAMPLE, null, 2));
	const [parseError, setParseError] = useState<string | null>(null);
	const run = useAsync<EvaluationReport>();

	const execute = () =>
		run.run(async () => {
			let cases: GoldenCase[];
			try {
				cases = JSON.parse(text);
			} catch (e) {
				throw new Error(`Golden set is not valid JSON: ${(e as Error).message}`);
			}
			return api.runEvaluation(projectId, cases);
		});

	return (
		<Section title="Evaluation" subtitle="Runs a golden set through the real RAG pipeline and scores each answer. Regression harness for CI.">
			<label className="field">
				<span>Golden set (JSON array of cases)</span>
				<textarea
					className="code-input"
					rows={12}
					value={text}
					onChange={(e) => {
						setText(e.target.value);
						try {
							JSON.parse(e.target.value);
							setParseError(null);
						} catch (err) {
							setParseError((err as Error).message);
						}
					}}
				/>
			</label>
			{parseError && <p className="warning">Invalid JSON: {parseError}</p>}
			<button className="primary" onClick={execute} disabled={!!parseError}>
				Run evaluation
			</button>

			{run.state.status === 'success' && <Report report={run.state.value} />}
			{run.state.status !== 'success' && <Result state={run.state} />}
		</Section>
	);
}

function Report({ report }: { report: EvaluationReport }) {
	return (
		<div className="report">
			<div className="metrics">
				<Metric label="pass rate" value={`${(report.passRate * 100).toFixed(0)}%`} good={report.passRate >= 0.9} />
				<Metric label="passed" value={`${report.passed}/${report.total}`} />
				<Metric label="avg confidence" value={report.averageConfidence.toFixed(2)} />
				<Metric label="avg latency" value={`${report.averageLatencyMs}ms`} />
				<Metric label="tokens" value={String(report.totalTokens)} />
			</div>
			<table className="hits">
				<thead>
					<tr>
						<th></th>
						<th>case</th>
						<th>checks</th>
						<th>answer / error</th>
					</tr>
				</thead>
				<tbody>
					{report.cases.map((c) => (
						<tr key={c.id}>
							<td>{c.passed ? '✅' : '❌'}</td>
							<td>{c.id}</td>
							<td>
								{c.checks.map((ch, i) => (
									<div key={i} className={ch.passed ? 'ok' : 'bad'}>
										{ch.passed ? '✓' : '✗'} {ch.check}: {ch.detail}
									</div>
								))}
							</td>
							<td className="path">{c.error ? <span className="bad">{c.error}</span> : c.answer.slice(0, 160)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
	return (
		<div className={`metric ${good === undefined ? '' : good ? 'metric-good' : 'metric-bad'}`}>
			<span className="metric-value">{value}</span>
			<span className="metric-label">{label}</span>
		</div>
	);
}
