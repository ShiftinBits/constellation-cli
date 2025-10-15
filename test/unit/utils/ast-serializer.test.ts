import { describe, it, expect, jest } from '@jest/globals';
import { SyntaxNode } from 'tree-sitter';
import { serializeAST, SerializedNode } from '../../../src/utils/ast-serializer';
import { createMockASTNode } from '../../helpers/mocks';

describe('ASTSerializer', () => {
	describe('serializeAST', () => {
		it('should serialize basic node properties', async () => {
			const mockNode = {
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 5, column: 1 },
				text: 'function test() {}',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result).toEqual({
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 5, column: 1 },
			});
		});

		it('should include field name when provided', async () => {
			const mockNode = {
				type: 'identifier',
				startPosition: { row: 1, column: 9 },
				endPosition: { row: 1, column: 13 },
				text: 'test',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode, 'name');

			expect(result).toEqual({
				type: 'identifier',
				startPosition: { row: 1, column: 9 },
				endPosition: { row: 1, column: 13 },
				text: 'test',
				fieldName: 'name',
			});
		});

		it('should include text for identifier nodes', async () => {
			const mockNode = {
				type: 'identifier',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 8 },
				text: 'variable',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBe('variable');
		});

		it('should include text for string literals', async () => {
			const mockNode = {
				type: 'string_literal',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 13 },
				text: '"hello world"',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBe('"hello world"');
		});

		it('should include text for boolean literals', async () => {
			const trueMockNode = {
				type: 'true',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 4 },
				text: 'true',
				childCount: 0,
			} as SyntaxNode;

			const falseMockNode = {
				type: 'false',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 5 },
				text: 'false',
				childCount: 0,
			} as SyntaxNode;

			expect((await serializeAST(trueMockNode)).text).toBe('true');
			expect((await serializeAST(falseMockNode)).text).toBe('false');
		});

		it('should include text for keyword nodes', async () => {
			const mockNode = {
				type: 'const_keyword',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 5 },
				text: 'const',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBe('const');
		});

		it('should include text for operator nodes', async () => {
			const mockNode = {
				type: 'binary_operator',
				startPosition: { row: 0, column: 2 },
				endPosition: { row: 0, column: 3 },
				text: '+',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBe('+');
		});

		it('should NOT include text for code block nodes', async () => {
			const mockNode = {
				type: 'statement_block',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 10, column: 1 },
				text: '{\n  console.log("hello");\n  return true;\n}',
				childCount: 2,
				child: jest.fn().mockReturnValue(null),
			} as unknown as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBeUndefined();
		});

		it('should serialize children recursively', async () => {
			const childNode = {
				type: 'identifier',
				startPosition: { row: 1, column: 9 },
				endPosition: { row: 1, column: 13 },
				text: 'test',
				childCount: 0,
			} as SyntaxNode;

			const parentNode = {
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 5, column: 1 },
				text: 'function test() {}',
				childCount: 1,
				child: jest.fn().mockReturnValue(childNode),
				childForFieldName: jest.fn().mockReturnValue(null),
			} as unknown as SyntaxNode;

			const result = await serializeAST(parentNode);

			expect(result.children).toHaveLength(1);
			expect(result.children![0]).toEqual({
				type: 'identifier',
				startPosition: { row: 1, column: 9 },
				endPosition: { row: 1, column: 13 },
				text: 'test',
			});
		});

		it('should handle field names for common node types', async () => {
			const nameNode = {
				type: 'identifier',
				startPosition: { row: 1, column: 9 },
				endPosition: { row: 1, column: 13 },
				text: 'test',
				childCount: 0,
			} as SyntaxNode;

			const parentNode = {
				type: 'function_declaration',
				startPosition: { row: 1, column: 0 },
				endPosition: { row: 5, column: 1 },
				text: 'function test() {}',
				childCount: 1,
				child: jest.fn().mockReturnValue(nameNode),
				childForFieldName: jest.fn((fieldName: string) => {
					return fieldName === 'name' ? nameNode : null;
				}),
			} as unknown as SyntaxNode;

			const result = await serializeAST(parentNode);

			expect(result.children).toHaveLength(1);
			expect(result.children![0].fieldName).toBe('name');
		});

		it('should handle mixed field and anonymous children', async () => {
			const nameNode = {
				type: 'identifier',
				text: 'test',
				startPosition: { row: 0, column: 9 },
				endPosition: { row: 0, column: 13 },
				childCount: 0,
			} as SyntaxNode;

			const parenNode = {
				type: '(',
				text: '(',
				startPosition: { row: 0, column: 13 },
				endPosition: { row: 0, column: 14 },
				childCount: 0,
			} as SyntaxNode;

			const parentNode = {
				type: 'function_declaration',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 17 },
				text: 'function test() {}',
				childCount: 2,
				child: jest.fn((index: number) => {
					if (index === 0) return nameNode;
					if (index === 1) return parenNode;
					return null;
				}),
				childForFieldName: jest.fn((fieldName: string) => {
					return fieldName === 'name' ? nameNode : null;
				}),
			} as unknown as SyntaxNode;

			const result = await serializeAST(parentNode);

			expect(result.children).toHaveLength(2);

			// First child should be the named field
			expect(result.children![0].fieldName).toBe('name');
			expect(result.children![0].type).toBe('identifier');

			// Second child should be anonymous
			expect(result.children![1].fieldName).toBeUndefined();
			expect(result.children![1].type).toBe('(');
		});

		it('should handle nodes with no children', async () => {
			const mockNode = {
				type: 'identifier',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 5 },
				text: 'hello',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.children).toBeUndefined();
		});

		it('should handle complex nested structures', async () => {
			// Create a complex AST structure: function with parameters and body
			const paramNode = {
				type: 'identifier',
				text: 'param',
				startPosition: { row: 0, column: 14 },
				endPosition: { row: 0, column: 19 },
				childCount: 0,
			} as SyntaxNode;

			const bodyNode = {
				type: 'statement_block',
				startPosition: { row: 0, column: 21 },
				endPosition: { row: 2, column: 1 },
				text: '{\n  return param;\n}',
				childCount: 1,
				child: jest.fn().mockReturnValue({
					type: 'return_statement',
					startPosition: { row: 1, column: 2 },
					endPosition: { row: 1, column: 15 },
					text: 'return param;',
					childCount: 0,
				} as SyntaxNode),
				childForFieldName: jest.fn().mockReturnValue(null),
			} as unknown as SyntaxNode;

			const functionNode = {
				type: 'function_declaration',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 2, column: 1 },
				text: 'function test(param) {\n  return param;\n}',
				childCount: 2,
				child: jest.fn((index: number) => {
					if (index === 0) return paramNode;
					if (index === 1) return bodyNode;
					return null;
				}),
				childForFieldName: jest.fn((fieldName: string) => {
					if (fieldName === 'parameters') return paramNode;
					if (fieldName === 'body') return bodyNode;
					return null;
				}),
			} as unknown as SyntaxNode;

			const result = await serializeAST(functionNode);

			expect(result.type).toBe('function_declaration');
			expect(result.children).toHaveLength(2);

			// Check field names are preserved
			const paramChild = result.children!.find(c => c.fieldName === 'parameters');
			const bodyChild = result.children!.find(c => c.fieldName === 'body');

			expect(paramChild).toBeDefined();
			expect(paramChild!.text).toBe('param');

			expect(bodyChild).toBeDefined();
			expect(bodyChild!.type).toBe('statement_block');
			expect(bodyChild!.text).toBeUndefined(); // Should not include text for code blocks
		});

		it('should preserve position information accurately', async () => {
			const mockNode = {
				type: 'string_literal',
				startPosition: { row: 42, column: 15 },
				endPosition: { row: 42, column: 28 },
				text: '"hello world"',
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.startPosition).toEqual({ row: 42, column: 15 });
			expect(result.endPosition).toEqual({ row: 42, column: 28 });
		});
	});
});