import { jest, describe, it, beforeEach, expect } from '@jest/globals';
import { NdJsonStreamWriter } from '../../../src/utils/ndjson-streamwriter';
import { Readable } from 'stream';

// Helper to collect all data and split into JSON lines
async function collectLines<T>(writer: NdJsonStreamWriter<T>): Promise<T[]> {
	let allData = '';
	for await (const chunk of writer) {
		allData += chunk.toString();
	}
	return allData.trim().split('\n').filter(line => line).map(line => JSON.parse(line));
}

describe('NdJsonStreamWriter', () => {
	describe('constructor', () => {
		it('should create instance with async generator', async () => {
			async function* testGenerator() {
				yield { id: 1, name: 'test' };
			}

			const writer = new NdJsonStreamWriter(testGenerator());

			expect(writer).toBeInstanceOf(NdJsonStreamWriter);
			expect(writer).toBeInstanceOf(Readable);
		});
	});

	describe('streaming data', () => {
		it('should stream single object as NDJSON', async () => {
			async function* singleItemGenerator() {
				yield { id: 1, name: 'Alice' };
			}

			const writer = new NdJsonStreamWriter(singleItemGenerator());
			const chunks: string[] = [];

			for await (const chunk of writer) {
				chunks.push(chunk.toString());
			}

			expect(chunks).toHaveLength(1);
			expect(chunks[0]).toBe('{"id":1,"name":"Alice"}\n');
		});

		it('should stream multiple objects as NDJSON', async () => {
			async function* multiItemGenerator() {
				yield { id: 1, name: 'Alice' };
				yield { id: 2, name: 'Bob' };
				yield { id: 3, name: 'Charlie' };
			}

			const writer = new NdJsonStreamWriter(multiItemGenerator());
			let allData = '';

			for await (const chunk of writer) {
				allData += chunk.toString();
			}

			// Node.js may batch the output, so check the combined output
			const lines = allData.trim().split('\n');
			expect(lines).toHaveLength(3);
			expect(JSON.parse(lines[0])).toEqual({ id: 1, name: 'Alice' });
			expect(JSON.parse(lines[1])).toEqual({ id: 2, name: 'Bob' });
			expect(JSON.parse(lines[2])).toEqual({ id: 3, name: 'Charlie' });
		});

		it('should handle empty generator', async () => {
			async function* emptyGenerator() {
				// Yields nothing
			}

			const writer = new NdJsonStreamWriter(emptyGenerator());
			const chunks: string[] = [];

			for await (const chunk of writer) {
				chunks.push(chunk.toString());
			}

			expect(chunks).toHaveLength(0);
		});

		it('should handle complex nested objects', async () => {
			async function* complexGenerator() {
				yield {
					user: { id: 1, profile: { name: 'Alice', age: 30 } },
					tags: ['admin', 'user'],
					metadata: { created: '2023-01-01', active: true }
				};
			}

			const writer = new NdJsonStreamWriter(complexGenerator());
			const chunks: string[] = [];

			for await (const chunk of writer) {
				chunks.push(chunk.toString());
			}

			expect(chunks).toHaveLength(1);
			const parsed = JSON.parse(chunks[0]);
			expect(parsed).toEqual({
				user: { id: 1, profile: { name: 'Alice', age: 30 } },
				tags: ['admin', 'user'],
				metadata: { created: '2023-01-01', active: true }
			});
		});

		it('should handle special characters and unicode', async () => {
			async function* unicodeGenerator() {
				yield { text: 'Hello 世界! 🌍', emoji: '😀' };
				yield { special: 'quotes:"nested", newline:\n, tab:\t' };
			}

			const writer = new NdJsonStreamWriter(unicodeGenerator());
			let allData = '';

			for await (const chunk of writer) {
				allData += chunk.toString();
			}

			const lines = allData.trim().split('\n');
			expect(lines.length).toBeGreaterThanOrEqual(2);
			expect(JSON.parse(lines[0])).toEqual({ text: 'Hello 世界! 🌍', emoji: '😀' });
			expect(JSON.parse(lines[1]).special).toContain('quotes');
		});

		it('should stream data incrementally', async () => {
			async function* delayedGenerator() {
				for (let i = 1; i <= 3; i++) {
					yield { batch: i };
					// Small delay to simulate async data generation
					await new Promise(resolve => setTimeout(resolve, 1));
				}
			}

			const writer = new NdJsonStreamWriter(delayedGenerator());
			const items = await collectLines(writer);

			expect(items).toHaveLength(3);
			expect(items[0]).toEqual({ batch: 1 });
			expect(items[1]).toEqual({ batch: 2 });
			expect(items[2]).toEqual({ batch: 3 });
		});
	});

	describe('backpressure handling', () => {
		it('should respect backpressure from push', async () => {
			async function* largeGenerator() {
				for (let i = 0; i < 1000; i++) {
					yield { index: i, data: 'x'.repeat(100) };
				}
			}

			const writer = new NdJsonStreamWriter(largeGenerator());
			const chunks: string[] = [];

			// Use a traditional event-based approach to observe backpressure
			let dataCount = 0;
			writer.on('data', (chunk) => {
				dataCount++;
				chunks.push(chunk.toString());
			});

			await new Promise<void>((resolve) => {
				writer.on('end', () => resolve());
			});

			expect(dataCount).toBe(1000);
			expect(chunks).toHaveLength(1000);
		});

		it('should prevent concurrent reads', async () => {
			let readCount = 0;
			async function* trackingGenerator() {
				for (let i = 0; i < 5; i++) {
					readCount++;
					yield { id: i };
				}
			}

			const writer = new NdJsonStreamWriter(trackingGenerator());
			const items = await collectLines(writer);

			expect(items).toHaveLength(5);
			expect(readCount).toBe(5);
		});
	});

	describe('error handling', () => {
		it('should handle generator errors', async () => {
			async function* errorGenerator() {
				yield { id: 1 };
				throw new Error('Generator error');
			}

			const writer = new NdJsonStreamWriter(errorGenerator());

			await expect(collectLines(writer)).rejects.toThrow('Generator error');
		});

		it('should handle JSON serialization errors', async () => {
			const circularRef: any = { name: 'test' };
			circularRef.self = circularRef;

			async function* circularGenerator() {
				yield circularRef;
			}

			const writer = new NdJsonStreamWriter(circularGenerator());

			await expect(async () => {
				for await (const chunk of writer) {
					// Should throw during JSON.stringify
				}
			}).rejects.toThrow();
		});

		it('should destroy stream on error', async () => {
			async function* throwingGenerator() {
				yield { id: 1 };
				throw new Error('Test error');
			}

			const writer = new NdJsonStreamWriter(throwingGenerator());
			let errorCaught = false;

			writer.on('error', (err) => {
				errorCaught = true;
				expect(err.message).toBe('Test error');
			});

			try {
				for await (const chunk of writer) {
					// Process chunks
				}
			} catch (err) {
				// Expected error
			}

			expect(errorCaught).toBe(true);
		});
	});

	describe('_destroy method', () => {
		it('should call generator return method on destroy', async () => {
			let returnCalled = false;
			// @ts-expect-error - Jest mock typing
			const mockReturn = jest.fn().mockResolvedValue({ done: true, value: undefined });

			async function* generatorWithReturn() {
				yield { id: 1 };
				yield { id: 2 };
			}

			const generator = generatorWithReturn();
			// Override the return method
			generator.return = mockReturn as any;

			const writer = new NdJsonStreamWriter(generator);

			// Start reading
			writer.read();

			// Destroy the stream
			writer.destroy();

			// Wait for destroy callback
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockReturn).toHaveBeenCalled();
		});

		it('should handle generators without return method', async () => {
			async function* simpleGenerator() {
				yield { id: 1 };
			}

			const generator = simpleGenerator();
			// Remove return method
			delete (generator as any).return;

			const writer = new NdJsonStreamWriter(generator);

			// Should not throw when destroying
			expect(() => writer.destroy()).not.toThrow();
		});

		it('should pass error through destroy callback', async () => {
			async function* testGenerator() {
				yield { id: 1 };
			}

			const writer = new NdJsonStreamWriter(testGenerator());
			const destroyError = new Error('Destroy error');

			let errorEmitted = false;
			writer.on('error', (err) => {
				errorEmitted = true;
				expect(err.message).toBe('Destroy error');
			});

			writer.destroy(destroyError);

			// Wait for error to be emitted
			await new Promise(resolve => setTimeout(resolve, 10));
			expect(errorEmitted).toBe(true);
		});

		it('should handle return method rejection', async () => {
			const returnError = new Error('Return failed');
			// @ts-expect-error - Jest mock typing
			const mockReturn = jest.fn().mockRejectedValue(returnError);

			async function* testGenerator() {
				yield { id: 1 };
			}

			const generator = testGenerator();
			generator.return = mockReturn as any;

			const writer = new NdJsonStreamWriter(generator);

			let errorCaught = false;
			writer.on('error', (err) => {
				errorCaught = true;
				expect(err.message).toBe('Return failed');
			});

			writer.destroy();

			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockReturn).toHaveBeenCalled();
			expect(errorCaught).toBe(true);
		});
	});

	describe('stream properties', () => {
		it('should set UTF-8 encoding', async () => {
			async function* testGenerator() {
				yield { text: 'test' };
			}

			const writer = new NdJsonStreamWriter(testGenerator());

			expect(writer.readableEncoding).toBe('utf8');
		});

		it('should be readable stream', async () => {
			async function* testGenerator() {
				yield { id: 1 };
			}

			const writer = new NdJsonStreamWriter(testGenerator());

			expect(writer.readable).toBe(true);
			// Readable streams don't have a writable property, they are read-only
		});
	});

	describe('integration scenarios', () => {
		it('should handle large dataset streaming', async () => {
			const itemCount = 10000;
			async function* largeDataset() {
				for (let i = 0; i < itemCount; i++) {
					yield {
						id: i,
						timestamp: new Date().toISOString(),
						data: `item-${i}`
					};
				}
			}

			const writer = new NdJsonStreamWriter(largeDataset());
			const items = await collectLines(writer);

			expect(items).toHaveLength(itemCount);
			expect(items[0]).toHaveProperty('id', 0);
			expect(items[itemCount - 1]).toHaveProperty('id', itemCount - 1);
		});

		it('should work with pipe', async () => {
			async function* testGenerator() {
				yield { id: 1, name: 'test' };
				yield { id: 2, name: 'test2' };
			}

			const writer = new NdJsonStreamWriter(testGenerator());
			const chunks: Buffer[] = [];

			// Create a writable stream to pipe to
			const { Writable } = await import('stream');
			const collector = new Writable({
				write(chunk, encoding, callback) {
					chunks.push(chunk);
					callback();
				}
			});

			writer.pipe(collector);

			await new Promise<void>((resolve) => {
				collector.on('finish', () => resolve());
			});

			expect(chunks).toHaveLength(2);
		});

		it('should handle mixed data types', async () => {
			async function* mixedGenerator() {
				yield { type: 'string', value: 'text' };
				yield { type: 'number', value: 42 };
				yield { type: 'boolean', value: true };
				yield { type: 'null', value: null };
				yield { type: 'array', value: [1, 2, 3] };
				yield { type: 'object', value: { nested: 'value' } };
			}

			const writer = new NdJsonStreamWriter(mixedGenerator());
			const items = await collectLines(writer);

			expect(items).toHaveLength(6);
			items.forEach(item => {
				expect(item).toHaveProperty('type');
				expect(item).toHaveProperty('value');
			});
		});
	});
});