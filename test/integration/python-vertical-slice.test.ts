import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Parser from 'tree-sitter';

import { LanguageRegistry } from '../../src/languages/language.registry';
import { ConstellationConfig } from '../../src/config/config';
import { serializeAST, SerializedNode } from '../../src/utils/ast-serializer';
import { ImportExtractor } from '../../src/utils/import-extractor';
import {
	createTempDir,
	createTestFile,
	cleanupTempDir,
} from '../helpers/test-utils';

/**
 * Representative Python source covering imports, classes, functions,
 * decorators, type hints, and various control-flow constructs.
 */
const SAMPLE_PYTHON = `
import os
import os.path as osp
from pathlib import Path
from typing import List, Optional, Dict
from collections.abc import Iterator
from ..core import BaseEngine

# Module-level constant
MAX_RETRIES: int = 3
SECRET_VALUE = "do-not-leak-this-string"

def helper_function(x: int, y: int = 10) -> int:
    """A helper that adds two numbers."""
    result = x + y
    return result

class DataProcessor(BaseEngine):
    """Processes data from various sources."""

    class_var: str = "default"

    def __init__(self, name: str, retries: Optional[int] = None) -> None:
        super().__init__()
        self.name = name
        self.retries = retries or MAX_RETRIES
        self._internal_state: Dict[str, int] = {}

    def process(self, items: List[str]) -> Iterator[str]:
        for item in items:
            if not item:
                continue
            yield item.upper()

    @staticmethod
    def validate(value: str) -> bool:
        return len(value) > 0

    @classmethod
    def from_config(cls, config: Dict[str, str]) -> "DataProcessor":
        return cls(name=config["name"])

class ChildProcessor(DataProcessor):
    pass

async def fetch_data(url: str) -> Optional[Dict[str, str]]:
    try:
        data = {"key": "value"}
        return data
    except Exception as e:
        raise RuntimeError("fetch failed") from e
    finally:
        pass

if __name__ == "__main__":
    proc = DataProcessor("test")
    for item in proc.process(["a", "b", "c"]):
        print(item)
`.trimStart();

// Tree-sitter native addons may not be available in all CI environments.
// Skip the entire suite gracefully if the Python grammar cannot parse.
let canLoadGrammar = false;
try {
	const testParser = new Parser();
	const langRegistry = new LanguageRegistry({
		languages: {},
	} as unknown as ConstellationConfig);
	const pythonEntry = langRegistry['python'];
	if (pythonEntry) {
		testParser.setLanguage(pythonEntry.language() as any);
		const testTree = testParser.parse('x = 1');
		canLoadGrammar = testTree?.rootNode?.type === 'module';
	}
} catch {
	canLoadGrammar = false;
}

const describeIfGrammar = canLoadGrammar ? describe : describe.skip;

describeIfGrammar('Python Vertical Slice Integration', () => {
	let tempDir: string;
	let pyFilePath: string;
	let registry: LanguageRegistry;
	let tree: Parser.Tree;

	beforeAll(async () => {
		tempDir = await createTempDir('python-slice-');
		pyFilePath = await createTestFile(tempDir, 'sample.py', SAMPLE_PYTHON);

		// Build a minimal config so LanguageRegistry can construct
		const config = {
			languages: {},
		} as unknown as ConstellationConfig;
		registry = new LanguageRegistry(config);

		// Parse the file using the real Tree-sitter Python grammar
		const langEntry = registry['python'];
		expect(langEntry).toBeDefined();

		const parser = new Parser();
		parser.setLanguage(langEntry!.language() as any);
		tree = parser.parse(SAMPLE_PYTHON);
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	// ─── 1. Grammar loading & parsing ────────────────────────────────────

	it('should load the Python grammar and produce a module root node', () => {
		expect(tree).toBeDefined();
		expect(tree.rootNode.type).toBe('module');
		expect(tree.rootNode.childCount).toBeGreaterThan(0);
	});

	it('should parse without errors (no ERROR nodes)', () => {
		const errors: string[] = [];
		function walk(node: Parser.SyntaxNode): void {
			if (node.type === 'ERROR') {
				errors.push(
					`ERROR at ${node.startPosition.row}:${node.startPosition.column} — "${node.text.slice(0, 40)}"`,
				);
			}
			for (let i = 0; i < node.childCount; i++) {
				const child = node.child(i);
				if (child) walk(child);
			}
		}
		walk(tree.rootNode);
		expect(errors).toEqual([]);
	});

	// ─── 2. AST serialization ────────────────────────────────────────────

	describe('AST Serialization', () => {
		let serialized: SerializedNode;

		beforeAll(async () => {
			serialized = await serializeAST(tree.rootNode);
		});

		it('should produce a serialized tree rooted at module', () => {
			expect(serialized.type).toBe('module');
			expect(serialized.children).toBeDefined();
			expect(serialized.children!.length).toBeGreaterThan(0);
		});

		it('should contain expected identifier texts', () => {
			const texts = collectTexts(serialized);

			// Class and function names
			expect(texts).toContain('DataProcessor');
			expect(texts).toContain('ChildProcessor');
			expect(texts).toContain('helper_function');
			expect(texts).toContain('process');
			expect(texts).toContain('validate');
			expect(texts).toContain('from_config');
			expect(texts).toContain('fetch_data');

			// Variable / parameter names
			expect(texts).toContain('MAX_RETRIES');
			expect(texts).toContain('name');
			expect(texts).toContain('retries');

			// Type annotation identifiers
			expect(texts).toContain('int');
			expect(texts).toContain('str');
			expect(texts).toContain('Optional');
			expect(texts).toContain('List');
			expect(texts).toContain('Dict');
			expect(texts).toContain('Iterator');
		});

		it('should NOT include source code in block-level nodes', () => {
			// Block nodes (function bodies, class bodies) should never carry text.
			// The privacy guarantee is that *structural* nodes like `block` do not
			// include their raw source — individual leaf tokens (identifiers, small
			// literals in textIncludedTypes) intentionally retain text for intel.
			const blockNodes = findNodes(serialized, 'block');
			for (const block of blockNodes) {
				expect(block.text).toBeUndefined();
			}

			// expression_statement nodes should not carry text either
			const exprStmts = findNodes(serialized, 'expression_statement');
			for (const stmt of exprStmts) {
				expect(stmt.text).toBeUndefined();
			}

			// comment nodes should not carry text (comments are excluded from textIncludedTypes)
			const comments = findNodes(serialized, 'comment');
			for (const comment of comments) {
				expect(comment.text).toBeUndefined();
			}

			// Multi-line compound statements should not appear verbatim.
			// Individual identifiers (e.g. "item", "upper") will be present as
			// leaf node text, but the full source expression should not appear
			// as any single node's text value.
			const allNodeTexts = collectTexts(serialized);
			expect(allNodeTexts).not.toContain('result = x + y');
			expect(allNodeTexts).not.toContain('item.upper()');
			expect(allNodeTexts).not.toContain('self._internal_state = {}');
		});

		it('should preserve Python-specific field names on nodes', () => {
			// function_definition nodes should have "name", "parameters", "body" fields
			const funcDefs = findNodes(serialized, 'function_definition');
			expect(funcDefs.length).toBeGreaterThan(0);

			const helperDef = funcDefs.find((n) =>
				n.children?.some(
					(c) => c.fieldName === 'name' && c.text === 'helper_function',
				),
			);
			expect(helperDef).toBeDefined();

			const helperFields = helperDef!
				.children!.map((c) => c.fieldName)
				.filter(Boolean);
			expect(helperFields).toContain('name');
			expect(helperFields).toContain('parameters');
			expect(helperFields).toContain('body');
			expect(helperFields).toContain('return_type');

			// class_definition nodes should have "name", "superclasses", "body" fields
			const classDefs = findNodes(serialized, 'class_definition');
			expect(classDefs.length).toBeGreaterThan(0);

			const dpClass = classDefs.find((n) =>
				n.children?.some(
					(c) => c.fieldName === 'name' && c.text === 'DataProcessor',
				),
			);
			expect(dpClass).toBeDefined();

			const classFields = dpClass!
				.children!.map((c) => c.fieldName)
				.filter(Boolean);
			expect(classFields).toContain('name');
			expect(classFields).toContain('superclasses');
			expect(classFields).toContain('body');
		});

		it('should NOT leak string content in serialized AST (privacy guarantee)', () => {
			const texts = collectTexts(serialized);

			// Secret values must NOT appear in the serialized AST
			expect(texts).not.toContain('do-not-leak-this-string');

			// Docstring content must NOT leak
			expect(texts).not.toContain('A helper that adds two numbers.');
			expect(texts).not.toContain('Processes data from various sources.');

			// Other string literal values must NOT leak
			// Note: 'value' and 'key' are also identifiers in the code, so we check
			// for unambiguous string-only content instead
			expect(texts).not.toContain('fetch failed');
			expect(texts).not.toContain('default');

			// Compound `string` nodes (Python) should NOT have text set
			const stringNodes = findNodes(serialized, 'string');
			for (const strNode of stringNodes) {
				if (strNode.children && strNode.children.length > 0) {
					expect(strNode.text).toBeUndefined();
				}
			}

			// `string_content` nodes should NOT have text set
			const stringContentNodes = findNodes(serialized, 'string_content');
			for (const scNode of stringContentNodes) {
				expect(scNode.text).toBeUndefined();
			}
		});

		it('should include text for Python-specific textIncludedTypes', () => {
			const texts = collectTexts(serialized);
			const nodeTypes = collectNodeTypes(serialized);

			// dotted_name nodes should have text (used in imports)
			expect(nodeTypes).toContain('dotted_name');

			// Python boolean literals should have text
			// True/False/None are identifiers in tree-sitter-python, but
			// we verify they appear as identifiers with correct text if present
			expect(texts).toContain('BaseEngine');
			expect(texts).toContain('Path');
		});
	});

	// ��── 3. Import extraction ────────────────────────────────────────────

	describe('Import Extraction', () => {
		it('should extract imports from a Python file using a mock resolver', async () => {
			const extractor = new ImportExtractor();

			// Mock resolver that echoes back the specifier (simulates unresolved)
			const mockResolver = {
				resolve: async (specifier: string) => specifier,
			};

			const resolutions = await extractor.extractImportResolutions(
				tree,
				pyFilePath,
				'python',
				mockResolver,
			);

			// The sample has imports on lines 0-5 (0-indexed)
			const sources = Object.values(resolutions).map((r) => r.source);

			expect(sources).toContain('os');
			expect(sources).toContain('os.path');
			expect(sources).toContain('pathlib');
			expect(sources).toContain('typing');
			expect(sources).toContain('collections.abc');

			// Relative import: from ..core import BaseEngine
			expect(sources).toContain('..core');
		});

		it('should return empty resolutions when no resolver is provided', async () => {
			const extractor = new ImportExtractor();
			const resolutions = await extractor.extractImportResolutions(
				tree,
				pyFilePath,
				'python',
				undefined,
			);
			expect(resolutions).toEqual({});
		});
	});
});

// ─── Test Helpers ────────────────────────────────────────────────────────

/**
 * Recursively collects all `text` values from the serialized tree.
 */
function collectTexts(node: SerializedNode): string[] {
	const texts: string[] = [];
	if (node.text !== undefined) {
		texts.push(node.text);
	}
	if (node.children) {
		for (const child of node.children) {
			texts.push(...collectTexts(child));
		}
	}
	return texts;
}

/**
 * Recursively collects all node types present in the serialized tree.
 */
function collectNodeTypes(node: SerializedNode): string[] {
	const types: string[] = [node.type];
	if (node.children) {
		for (const child of node.children) {
			types.push(...collectNodeTypes(child));
		}
	}
	return types;
}

/**
 * Finds all nodes of a given type in the serialized tree.
 */
function findNodes(node: SerializedNode, type: string): SerializedNode[] {
	const results: SerializedNode[] = [];
	if (node.type === type) {
		results.push(node);
	}
	if (node.children) {
		for (const child of node.children) {
			results.push(...findNodes(child, type));
		}
	}
	return results;
}
