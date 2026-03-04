import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ImportExtractor } from '../../../src/utils/import-extractor';
import type { ImportResolver } from '../../../src/languages/plugins/base-plugin';
import type { SyntaxNode, Tree } from 'tree-sitter';

/**
 * Creates a mock SyntaxNode with the given properties.
 * Children can be accessed by index via child() and by field name via childForFieldName().
 */
function mockNode(
	type: string,
	text: string,
	options: {
		row?: number;
		children?: SyntaxNode[];
		fields?: Record<string, SyntaxNode | null>;
	} = {},
): SyntaxNode {
	const { row = 0, children = [], fields = {} } = options;
	return {
		type,
		text,
		startPosition: { row, column: 0 },
		childCount: children.length,
		child: (i: number) => children[i] ?? null,
		childForFieldName: (name: string) => fields[name] ?? null,
	} as unknown as SyntaxNode;
}

/** Creates a mock Tree whose rootNode is a module containing the given child nodes */
function mockTree(children: SyntaxNode[]): Tree {
	const root = mockNode('module', '', { children });
	return { rootNode: root } as unknown as Tree;
}

/** Creates a mock ImportResolver */
function mockResolver(mapping: Record<string, string>): ImportResolver {
	return {
		resolve: jest.fn(async (specifier: string) => {
			return mapping[specifier] ?? specifier;
		}) as ImportResolver['resolve'],
	};
}

describe('ImportExtractor', () => {
	let extractor: ImportExtractor;

	beforeEach(() => {
		extractor = new ImportExtractor();
	});

	describe('extractImportResolutions (no resolver)', () => {
		it('should return empty object when no resolver is provided', async () => {
			const tree = mockTree([]);
			const result = await extractor.extractImportResolutions(
				tree,
				'test.ts',
				'typescript',
			);
			expect(result).toEqual({});
		});
	});

	describe('JS/TS routing', () => {
		it('should process JS import_statement using source field', async () => {
			const sourceNode = mockNode('string', "'./helper'", { row: 2 });
			const importNode = mockNode(
				'import_statement',
				"import { foo } from './helper'",
				{
					row: 2,
					fields: { source: sourceNode },
				},
			);
			const tree = mockTree([importNode]);
			const resolver = mockResolver({ './helper': './helper.ts' });

			const result = await extractor.extractImportResolutions(
				tree,
				'test.ts',
				'typescript',
				resolver,
			);

			expect(result['2']).toEqual({
				source: './helper',
				resolvedPath: 'helper.ts',
				isExternal: false,
				importType: 'relative',
			});
		});

		it('should process JS export_statement with source field', async () => {
			const sourceNode = mockNode('string', "'./barrel'", { row: 5 });
			const exportNode = mockNode(
				'export_statement',
				"export * from './barrel'",
				{
					row: 5,
					fields: { source: sourceNode },
				},
			);
			const tree = mockTree([exportNode]);
			const resolver = mockResolver({ './barrel': './barrel/index.ts' });

			const result = await extractor.extractImportResolutions(
				tree,
				'test.ts',
				'typescript',
				resolver,
			);

			expect(result['5']).toEqual({
				source: './barrel',
				resolvedPath: 'barrel/index.ts',
				isExternal: false,
				importType: 'relative',
			});
		});

		it('should NOT process export_statement for Python language', async () => {
			const sourceNode = mockNode('string', "'./barrel'", { row: 5 });
			const exportNode = mockNode(
				'export_statement',
				"export * from './barrel'",
				{
					row: 5,
					fields: { source: sourceNode },
				},
			);
			const tree = mockTree([exportNode]);
			const resolver = mockResolver({ './barrel': './barrel/index.ts' });

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result).toEqual({});
		});
	});

	describe('Python import_statement', () => {
		it('should handle simple import (import os)', async () => {
			const dottedName = mockNode('dotted_name', 'os', { row: 0 });
			const importNode = mockNode('import_statement', 'import os', {
				row: 0,
				fields: { name: dottedName },
			});
			const tree = mockTree([importNode]);
			const resolver = mockResolver({}); // os → os (external)

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['0']).toEqual({
				source: 'os',
				resolvedPath: undefined,
				isExternal: true,
				importType: 'external',
			});
		});

		it('should handle dotted import (import os.path)', async () => {
			const dottedName = mockNode('dotted_name', 'os.path', { row: 1 });
			const importNode = mockNode('import_statement', 'import os.path', {
				row: 1,
				fields: { name: dottedName },
			});
			const tree = mockTree([importNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['1']).toEqual({
				source: 'os.path',
				resolvedPath: undefined,
				isExternal: true,
				importType: 'external',
			});
		});

		it('should handle aliased import (import os.path as osp)', async () => {
			const innerName = mockNode('dotted_name', 'os.path', { row: 2 });
			const aliasedImport = mockNode('aliased_import', 'os.path as osp', {
				row: 2,
				fields: { name: innerName },
			});
			const importNode = mockNode('import_statement', 'import os.path as osp', {
				row: 2,
				fields: { name: aliasedImport },
			});
			const tree = mockTree([importNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['2']).toEqual({
				source: 'os.path',
				resolvedPath: undefined,
				isExternal: true,
				importType: 'external',
			});
		});

		it('should handle internal project import', async () => {
			const dottedName = mockNode('dotted_name', 'mypackage.utils', { row: 0 });
			const importNode = mockNode(
				'import_statement',
				'import mypackage.utils',
				{
					row: 0,
					fields: { name: dottedName },
				},
			);
			const tree = mockTree([importNode]);
			const resolver = mockResolver({
				'mypackage.utils': 'src/mypackage/utils.py',
			});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['0']).toEqual({
				source: 'mypackage.utils',
				resolvedPath: 'src/mypackage/utils.py',
				isExternal: false,
				importType: 'alias',
			});
		});

		it('should skip import_statement with no name field', async () => {
			const importNode = mockNode('import_statement', 'import', {
				row: 0,
				fields: {},
			});
			const tree = mockTree([importNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result).toEqual({});
		});
	});

	describe('Python import_from_statement', () => {
		it('should handle absolute from-import (from pathlib import Path)', async () => {
			const moduleNode = mockNode('dotted_name', 'pathlib', { row: 0 });
			const fromImportNode = mockNode(
				'import_from_statement',
				'from pathlib import Path',
				{
					row: 0,
					fields: { module_name: moduleNode },
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['0']).toEqual({
				source: 'pathlib',
				resolvedPath: undefined,
				isExternal: true,
				importType: 'external',
			});
		});

		it('should handle relative from-import with module (from ..core import Base)', async () => {
			const relativeNode = mockNode('relative_import', '..core', {
				row: 3,
			});
			const fromImportNode = mockNode(
				'import_from_statement',
				'from ..core import Base',
				{
					row: 3,
					fields: { module_name: relativeNode },
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({
				'..core': '../core/__init__.py',
			});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			// Python relative specifiers use dots without slashes (..core, not ../core),
			// so classifyImportType returns 'alias' ��� acceptable for Phase 1
			expect(result['3']).toEqual({
				source: '..core',
				resolvedPath: expect.any(String),
				isExternal: false,
				importType: 'alias',
			});
		});

		it('should handle bare relative import (from . import utils)', async () => {
			// Bare relative: no module_name field, has relative_import child with "."
			const dotChild = mockNode('relative_import', '.', { row: 4 });
			const fromImportNode = mockNode(
				'import_from_statement',
				'from . import utils',
				{
					row: 4,
					children: [
						mockNode('from', 'from', { row: 4 }),
						dotChild,
						mockNode('import', 'import', { row: 4 }),
						mockNode('dotted_name', 'utils', { row: 4 }),
					],
					fields: {},
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({
				'.': './__init__.py',
			});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			// Python's "." specifier doesn't start with "./" so classifyImportType
			// returns 'alias' — acceptable for Phase 1
			expect(result['4']).toEqual({
				source: '.',
				resolvedPath: '__init__.py',
				isExternal: false,
				importType: 'alias',
			});
		});

		it('should handle dotted absolute from-import (from os.path import join)', async () => {
			const moduleNode = mockNode('dotted_name', 'os.path', { row: 1 });
			const fromImportNode = mockNode(
				'import_from_statement',
				'from os.path import join',
				{
					row: 1,
					fields: { module_name: moduleNode },
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['1']).toEqual({
				source: 'os.path',
				resolvedPath: undefined,
				isExternal: true,
				importType: 'external',
			});
		});

		it('should handle internal from-import', async () => {
			const moduleNode = mockNode('dotted_name', 'mypackage.models', {
				row: 2,
			});
			const fromImportNode = mockNode(
				'import_from_statement',
				'from mypackage.models import User',
				{
					row: 2,
					fields: { module_name: moduleNode },
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({
				'mypackage.models': 'src/mypackage/models.py',
			});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['2']).toEqual({
				source: 'mypackage.models',
				resolvedPath: 'src/mypackage/models.py',
				isExternal: false,
				importType: 'alias',
			});
		});

		it('should default to "." when no module_name and no dot children found', async () => {
			// Edge case: malformed from-import with no module info at all
			const fromImportNode = mockNode(
				'import_from_statement',
				'from import utils',
				{
					row: 0,
					children: [
						mockNode('from', 'from', { row: 0 }),
						mockNode('import', 'import', { row: 0 }),
						mockNode('dotted_name', 'utils', { row: 0 }),
					],
					fields: {},
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({
				'.': './__init__.py',
			});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			expect(result['0']).toBeDefined();
			expect(result['0'].source).toBe('.');
		});
	});

	describe('language routing', () => {
		it('should NOT route Python import_from_statement for JS/TS files', async () => {
			const moduleNode = mockNode('dotted_name', 'pathlib', { row: 0 });
			const fromImportNode = mockNode(
				'import_from_statement',
				'from pathlib import Path',
				{
					row: 0,
					fields: { module_name: moduleNode },
				},
			);
			const tree = mockTree([fromImportNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.ts',
				'typescript',
				resolver,
			);

			// import_from_statement is not a JS/TS node type, so nothing should match
			expect(result).toEqual({});
		});

		it('should NOT use JS source field for Python import_statement', async () => {
			// Python import_statement has name field, not source field
			const nameNode = mockNode('dotted_name', 'os', { row: 0 });
			const sourceNode = mockNode('string', "'os'", { row: 0 });
			const importNode = mockNode('import_statement', 'import os', {
				row: 0,
				fields: { name: nameNode, source: sourceNode },
			});
			const tree = mockTree([importNode]);
			const resolver = mockResolver({});

			const result = await extractor.extractImportResolutions(
				tree,
				'test.py',
				'python',
				resolver,
			);

			// Should use name field (Python handler), not source field (JS handler)
			expect(result['0'].source).toBe('os');
		});
	});
});
