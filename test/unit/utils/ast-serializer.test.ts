import { describe, it, expect, jest } from '@jest/globals';
import { SyntaxNode } from 'tree-sitter';
import {
	serializeAST,
	serializeASTStream,
	SerializedNode,
	TEXT_INCLUDED_TYPES,
	JS_TS_FIELD_NAMES,
	PYTHON_FIELD_NAMES,
	COMMON_FIELD_NAMES,
	mergeFieldMaps,
} from '../../../src/utils/ast-serializer';
import {
	getTextIncludedTypes,
	getFieldNamesForLanguage,
	getLanguageConfig,
	SHARED_TEXT_TYPES,
} from '../../../src/utils/language-configs/index';

describe('TEXT_INCLUDED_TYPES', () => {
	it('should be a Set', () => {
		expect(TEXT_INCLUDED_TYPES).toBeInstanceOf(Set);
	});

	it('should contain JS/TS identifier types', () => {
		expect(TEXT_INCLUDED_TYPES.has('identifier')).toBe(true);
		expect(TEXT_INCLUDED_TYPES.has('property_identifier')).toBe(true);
		expect(TEXT_INCLUDED_TYPES.has('type_identifier')).toBe(true);
	});

	it('should contain Python-specific types', () => {
		expect(TEXT_INCLUDED_TYPES.has('dotted_name')).toBe(true);
		expect(TEXT_INCLUDED_TYPES.has('None')).toBe(true);
	});

	it('should contain string_content (Python string leaf text for __all__ exports)', () => {
		expect(TEXT_INCLUDED_TYPES.has('string_content')).toBe(true);
	});

	it('should contain type annotation types', () => {
		expect(TEXT_INCLUDED_TYPES.has('type_annotation')).toBe(true);
		expect(TEXT_INCLUDED_TYPES.has('generic_type')).toBe(true);
	});
});

describe('mergeFieldMaps', () => {
	it('should union arrays for shared keys with deduplication', () => {
		const a = { foo: ['a', 'b'] };
		const b = { foo: ['b', 'c'] };
		expect(mergeFieldMaps(a, b)['foo']).toEqual(['a', 'b', 'c']);
	});

	it('should preserve unique keys from each map', () => {
		const a = { only_a: ['x'] };
		const b = { only_b: ['y'] };
		const result = mergeFieldMaps(a, b);
		expect(result['only_a']).toEqual(['x']);
		expect(result['only_b']).toEqual(['y']);
	});

	it('should handle three or more maps', () => {
		expect(
			mergeFieldMaps({ s: ['a'] }, { s: ['b'] }, { s: ['c'] })['s'],
		).toEqual(['a', 'b', 'c']);
	});
});

describe('Language Field Name Maps', () => {
	it('JS_TS_FIELD_NAMES should contain function_declaration', () => {
		expect(JS_TS_FIELD_NAMES['function_declaration']).toEqual(
			expect.arrayContaining(['name', 'parameters', 'body']),
		);
	});

	it('JS_TS_FIELD_NAMES should NOT contain Python-only types', () => {
		expect(JS_TS_FIELD_NAMES['function_definition']).toBeUndefined();
		expect(JS_TS_FIELD_NAMES['class_definition']).toBeUndefined();
	});

	it('PYTHON_FIELD_NAMES should contain function_definition', () => {
		expect(PYTHON_FIELD_NAMES['function_definition']).toEqual(
			expect.arrayContaining(['name', 'parameters', 'body']),
		);
	});

	it('PYTHON_FIELD_NAMES should NOT contain JS-only types', () => {
		expect(PYTHON_FIELD_NAMES['arrow_function']).toBeUndefined();
	});

	it('PYTHON_FIELD_NAMES should contain if_statement fields', () => {
		expect(PYTHON_FIELD_NAMES['if_statement']).toEqual(
			expect.arrayContaining(['condition', 'consequence', 'alternative']),
		);
	});

	it('PYTHON_FIELD_NAMES should contain while_statement fields', () => {
		expect(PYTHON_FIELD_NAMES['while_statement']).toEqual(
			expect.arrayContaining(['condition', 'body', 'alternative']),
		);
	});

	it('PYTHON_FIELD_NAMES should contain try_statement body field', () => {
		expect(PYTHON_FIELD_NAMES['try_statement']).toEqual(
			expect.arrayContaining(['body']),
		);
	});

	it('PYTHON_FIELD_NAMES should contain with_item value field', () => {
		expect(PYTHON_FIELD_NAMES['with_item']).toEqual(
			expect.arrayContaining(['value']),
		);
	});

	it('COMMON_FIELD_NAMES should include Python control flow entries', () => {
		expect(COMMON_FIELD_NAMES['if_statement']).toEqual(
			expect.arrayContaining(['condition', 'consequence', 'alternative']),
		);
		expect(COMMON_FIELD_NAMES['try_statement']).toEqual(
			expect.arrayContaining(['body']),
		);
	});

	it('COMMON_FIELD_NAMES should merge import_statement from both', () => {
		const fields = COMMON_FIELD_NAMES['import_statement'];
		expect(fields).toContain('source'); // JS/TS
		expect(fields).toContain('name'); // Python
		expect(fields!.length).toBe(new Set(fields).size); // no duplicates
	});

	it('COMMON_FIELD_NAMES should merge for_statement from both', () => {
		const fields = COMMON_FIELD_NAMES['for_statement'];
		expect(fields).toContain('init'); // JS
		expect(fields).toContain('left'); // Python
	});
});

describe('Language-Specific Serializer Configs', () => {
	describe('getTextIncludedTypes', () => {
		it('should return SHARED_TEXT_TYPES when no language is provided', () => {
			const types = getTextIncludedTypes();
			expect(types).toBe(SHARED_TEXT_TYPES);
		});

		it('should return SHARED_TEXT_TYPES for unknown language', () => {
			const types = getTextIncludedTypes('unknown-lang');
			expect(types).toBe(SHARED_TEXT_TYPES);
		});

		it('should include Python-specific types for python', () => {
			const types = getTextIncludedTypes('python');
			// Python-specific type annotation nodes
			expect(types.has('subscript')).toBe(true);
			expect(types.has('attribute')).toBe(true);
			expect(types.has('list')).toBe(true);
			expect(types.has('tuple')).toBe(true);
			expect(types.has('binary_operator')).toBe(true);
			// Python-specific literals
			expect(types.has('None')).toBe(true);
			expect(types.has('True')).toBe(true);
			expect(types.has('False')).toBe(true);
			expect(types.has('dotted_name')).toBe(true);
			// Shared types should also be present
			expect(types.has('identifier')).toBe(true);
			expect(types.has('string')).toBe(true);
			expect(types.has('string_content')).toBe(true);
		});

		it('should NOT include Python-specific types for typescript', () => {
			const types = getTextIncludedTypes('typescript');
			expect(types.has('subscript')).toBe(false);
			expect(types.has('attribute')).toBe(false);
			expect(types.has('list')).toBe(false);
			expect(types.has('tuple')).toBe(false);
			expect(types.has('dotted_name')).toBe(false);
			expect(types.has('None')).toBe(false);
		});

		it('should include JS/TS-specific types for typescript', () => {
			const types = getTextIncludedTypes('typescript');
			expect(types.has('type_annotation')).toBe(true);
			expect(types.has('generic_type')).toBe(true);
			expect(types.has('union_type')).toBe(true);
			expect(types.has('predefined_type')).toBe(true);
			expect(types.has('undefined')).toBe(true);
			// Shared types should also be present
			expect(types.has('identifier')).toBe(true);
			expect(types.has('string')).toBe(true);
		});

		it('should include JS/TS-specific types for javascript', () => {
			const types = getTextIncludedTypes('javascript');
			expect(types.has('type_annotation')).toBe(true);
			expect(types.has('null')).toBe(true);
			expect(types.has('true')).toBe(true);
			expect(types.has('false')).toBe(true);
		});
	});

	describe('getFieldNamesForLanguage', () => {
		it('should return Python field names for python', () => {
			const fields = getFieldNamesForLanguage('python');
			expect(fields['function_definition']).toEqual(
				expect.arrayContaining(['name', 'parameters', 'body']),
			);
			expect(fields['class_definition']).toEqual(
				expect.arrayContaining(['name', 'superclasses', 'body']),
			);
			// Should NOT contain JS-only types
			expect(fields['arrow_function']).toBeUndefined();
		});

		it('should return JS/TS field names for typescript', () => {
			const fields = getFieldNamesForLanguage('typescript');
			expect(fields['function_declaration']).toEqual(
				expect.arrayContaining(['name', 'parameters', 'body']),
			);
			expect(fields['arrow_function']).toEqual(
				expect.arrayContaining(['parameters', 'body']),
			);
			// Should NOT contain Python-only types
			expect(fields['function_definition']).toBeUndefined();
		});

		it('should return merged field names when no language is provided', () => {
			const fields = getFieldNamesForLanguage();
			// Should contain both JS and Python entries
			expect(fields['function_declaration']).toBeDefined();
			expect(fields['function_definition']).toBeDefined();
			// Shared keys should be merged
			expect(fields['import_statement']).toContain('source'); // JS/TS
			expect(fields['import_statement']).toContain('name'); // Python
		});
	});

	describe('getLanguageConfig', () => {
		it('should return config for known languages', () => {
			expect(getLanguageConfig('python')).toBeDefined();
			expect(getLanguageConfig('javascript')).toBeDefined();
			expect(getLanguageConfig('typescript')).toBeDefined();
		});

		it('should return undefined for unknown languages', () => {
			expect(getLanguageConfig('rust')).toBeUndefined();
		});

		it('python config should have shouldIncludeText guard', () => {
			const config = getLanguageConfig('python');
			expect(config?.shouldIncludeText).toBeDefined();

			// Compound string node should be excluded
			const compoundStringNode = {
				type: 'string',
				childCount: 3,
			} as SyntaxNode;
			expect(config?.shouldIncludeText?.(compoundStringNode)).toBe(false);

			// Non-string node should fall through
			const identifierNode = {
				type: 'identifier',
				childCount: 0,
			} as SyntaxNode;
			expect(config?.shouldIncludeText?.(identifierNode)).toBeUndefined();
		});
	});

	describe('SHARED_TEXT_TYPES', () => {
		it('should contain universal types', () => {
			expect(SHARED_TEXT_TYPES.has('identifier')).toBe(true);
			expect(SHARED_TEXT_TYPES.has('string')).toBe(true);
			expect(SHARED_TEXT_TYPES.has('number')).toBe(true);
			expect(SHARED_TEXT_TYPES.has('decorator')).toBe(true);
			expect(SHARED_TEXT_TYPES.has('string_content')).toBe(true);
		});

		it('should NOT contain language-specific types', () => {
			// JS/TS-specific
			expect(SHARED_TEXT_TYPES.has('type_annotation')).toBe(false);
			expect(SHARED_TEXT_TYPES.has('predefined_type')).toBe(false);
			expect(SHARED_TEXT_TYPES.has('undefined')).toBe(false);
			// Python-specific
			expect(SHARED_TEXT_TYPES.has('subscript')).toBe(false);
			expect(SHARED_TEXT_TYPES.has('dotted_name')).toBe(false);
			expect(SHARED_TEXT_TYPES.has('None')).toBe(false);
		});
	});
});

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

		it('should include text for leaf string nodes (JS/TS import paths)', async () => {
			const mockNode = {
				type: 'string',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 10 },
				text: "'./module'",
				childCount: 0,
			} as SyntaxNode;

			const result = await serializeAST(mockNode);

			expect(result.text).toBe("'./module'");
		});

		it('should NOT include text for compound string nodes (Python privacy)', async () => {
			const stringContentChild = {
				type: 'string_content',
				startPosition: { row: 0, column: 1 },
				endPosition: { row: 0, column: 18 },
				text: 'secret-api-key-123',
				childCount: 0,
			} as SyntaxNode;

			const mockNode = {
				type: 'string',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 19 },
				text: '"secret-api-key-123"',
				childCount: 1,
				child: jest.fn().mockReturnValue(stringContentChild),
				childForFieldName: jest.fn().mockReturnValue(null),
			} as unknown as SyntaxNode;

			const result = await serializeAST(mockNode);

			// Compound string node should NOT have text (privacy)
			expect(result.text).toBeUndefined();
			// But children should still be serialized (structure preserved)
			expect(result.children).toHaveLength(1);
			expect(result.children![0].type).toBe('string_content');
			// string_content IS in TEXT_INCLUDED_TYPES — leaf text preserved for __all__ exports
			expect(result.children![0].text).toBe('secret-api-key-123');
		});

		it('should NOT include text for compound string nodes in streaming serializer', () => {
			const stringContentChild = {
				type: 'string_content',
				startPosition: { row: 0, column: 1 },
				endPosition: { row: 0, column: 18 },
				text: 'secret-api-key-123',
				childCount: 0,
			} as SyntaxNode;

			const mockNode = {
				type: 'string',
				startPosition: { row: 0, column: 0 },
				endPosition: { row: 0, column: 19 },
				text: '"secret-api-key-123"',
				childCount: 1,
				child: jest.fn().mockReturnValue(stringContentChild),
				childForFieldName: jest.fn().mockReturnValue(null),
			} as unknown as SyntaxNode;

			const chunks = [...serializeASTStream(mockNode)];
			const json = chunks.join('');
			const parsed = JSON.parse(json);

			// Compound string node should NOT have text (privacy)
			expect(parsed.text).toBeUndefined();
			// Children should still be serialized
			expect(parsed.children).toHaveLength(1);
			expect(parsed.children[0].type).toBe('string_content');
			// string_content IS in TEXT_INCLUDED_TYPES — leaf text preserved for __all__ exports
			expect(parsed.children[0].text).toBe('secret-api-key-123');
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
			const paramChild = result.children!.find(
				(c) => c.fieldName === 'parameters',
			);
			const bodyChild = result.children!.find((c) => c.fieldName === 'body');

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
