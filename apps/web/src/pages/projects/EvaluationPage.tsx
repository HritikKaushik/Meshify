import { useOutletContext } from 'react-router-dom';
import { api } from '@/api-client';
import { EvaluationPanel } from '../../panels/EvaluationPanel';

export function EvaluationPage() {
	const { projectId } = useOutletContext<{ projectId: string }>();
	return <EvaluationPanel api={api} projectId={projectId} />;
}
