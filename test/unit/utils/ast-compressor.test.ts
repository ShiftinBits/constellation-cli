import { describe, it, expect, beforeEach } from '@jest/globals';
import { ASTCompressor } from '../../../src/utils/ast-compressor';
import { SerializedNode } from '../../../src/utils/ast-serializer';

describe('ASTCompressor', () => {
	let compressor: ASTCompressor;

	beforeEach(() => {
		compressor = new ASTCompressor();
	});

	describe('compress', () => {
		it('should compress a simple AST node', async () => {
			const ast: SerializedNode = {
				type: 'function_declaration',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 5, column: 1 },
			};

			const compressed = await compressor.compress(ast);

			expect(compressed).toBeTruthy();
			expect(typeof compressed).toBe('string');
			// Should be base64 encoded
			expect(compressed).toMatch(/^[A-Za-z0-9+/]+=*$/);
		});

		it('should compress complex AST with children', async () => {
			const ast: SerializedNode = {
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 10, column: 1 },
				children: [
					{
						type: 'identifier',
						startPosition: { row: 1, column: 9 },
						endPosition: { row: 1, column: 13 },
						text: 'test',
						fieldName: 'name',
					},
					{
						type: 'formal_parameters',
						startPosition: { row: 1, column: 13 },
						endPosition: { row: 1, column: 15 },
						fieldName: 'parameters',
						children: [],
					},
					{
						type: 'statement_block',
						startPosition: { row: 1, column: 16 },
						endPosition: { row: 10, column: 1 },
						fieldName: 'body',
						children: [
							{
								type: 'return_statement',
								startPosition: { row: 2, column: 2 },
								endPosition: { row: 2, column: 14 },
								children: [
									{
										type: 'true',
										startPosition: { row: 2, column: 9 },
										endPosition: { row: 2, column: 13 },
										text: 'true',
									},
								],
							},
						],
					},
				],
			};

			const compressed = await compressor.compress(ast);

			expect(compressed).toBeTruthy();
			expect(typeof compressed).toBe('string');
			expect(compressed).toMatch(/^[A-Za-z0-9+/]+=*$/);

			// Complex AST should produce longer compressed string
			expect(compressed.length).toBeGreaterThan(50);
		});

		it('should handle empty AST node', async () => {
			const ast: SerializedNode = {
				type: 'identifier',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 1 },
			};

			const compressed = await compressor.compress(ast);

			expect(compressed).toBeTruthy();
			expect(typeof compressed).toBe('string');
		});

		it('should handle AST with special characters', async () => {
			const ast: SerializedNode = {
				type: 'string_literal',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 20 },
				text: '"Hello 🌍 Unicode!"',
			};

			const compressed = await compressor.compress(ast);

			expect(compressed).toBeTruthy();
			expect(typeof compressed).toBe('string');
			expect(compressed).toMatch(/^[A-Za-z0-9+/]+=*$/);
		});

		it('should produce different output for different ASTs', async () => {
			const ast1: SerializedNode = {
				type: 'function_declaration',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 5, column: 1 },
			};

			const ast2: SerializedNode = {
				type: 'class_declaration',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 10, column: 1 },
			};

			const compressed1 = await compressor.compress(ast1);
			const compressed2 = await compressor.compress(ast2);

			expect(compressed1).not.toBe(compressed2);
		});

		it('should be deterministic for same input', async () => {
			const ast: SerializedNode = {
				type: 'identifier',
				startPosition: { row: 5, column: 10 },
				endPosition: { row: 5, column: 15 },
				text: 'value',
			};

			const compressed1 = await compressor.compress(ast);
			const compressed2 = await compressor.compress(ast);

			expect(compressed1).toBe(compressed2);
		});
	});

	describe('decompress', () => {
		it('should decompress to original AST', async () => {
			const originalAST: SerializedNode = {
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 5, column: 1 },
				children: [
					{
						type: 'identifier',
						startPosition: { row: 1, column: 9 },
						endPosition: { row: 1, column: 13 },
						text: 'test',
						fieldName: 'name',
					},
				],
			};

			const compressed = await compressor.compress(originalAST);
			const decompressed = await compressor.decompress(compressed);

			expect(decompressed).toEqual(originalAST);
		});

		it('should handle complex nested structures', async () => {
			const originalAST: SerializedNode = {
				type: 'program',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 50, column: 0 },
				children: [
					{
						type: 'function_declaration',
						startPosition: { row: 1, column: 0 },
						endPosition: { row: 10, column: 1 },
						fieldName: 'declarations',
						children: [
							{
								type: 'identifier',
								startPosition: { row: 1, column: 9 },
								endPosition: { row: 1, column: 15 },
								text: 'myFunc',
								fieldName: 'name',
							},
							{
								type: 'formal_parameters',
								startPosition: { row: 1, column: 15 },
								endPosition: { row: 1, column: 25 },
								fieldName: 'parameters',
								children: [
									{
										type: 'identifier',
										startPosition: { row: 1, column: 16 },
										endPosition: { row: 1, column: 21 },
										text: 'param',
									},
								],
							},
						],
					},
					{
						type: 'class_declaration',
						startPosition: { row: 12, column: 0 },
						endPosition: { row: 25, column: 1 },
						fieldName: 'declarations',
						children: [
							{
								type: 'identifier',
								startPosition: { row: 12, column: 6 },
								endPosition: { row: 12, column: 13 },
								text: 'MyClass',
								fieldName: 'name',
							},
						],
					},
				],
			};

			const compressed = await compressor.compress(originalAST);
			const decompressed = await compressor.decompress(compressed);

			expect(decompressed).toEqual(originalAST);
		});

		it('should preserve all node properties', async () => {
			const originalAST: SerializedNode = {
				type: 'string_literal',
				startPosition: { row: 5, column: 10 },
				endPosition: { row: 5, column: 25 },
				text: '"Hello, World!"',
				fieldName: 'value',
			};

			const compressed = await compressor.compress(originalAST);
			const decompressed = await compressor.decompress(compressed);

			expect(decompressed.type).toBe(originalAST.type);
			expect(decompressed.startPosition).toEqual(originalAST.startPosition);
			expect(decompressed.endPosition).toEqual(originalAST.endPosition);
			expect(decompressed.text).toBe(originalAST.text);
			expect(decompressed.fieldName).toBe(originalAST.fieldName);
		});

		it('should handle Unicode and special characters', async () => {
			const originalAST: SerializedNode = {
				type: 'string_literal',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 30 },
				text: '"🚀 Emoji and Unicode: 测试"',
			};

			const compressed = await compressor.compress(originalAST);
			const decompressed = await compressor.decompress(compressed);

			expect(decompressed).toEqual(originalAST);
			expect(decompressed.text).toBe('"🚀 Emoji and Unicode: 测试"');
		});

		it('should throw error for invalid base64 data', async () => {
			const invalidBase64 = 'this-is-not-valid-base64!@#$';

			await expect(compressor.decompress(invalidBase64)).rejects.toThrow();
		});

		it('should throw error for invalid compressed data', async () => {
			// Valid base64 but not valid gzip data
			const invalidCompressed =
				Buffer.from('invalid gzip data').toString('base64');

			await expect(compressor.decompress(invalidCompressed)).rejects.toThrow();
		});

		it('should throw error for invalid JSON after decompression', async () => {
			// Create valid gzip data but with invalid JSON
			const zlib = require('zlib');
			const invalidJson = '{invalid json}';
			const compressed = zlib.gzipSync(Buffer.from(invalidJson, 'utf8'));
			const base64 = compressed.toString('base64');

			await expect(compressor.decompress(base64)).rejects.toThrow();
		});
	});

	describe('round-trip compression', () => {
		it('should maintain data integrity through multiple compress/decompress cycles', async () => {
			const originalAST: SerializedNode = {
				type: 'module',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 100, column: 0 },
				children: [
					{
						type: 'export_statement',
						startPosition: { row: 1, column: 0 },
						endPosition: { row: 1, column: 25 },
						children: [
							{
								type: 'function_declaration',
								startPosition: { row: 1, column: 7 },
								endPosition: { row: 1, column: 25 },
								fieldName: 'declaration',
								children: [
									{
										type: 'identifier',
										startPosition: { row: 1, column: 16 },
										endPosition: { row: 1, column: 20 },
										text: 'test',
										fieldName: 'name',
									},
								],
							},
						],
					},
				],
			};

			let current = originalAST;

			// Perform multiple round trips
			for (let i = 0; i < 3; i++) {
				const compressed = await compressor.compress(current);
				current = await compressor.decompress(compressed);
			}

			expect(current).toEqual(originalAST);
		});

		it('should achieve compression for large ASTs', async () => {
			// Create a large AST with repetitive structure
			const children: SerializedNode[] = [];
			for (let i = 0; i < 100; i++) {
				children.push({
					type: 'variable_declaration',
					startPosition: { row: i, column: 0 },
					endPosition: { row: i, column: 20 },
					children: [
						{
							type: 'identifier',
							startPosition: { row: i, column: 4 },
							endPosition: { row: i, column: 10 },
							text: `var${i}`,
							fieldName: 'name',
						},
					],
				});
			}

			const largeAST: SerializedNode = {
				type: 'program',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 100, column: 0 },
				children,
			};

			const originalSize = JSON.stringify(largeAST).length;
			const compressed = await compressor.compress(largeAST);
			const compressedSize = compressed.length;

			// Should achieve some compression
			expect(compressedSize).toBeLessThan(originalSize);

			// Should decompress correctly
			const decompressed = await compressor.decompress(compressed);
			expect(decompressed).toEqual(largeAST);
		});
	});
});
