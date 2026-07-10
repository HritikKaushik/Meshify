import { useState } from 'react';
import type { ChatResponse, MeshifyApi } from '../api';
import { Field, Result, Section, useAsync } from '../ui';

interface Turn {
	role: 'user' | 'assistant';
	content: string;
	meta?: ChatResponse;
}

export function ChatPanel({ api, projectId }: { api: MeshifyApi; projectId: string }) {
	const [question, setQuestion] = useState('Summarise the ingested knowledge.');
	const [conversationId, setConversationId] = useState<string | undefined>(undefined);
	const [turns, setTurns] = useState<Turn[]>([]);
	const chat = useAsync<ChatResponse>();

	const ask = () =>
		chat.run(async () => {
			const q = question;
			setTurns((t) => [...t, { role: 'user', content: q }]);
			const res = await api.chat(projectId, q, conversationId);
			setConversationId(res.conversationId);
			setTurns((t) => [...t, { role: 'assistant', content: res.answer, meta: res }]);
			setQuestion('');
			return res;
		});

	return (
		<Section title="Chat (RAG)" subtitle="Answers only from this project's knowledge, via the RocketRide chat pipeline.">
			<div className="chat-log">
				{turns.length === 0 && <p className="muted">No turns yet.</p>}
				{turns.map((t, i) => (
					<div key={i} className={`bubble ${t.role}`}>
						<div className="content">{t.content}</div>
						{t.meta && (
							<div className="chat-meta">
								confidence {t.meta.confidence.toFixed(2)} · {t.meta.latencyMs}ms · {t.meta.modelUsed ?? 'model n/a'}
								{t.meta.citations.length > 0 && (
									<ul>
										{t.meta.citations.map((c, j) => (
											<li key={j}>
												<code>{c.sourcePath}</code> ({c.score.toFixed(2)})
											</li>
										))}
									</ul>
								)}
							</div>
						)}
					</div>
				))}
			</div>
			<div className="row">
				<Field label="Question">
					<input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && question && ask()} />
				</Field>
				<button className="primary" onClick={() => question && ask()}>
					Ask
				</button>
				<button
					onClick={() => {
						setTurns([]);
						setConversationId(undefined);
					}}
				>
					New conversation
				</button>
			</div>
			{conversationId && <p className="muted">conversation: <code>{conversationId}</code></p>}
			{chat.state.status !== 'success' && <Result state={chat.state} />}
		</Section>
	);
}
