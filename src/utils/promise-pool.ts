/**
 * A simple, stable, and performant promise pool for limiting concurrent async operations.
 * Implements a semaphore pattern to maintain a fixed number of concurrent promises.
 * Yields results as they complete (streaming pattern) rather than buffering all results.
 */
export class PromisePool<T, R> {
	/**
	 * Creates a new PromisePool instance.
	 * @param concurrency Maximum number of concurrent promises to maintain (default: 10)
	 */
	constructor(private readonly concurrency: number = 10) {
		if (concurrency < 1) {
			throw new Error('Concurrency must be at least 1');
		}
	}

	/**
	 * Processes items with limited concurrency, yielding results as they complete.
	 * Uses async generator pattern for memory-efficient streaming of results.
	 *
	 * @param items Array of items to process
	 * @param processor Async function that processes each item
	 * @yields Results as they complete (not necessarily in input order)
	 *
	 * @example
	 * ```typescript
	 * const pool = new PromisePool<string, number>(5);
	 * const results = pool.run(files, async (file) => parseFile(file));
	 * for await (const result of results) {
	 *   console.log(result);
	 * }
	 * ```
	 */
	async *run(
		items: T[],
		processor: (item: T, index: number) => Promise<R>
	): AsyncGenerator<R, void, undefined> {
		// Handle empty input
		if (items.length === 0) {
			return;
		}

		// Track active promises with unique IDs for identification
		const activePromises = new Map<
			number,
			Promise<{ result: R | null; promiseId: number }>
		>();

		let nextPromiseId = 0;
		let nextIndex = 0;

		// Start initial batch of promises up to concurrency limit
		while (nextIndex < items.length && activePromises.size < this.concurrency) {
			const promiseId = nextPromiseId++;
			const promise = this.processItem(items[nextIndex], nextIndex, processor).then(
				(processResult) => ({
					result: processResult !== null ? processResult.result : null,
					promiseId
				})
			);
			activePromises.set(promiseId, promise);
			nextIndex++;
		}

		// Continue until all items are processed
		while (activePromises.size > 0) {
			// Wait for the first promise to complete
			const completed = await Promise.race(activePromises.values());

			// Remove completed promise from active set
			activePromises.delete(completed.promiseId);

			// Yield result if processing succeeded (null means error was handled)
			if (completed.result !== null) {
				yield completed.result;
			}

			// Start next item if any remain
			if (nextIndex < items.length) {
				const promiseId = nextPromiseId++;
				const promise = this.processItem(items[nextIndex], nextIndex, processor).then(
					(processResult) => ({
						result: processResult !== null ? processResult.result : null,
						promiseId
					})
				);
				activePromises.set(promiseId, promise);
				nextIndex++;
			}
		}
	}

	/**
	 * Wraps the processor function with error handling.
	 * Returns null on error to allow processing to continue.
	 *
	 * @param item The item to process
	 * @param index The item's index in the original array
	 * @param processor The processing function
	 * @returns Wrapped result with index, or null on error
	 */
	private async processItem(
		item: T,
		index: number,
		processor: (item: T, index: number) => Promise<R>
	): Promise<{ result: R; index: number } | null> {
		try {
			const result = await processor(item, index);
			return { result, index };
		} catch (error) {
			// Error handling is delegated to the processor
			// We return null to indicate failure without breaking the pool
			return null;
		}
	}
}
