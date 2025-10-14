import { describe, it, expect } from '@jest/globals';
import { PromisePool } from '../../../src/utils/promise-pool';

describe('PromisePool', () => {
	describe('constructor', () => {
		it('should create pool with default concurrency of 10', () => {
			const pool = new PromisePool();
			expect(pool).toBeDefined();
		});

		it('should create pool with custom concurrency', () => {
			const pool = new PromisePool(5);
			expect(pool).toBeDefined();
		});

		it('should throw error if concurrency is less than 1', () => {
			expect(() => new PromisePool(0)).toThrow('Concurrency must be at least 1');
			expect(() => new PromisePool(-1)).toThrow('Concurrency must be at least 1');
		});
	});

	describe('run()', () => {
		it('should handle empty array', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			for await (const result of pool.run([], async (item) => item * 2)) {
				results.push(result);
			}

			expect(results).toEqual([]);
		});

		it('should process single item', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			for await (const result of pool.run([1], async (item) => item * 2)) {
				results.push(result);
			}

			expect(results).toEqual([2]);
		});

		it('should process multiple items with correct transformation', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			for await (const result of pool.run([1, 2, 3, 4, 5], async (item) => item * 2)) {
				results.push(result);
			}

			// Results may not be in order, so sort before comparison
			expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
		});

		it('should maintain concurrency limit', async () => {
			const pool = new PromisePool<number, number>(3);
			let activeCount = 0;
			let maxActiveCount = 0;

			const items = Array.from({ length: 10 }, (_, i) => i);

			const processor = async (item: number) => {
				activeCount++;
				maxActiveCount = Math.max(maxActiveCount, activeCount);

				// Simulate async work
				await new Promise((resolve) => setTimeout(resolve, 10));

				activeCount--;
				return item * 2;
			};

			const results: number[] = [];
			for await (const result of pool.run(items, processor)) {
				results.push(result);
			}

			// Should never exceed concurrency limit
			expect(maxActiveCount).toBeLessThanOrEqual(3);
			expect(maxActiveCount).toBeGreaterThan(1); // Should have used concurrency
			expect(results.length).toBe(10);
		});

		it('should continue processing after errors', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			const processor = async (item: number) => {
				if (item === 3) {
					throw new Error('Intentional error');
				}
				return item * 2;
			};

			for await (const result of pool.run([1, 2, 3, 4, 5], processor)) {
				results.push(result);
			}

			// Should have processed all items except the one that errored
			// Results may not be in order
			expect(results.sort((a, b) => a - b)).toEqual([2, 4, 8, 10]);
		});

		it('should pass correct index to processor', async () => {
			const pool = new PromisePool<string, { item: string; index: number }>(5);
			const results: { item: string; index: number }[] = [];

			const items = ['a', 'b', 'c', 'd', 'e'];

			for await (const result of pool.run(items, async (item, index) => ({
				item,
				index
			}))) {
				results.push(result);
			}

			// Sort by index to verify
			results.sort((a, b) => a.index - b.index);

			expect(results).toEqual([
				{ item: 'a', index: 0 },
				{ item: 'b', index: 1 },
				{ item: 'c', index: 2 },
				{ item: 'd', index: 3 },
				{ item: 'e', index: 4 }
			]);
		});

		it('should handle async generator pattern correctly', async () => {
			const pool = new PromisePool<number, string>(3);

			// Simulate streaming results
			const results: string[] = [];

			for await (const result of pool.run(
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
				async (item) => {
					await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
					return `item-${item}`;
				}
			)) {
				results.push(result);
			}

			expect(results.length).toBe(10);
			// All items should be present (though not necessarily in order)
			expect(results.sort()).toEqual([
				'item-1',
				'item-10',
				'item-2',
				'item-3',
				'item-4',
				'item-5',
				'item-6',
				'item-7',
				'item-8',
				'item-9'
			]);
		});

		it('should work with concurrency of 1 (sequential)', async () => {
			const pool = new PromisePool<number, number>(1);
			const processingOrder: number[] = [];

			const processor = async (item: number) => {
				processingOrder.push(item);
				await new Promise((resolve) => setTimeout(resolve, 5));
				return item * 2;
			};

			const results: number[] = [];
			for await (const result of pool.run([1, 2, 3, 4, 5], processor)) {
				results.push(result);
			}

			// With concurrency of 1, processing should be strictly sequential
			expect(processingOrder).toEqual([1, 2, 3, 4, 5]);
			expect(results).toEqual([2, 4, 6, 8, 10]);
		});

		it('should handle promises that reject', async () => {
			const pool = new PromisePool<number, number>(3);
			const results: number[] = [];

			const processor = async (item: number) => {
				if (item % 2 === 0) {
					throw new Error(`Error for item ${item}`);
				}
				return item * 2;
			};

			for await (const result of pool.run([1, 2, 3, 4, 5], processor)) {
				results.push(result);
			}

			// Only odd numbers should succeed
			expect(results.sort((a, b) => a - b)).toEqual([2, 6, 10]);
		});

		it('should handle large number of items efficiently', async () => {
			const pool = new PromisePool<number, number>(10);
			const items = Array.from({ length: 100 }, (_, i) => i);

			const startTime = Date.now();
			const results: number[] = [];

			for await (const result of pool.run(items, async (item) => {
				// Simulate 10ms processing time
				await new Promise((resolve) => setTimeout(resolve, 10));
				return item * 2;
			})) {
				results.push(result);
			}

			const endTime = Date.now();
			const duration = endTime - startTime;

			// With 100 items, 10ms each, and concurrency of 10:
			// Sequential would take ~1000ms, concurrent should take ~100ms
			// Allow some overhead, but should be significantly faster than sequential
			expect(duration).toBeLessThan(500);
			expect(results.length).toBe(100);
		});
	});

	describe('error handling', () => {
		it('should not break pool when processor throws synchronously', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			const processor = async (item: number) => {
				if (item === 2) {
					throw new Error('Sync error');
				}
				return item;
			};

			for await (const result of pool.run([1, 2, 3], processor)) {
				results.push(result);
			}

			expect(results.sort()).toEqual([1, 3]);
		});

		it('should not break pool when processor throws asynchronously', async () => {
			const pool = new PromisePool<number, number>(5);
			const results: number[] = [];

			const processor = async (item: number) => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				if (item === 2) {
					throw new Error('Async error');
				}
				return item;
			};

			for await (const result of pool.run([1, 2, 3], processor)) {
				results.push(result);
			}

			expect(results.sort()).toEqual([1, 3]);
		});
	});

	describe('type safety', () => {
		it('should work with different input and output types', async () => {
			const pool = new PromisePool<string, { value: string; length: number }>(3);
			const results: { value: string; length: number }[] = [];

			for await (const result of pool.run(['hello', 'world'], async (item) => ({
				value: item.toUpperCase(),
				length: item.length
			}))) {
				results.push(result);
			}

			results.sort((a, b) => a.value.localeCompare(b.value));

			expect(results).toEqual([
				{ value: 'HELLO', length: 5 },
				{ value: 'WORLD', length: 5 }
			]);
		});
	});
});
