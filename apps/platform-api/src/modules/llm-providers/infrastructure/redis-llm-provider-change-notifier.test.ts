import { describe, expect, it, vi } from 'vitest';
import type { LlmProviderChangeNotifier } from '../application/llm-provider-change.port.js';
import { LLM_PROVIDER_CHANGES_CHANNEL, RedisLlmProviderChangeNotifier } from './redis-llm-provider-change-notifier.js';

/** A tiny pub/sub broker standing in for Redis: every subscriber connection sees every publish. */
function broker() {
	const handlers: Array<(channel: string, message: string) => void> = [];
	const published: Array<{ channel: string; message: string }> = [];
	return {
		published,
		publisher: {
			publish: async (channel: string, message: string) => {
				published.push({ channel, message });
				for (const h of handlers) h(channel, message);
				return handlers.length;
			},
		},
		subscriber: () => ({
			subscribe: async () => 1,
			on: (_event: 'message', handler: (channel: string, message: string) => void) => void handlers.push(handler),
		}),
	};
}

function localNotifier(): LlmProviderChangeNotifier & { changed: string[] } {
	const changed: string[] = [];
	return {
		changed,
		notifyChanged: async (orgId) => void changed.push(orgId),
		warmChatPipeline: async () => true,
		warmChatPipelines: async () => undefined,
	};
}

describe('RedisLlmProviderChangeNotifier', () => {
	it('applies a change locally and replicates it to the other replicas exactly once', async () => {
		const bus = broker();
		const a = localNotifier();
		const b = localNotifier();
		const replicaA = new RedisLlmProviderChangeNotifier(a, bus.publisher, bus.subscriber());
		new RedisLlmProviderChangeNotifier(b, bus.publisher, bus.subscriber());

		await replicaA.notifyChanged('org-1');

		expect(a.changed).toEqual(['org-1']); // local apply, not doubled by its own echo
		expect(b.changed).toEqual(['org-1']);
		expect(bus.published[0]?.channel).toBe(LLM_PROVIDER_CHANGES_CHANNEL);
	});

	it('ignores malformed messages and traffic on other channels', async () => {
		const bus = broker();
		const a = localNotifier();
		new RedisLlmProviderChangeNotifier(a, bus.publisher, bus.subscriber());
		await bus.publisher.publish(LLM_PROVIDER_CHANGES_CHANNEL, 'not json');
		await bus.publisher.publish(LLM_PROVIDER_CHANGES_CHANNEL, JSON.stringify({ nope: true }));
		await bus.publisher.publish('meshify:platform-events', JSON.stringify({ orgId: 'org-9', origin: 'x' }));
		expect(a.changed).toEqual([]);
	});

	it('still applies the local change when publishing fails, and reports it', async () => {
		const bus = broker();
		const a = localNotifier();
		const warn = vi.fn();
		const notifier = new RedisLlmProviderChangeNotifier(a, { publish: async () => Promise.reject(new Error('redis down')) }, bus.subscriber(), { warn });
		await expect(notifier.notifyChanged('org-1')).resolves.toBeUndefined();
		expect(a.changed).toEqual(['org-1']);
		expect(warn).toHaveBeenCalledOnce();
	});

	it('delegates warming to the local notifier only', async () => {
		const bus = broker();
		const a = localNotifier();
		const notifier = new RedisLlmProviderChangeNotifier(a, bus.publisher, bus.subscriber());
		expect(await notifier.warmChatPipeline('org-1', 'p1')).toBe(true);
		expect(bus.published).toEqual([]);
	});
});
