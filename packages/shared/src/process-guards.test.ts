import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installProcessGuards } from './process-guards.js';

describe('installProcessGuards', () => {
	it('logs an unhandled rejection and keeps the process alive', () => {
		const target = new EventEmitter();
		const logger = { error: vi.fn(), fatal: vi.fn() };
		const exit = vi.fn();
		installProcessGuards(logger, { target, exit });
		target.emit('unhandledRejection', new Error('stray'));
		expect(logger.error).toHaveBeenCalledOnce();
		expect(exit).not.toHaveBeenCalled();
	});

	it('logs an uncaught exception at fatal level and exits 1', () => {
		const target = new EventEmitter();
		const logger = { error: vi.fn(), fatal: vi.fn() };
		const exit = vi.fn();
		installProcessGuards(logger, { target, exit });
		target.emit('uncaughtException', new Error('broken'));
		expect(logger.fatal).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith(1);
	});
});
