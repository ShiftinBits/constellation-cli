import { describe, it, expect, beforeEach } from '@jest/globals';
import { serializeAST } from '../../../src/utils/ast-serializer';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

/**
 * Integration test to verify that import path resolution works correctly
 * during AST serialization with the updated toProjectRelative() implementation.
 */
describe('AST Serializer - Import Path Resolution Integration', () => {
	let parser: Parser;

	beforeEach(() => {
		parser = new Parser();
		parser.setLanguage(TypeScript.typescript);
	});

	it('should resolve path alias imports to project-root relative paths with ./ prefix', async () => {
		const sourceCode = `import { helper } from '@utils/helper';`;
		const tree = parser.parse(sourceCode);

		// Mock import resolver that simulates TsJsImportResolver behavior
		const mockResolver = async (specifier: string): Promise<string> => {
			// Simulate the path alias resolution: @utils/helper -> ./src/utils/helper.ts
			if (specifier === '@utils/helper') {
				return './src/utils/helper.ts';
			}
			return specifier;
		};

		const serialized = await serializeAST(tree.rootNode, undefined, mockResolver);

		// Find the import statement
		const importStatement = serialized.children?.find(child => child.type === 'import_statement');
		expect(importStatement).toBeDefined();

		// Find the source string (the import path)
		const findSource = (node: any): any => {
			if (node.fieldName === 'source') {
				return node;
			}
			if (node.children) {
				for (const child of node.children) {
					const found = findSource(child);
					if (found) return found;
				}
			}
			return null;
		};

		const sourceNode = findSource(importStatement);
		expect(sourceNode).toBeDefined();
		expect(sourceNode.text).toBe("'./src/utils/helper.ts'");
	});

	it('should resolve relative imports to project-root relative paths with ./ prefix', async () => {
		const sourceCode = `import { helper } from '../utils/helper';`;
		const tree = parser.parse(sourceCode);

		// Mock resolver that simulates resolving ../utils/helper from /project/src/components/Button.tsx
		const mockResolver = async (specifier: string): Promise<string> => {
			if (specifier === '../utils/helper') {
				return './src/utils/helper.ts';
			}
			return specifier;
		};

		const serialized = await serializeAST(tree.rootNode, undefined, mockResolver);

		const findSource = (node: any): any => {
			if (node.fieldName === 'source') return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findSource(child);
					if (found) return found;
				}
			}
			return null;
		};

		const importStatement = serialized.children?.find(child => child.type === 'import_statement');
		const sourceNode = findSource(importStatement);

		expect(sourceNode?.text).toBe("'./src/utils/helper.ts'");
	});

	it('should resolve package.json imports (# prefix) to project-root relative paths with ./ prefix', async () => {
		const sourceCode = `import { logger } from '#internal/logger';`;
		const tree = parser.parse(sourceCode);

		const mockResolver = async (specifier: string): Promise<string> => {
			if (specifier === '#internal/logger') {
				return './lib/internal/logger.js';
			}
			return specifier;
		};

		const serialized = await serializeAST(tree.rootNode, undefined, mockResolver);

		const findSource = (node: any): any => {
			if (node.fieldName === 'source') return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findSource(child);
					if (found) return found;
				}
			}
			return null;
		};

		const importStatement = serialized.children?.find(child => child.type === 'import_statement');
		const sourceNode = findSource(importStatement);

		expect(sourceNode?.text).toBe("'./lib/internal/logger.js'");
	});

	it('should preserve external package imports unchanged', async () => {
		const sourceCode = `import { useState } from 'react';`;
		const tree = parser.parse(sourceCode);

		const mockResolver = async (specifier: string): Promise<string> => {
			// External packages should remain unchanged
			return specifier;
		};

		const serialized = await serializeAST(tree.rootNode, undefined, mockResolver);

		const findSource = (node: any): any => {
			if (node.fieldName === 'source') return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findSource(child);
					if (found) return found;
				}
			}
			return null;
		};

		const importStatement = serialized.children?.find(child => child.type === 'import_statement');
		const sourceNode = findSource(importStatement);

		expect(sourceNode?.text).toBe("'react'");
	});

	it('should handle export statements with path aliases', async () => {
		const sourceCode = `export { helper } from '@utils/helper';`;
		const tree = parser.parse(sourceCode);

		const mockResolver = async (specifier: string): Promise<string> => {
			if (specifier === '@utils/helper') {
				return './src/utils/helper.ts';
			}
			return specifier;
		};

		const serialized = await serializeAST(tree.rootNode, undefined, mockResolver);

		const findSource = (node: any): any => {
			if (node.fieldName === 'source') return node;
			if (node.children) {
				for (const child of node.children) {
					const found = findSource(child);
					if (found) return found;
				}
			}
			return null;
		};

		const exportStatement = serialized.children?.find(child => child.type === 'export_statement');
		const sourceNode = findSource(exportStatement);

		expect(sourceNode?.text).toBe("'./src/utils/helper.ts'");
	});
});
