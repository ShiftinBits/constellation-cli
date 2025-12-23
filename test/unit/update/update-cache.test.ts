import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { UpdateCache } from '../../../src/update/update-cache';

describe('UpdateCache', () => {
	let cache: UpdateCache;
	let testDir: string;

	beforeEach(async () => {
		// Create a temporary directory for testing
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'constellation-test-'));
		cache = new UpdateCache(testDir);
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('load()', () => {
		it('should return default state when file does not exist', async () => {
			const state = await cache.load();
			expect(state).toEqual({ lastCheckTimestamp: 0 });
		});

		it('should cache loaded state after save', async () => {
			// First save something
			await cache.save({ lastCheckTimestamp: 12345 });
			// Now load should return the cached value
			const state1 = await cache.load();
			const state2 = await cache.load();
			expect(state1).toBe(state2);
			expect(state1.lastCheckTimestamp).toBe(12345);
		});
	});

	describe('save()', () => {
		it('should create directory and save state', async () => {
			const state = {
				lastCheckTimestamp: Date.now(),
				lastDeclinedVersion: '1.0.0',
			};
			await cache.save(state);

			// Verify file was created
			const stateFile = path.join(testDir, 'update-state.json');
			const content = await fs.readFile(stateFile, 'utf-8');
			const savedState = JSON.parse(content);
			expect(savedState.lastCheckTimestamp).toBe(state.lastCheckTimestamp);
			expect(savedState.lastDeclinedVersion).toBe('1.0.0');
		});
	});

	describe('shouldCheck()', () => {
		it('should return true when never checked before', async () => {
			expect(await cache.shouldCheck()).toBe(true);
		});

		it('should return false when checked recently', async () => {
			await cache.recordCheck();
			expect(await cache.shouldCheck()).toBe(false);
		});

		it('should return true when check is older than 24 hours', async () => {
			const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
			await cache.save({ lastCheckTimestamp: oldTimestamp });
			// Need a fresh cache instance to pick up the saved state
			const newCache = new UpdateCache(testDir);
			expect(await newCache.shouldCheck()).toBe(true);
		});
	});

	describe('recordCheck()', () => {
		it('should update lastCheckTimestamp', async () => {
			const before = Date.now();
			await cache.recordCheck();
			const after = Date.now();

			const state = await cache.load();
			expect(state.lastCheckTimestamp).toBeGreaterThanOrEqual(before);
			expect(state.lastCheckTimestamp).toBeLessThanOrEqual(after);
		});
	});

	describe('recordDecline()', () => {
		it('should store declined version', async () => {
			await cache.recordDecline('2.0.0');
			const state = await cache.load();
			expect(state.lastDeclinedVersion).toBe('2.0.0');
			expect(state.lastDeclinedTimestamp).toBeDefined();
		});
	});

	describe('wasVersionDeclined()', () => {
		it('should return false when no version declined', async () => {
			expect(await cache.wasVersionDeclined('1.0.0')).toBe(false);
		});

		it('should return true when same version was declined', async () => {
			await cache.recordDecline('1.0.0');
			expect(await cache.wasVersionDeclined('1.0.0')).toBe(true);
		});

		it('should return false for different version', async () => {
			await cache.recordDecline('1.0.0');
			expect(await cache.wasVersionDeclined('2.0.0')).toBe(false);
		});
	});

	describe('clear()', () => {
		it('should remove state file', async () => {
			await cache.recordCheck();
			await cache.clear();

			// New cache should have default state
			const newCache = new UpdateCache(testDir);
			const state = await newCache.load();
			expect(state.lastCheckTimestamp).toBe(0);
		});

		it('should not throw when file does not exist', async () => {
			await expect(cache.clear()).resolves.not.toThrow();
		});
	});
});
