import { describe, expect, it } from 'vitest';
import { InMemoryChatRepository, buildChat, buildDocument, buildProject } from '@meshify/testing';

/**
 * Repo-wide smoke: the shared testing package is the backbone of every suite,
 * so a break here should fail fast and loudly rather than in dozens of downstream
 * tests. Exercises the factory + in-memory-repository contract.
 */
describe('@meshify/testing shared infrastructure (smoke)', () => {
	it('factories build valid, overridable entities', () => {
		expect(buildProject().status).toBe('active');
		expect(buildProject({ name: 'custom' }).name).toBe('custom');
		expect(buildDocument({ status: 'embedded' }).status).toBe('embedded');
	});

	it('in-memory repositories enforce project scoping and cascade deletes', async () => {
		const chats = new InMemoryChatRepository({
			chats: [buildChat({ id: 'a', projectId: 'p1' }), buildChat({ id: 'b', projectId: 'p2' })],
		});
		expect(await chats.countByProject('p1')).toBe(1);
		expect((await chats.findByProjectId('p2')).map((c) => c.id)).toEqual(['b']);

		await chats.deleteChat('a');
		expect(await chats.findChatById('a')).toBeUndefined();
	});
});
