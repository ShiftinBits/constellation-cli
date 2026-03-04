import type { ImportResolutionMetadata } from '@constellationdev/types';
import { SyntaxNode, Tree } from 'tree-sitter';
import type { ImportResolver } from '../languages/plugins/base-plugin';
import { normalizeGraphPath } from './path.utils';

/**
 * Processor function that extracts import metadata from a single AST node.
 * Each language registers processors for the node types it uses for imports.
 */
type ImportNodeProcessor = (
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
) => Promise<void>;

/**
 * Extracts import resolution metadata from AST without modifying it.
 * Uses tree-sitter to traverse AST and resolve imports using CLI resolver.
 *
 * The CLI must handle import resolution because only it has access to:
 * - tsconfig.json / jsconfig.json path mappings
 * - package.json workspace configuration
 * - Build configuration for specific files
 *
 * Languages register their import node types and processors via a handler map,
 * making it straightforward to add new language support without modifying
 * the core extraction loop.
 */
export class ImportExtractor {
	/**
	 * Per-language map of node types to their import processors.
	 * Adding a new language = adding an entry here + the processor methods.
	 */
	private readonly languageHandlers: Map<
		string,
		Map<string, ImportNodeProcessor>
	>;

	constructor() {
		this.languageHandlers = new Map();
		this.registerJavaScriptHandlers();
		this.registerTypeScriptHandlers();
		this.registerPythonHandlers();
	}

	/**
	 * Registers import node handlers for JavaScript.
	 */
	private registerJavaScriptHandlers(): void {
		const handlers = new Map<string, ImportNodeProcessor>();
		handlers.set('import_statement', (node, resolver, resolutions) =>
			this.processJsImportStatement(node, resolver, resolutions),
		);
		handlers.set('export_statement', (node, resolver, resolutions) =>
			this.processJsExportStatement(node, resolver, resolutions),
		);
		this.languageHandlers.set('javascript', handlers);
	}

	/**
	 * Registers import node handlers for TypeScript (same as JavaScript).
	 */
	private registerTypeScriptHandlers(): void {
		// TypeScript uses the same import/export syntax as JavaScript
		this.languageHandlers.set(
			'typescript',
			this.languageHandlers.get('javascript')!,
		);
	}

	/**
	 * Registers import node handlers for Python.
	 */
	private registerPythonHandlers(): void {
		const handlers = new Map<string, ImportNodeProcessor>();
		handlers.set('import_statement', (node, resolver, resolutions) =>
			this.processPythonImportStatement(node, resolver, resolutions),
		);
		handlers.set('import_from_statement', (node, resolver, resolutions) =>
			this.processPythonImportFromStatement(node, resolver, resolutions),
		);
		this.languageHandlers.set('python', handlers);
	}

	/**
	 * Walks AST to find all import statements and resolves them using CLI resolver.
	 * Does NOT modify the AST - only extracts metadata.
	 *
	 * @param tree Parsed syntax tree
	 * @param filePath Source file path
	 * @param language Programming language
	 * @param resolver CLI import resolver (has tsconfig/jsconfig access)
	 * @returns Map of line number to import resolution
	 */
	async extractImportResolutions(
		tree: Tree,
		filePath: string,
		language: string,
		resolver?: ImportResolver,
	): Promise<ImportResolutionMetadata> {
		if (!resolver) {
			return {};
		}

		const handlers = this.languageHandlers.get(language);
		if (!handlers) {
			return {};
		}

		const resolutions: ImportResolutionMetadata = {};

		await this.walkAST(tree.rootNode, async (node: SyntaxNode) => {
			const processor = handlers.get(node.type);
			if (processor) {
				await processor(node, resolver, resolutions);
			}
		});

		return resolutions;
	}

	/**
	 * Recursively walks AST and calls visitor function for each node
	 */
	private async walkAST(
		node: SyntaxNode,
		visitor: (node: SyntaxNode) => Promise<void>,
	): Promise<void> {
		await visitor(node);

		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child) {
				await this.walkAST(child, visitor);
			}
		}
	}

	// ─── JS/TS Processors ────────────────────────────────────────────────

	/**
	 * Processes a JS/TS import statement (e.g., `import { foo } from './bar'`).
	 * Uses the `source` field to find the module path string.
	 */
	private async processJsImportStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata,
	): Promise<void> {
		const sourceNode = node.childForFieldName('source');
		if (!sourceNode) {
			return;
		}

		const line = sourceNode.startPosition.row;
		const importSpecifier = sourceNode.text.replace(/['"]/g, '');

		await this.resolveAndStore(importSpecifier, line, resolver, resolutions);
	}

	/**
	 * Processes a JS/TS export statement with 'from' clause.
	 * Handles barrel exports like: `export * from './foo'`
	 */
	private async processJsExportStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata,
	): Promise<void> {
		const sourceNode = node.childForFieldName('source');
		if (!sourceNode) {
			return;
		}

		const line = sourceNode.startPosition.row;
		const importSpecifier = sourceNode.text.replace(/['"]/g, '');

		await this.resolveAndStore(importSpecifier, line, resolver, resolutions);
	}

	// ─── Python Processors ───────────────────────────────────────────────

	/**
	 * Processes a Python `import` statement (e.g., `import os`, `import os.path as osp`).
	 *
	 * AST structure:
	 *   import_statement → [name] dotted_name | aliased_import
	 */
	private async processPythonImportStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata,
	): Promise<void> {
		const nameNode = node.childForFieldName('name');
		if (!nameNode) {
			return;
		}

		// For aliased imports (`import os.path as osp`), the name field is an aliased_import
		// whose own name sub-field is the dotted_name we want
		let importSpecifier: string;
		if (nameNode.type === 'aliased_import') {
			const innerName = nameNode.childForFieldName('name');
			importSpecifier = innerName ? innerName.text : nameNode.text;
		} else {
			importSpecifier = nameNode.text;
		}

		await this.resolveAndStore(
			importSpecifier,
			node.startPosition.row,
			resolver,
			resolutions,
		);
	}

	/**
	 * Processes a Python `from ... import ...` statement
	 * (e.g., `from pathlib import Path`, `from . import utils`, `from ..core import Base`).
	 *
	 * AST structure:
	 *   import_from_statement → [module_name] (dotted_name | relative_import) + [name] ...
	 */
	private async processPythonImportFromStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata,
	): Promise<void> {
		let importSpecifier: string;

		const moduleNameNode = node.childForFieldName('module_name');
		if (moduleNameNode) {
			// Both relative (`..core`) and absolute (`pathlib`) — use text directly
			importSpecifier = moduleNameNode.text;
		} else {
			// Bare relative import: `from . import utils`
			// Look for relative_import or dot tokens between 'from' and 'import'
			let dots = '';
			for (let i = 0; i < node.childCount; i++) {
				const child = node.child(i);
				if (!child) continue;
				if (child.type === 'relative_import') {
					dots = child.text;
					break;
				}
				if (child.type === '.' || child.type === 'import_prefix') {
					dots += child.text;
				}
			}
			importSpecifier = dots || '.';
		}

		await this.resolveAndStore(
			importSpecifier,
			node.startPosition.row,
			resolver,
			resolutions,
		);
	}

	// ─── Shared Utilities ────────────────────────────────────────────────

	/**
	 * Resolves an import specifier and stores the result.
	 * Shared by all language processors to eliminate duplication.
	 */
	private async resolveAndStore(
		importSpecifier: string,
		line: number,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata,
	): Promise<void> {
		const resolvedPath = await resolver.resolve(importSpecifier);
		const isExternal = this.isExternalPackage(importSpecifier, resolvedPath);
		const importType = this.classifyImportType(
			importSpecifier,
			resolvedPath,
			isExternal,
		);

		const normalizedPath = isExternal
			? undefined
			: normalizeGraphPath(resolvedPath);

		resolutions[line.toString()] = {
			source: importSpecifier,
			resolvedPath: normalizedPath,
			isExternal,
			importType,
		};
	}

	/**
	 * Determines if import is an external package.
	 *
	 * CRITICAL: This logic must distinguish between:
	 * - External packages: @nestjs/common, lodash, node:fs (return true)
	 * - Internal workspace packages: @constellation/graph-engine → libs/graph-engine/src/index.ts (return false)
	 * - Relative imports: ./foo, ../bar (return false)
	 * - Canonical project paths: libs/..., apps/..., src/... (return false)
	 */
	private isExternalPackage(specifier: string, resolved: string): boolean {
		// If resolution didn't change, it's external (e.g., @nestjs/common → @nestjs/common)
		if (specifier === resolved) {
			return true;
		}

		// ✅ FIX: Project-relative paths without leading ./ or ../ are canonical paths
		// Examples: "libs/graph-engine/src/index.ts", "apps/intel-api/src/main.ts"
		// These are internal workspace files, NOT external packages
		if (!resolved.startsWith('.') && !resolved.startsWith('/')) {
			// Canonical project-relative path = internal
			return false;
		}

		// Relative paths (./foo, ../bar) are internal
		if (resolved.startsWith('./') || resolved.startsWith('../')) {
			return false;
		}

		// Everything else is external (absolute paths, node: prefixes, etc.)
		return true;
	}

	/**
	 * Classifies import type for analytics and debugging
	 */
	private classifyImportType(
		specifier: string,
		_resolved: string,
		isExternal: boolean,
	): 'relative' | 'workspace' | 'alias' | 'external' | 'builtin' {
		if (isExternal) {
			return specifier.startsWith('node:') ? 'builtin' : 'external';
		}

		if (specifier.startsWith('./') || specifier.startsWith('../')) {
			return 'relative';
		}

		if (specifier.startsWith('@')) {
			return 'workspace';
		}

		return 'alias';
	}
}
