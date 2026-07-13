import { useOutletContext } from 'react-router-dom';
import { api } from '@/api-client';
import { SearchPanel } from '../../panels/SearchPanel';

export function SearchPage() {
	const { projectId } = useOutletContext<{ projectId: string }>();
	return <SearchPanel api={api} projectId={projectId} />;
}
