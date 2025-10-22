import { Tree, SyntaxNode } from 'tree-sitter';
import { ImportResolutionMetadata } from '../types/api';
import type { ImportResolver } from '../types/resolver.types';

/**
 * Extracts import resolution metadata from AST without modifying it.
 * Uses tree-sitter to traverse AST and resolve imports using CLI resolver.
 *
 * The CLI must handle import resolution because only it has access to:
 * - tsconfig.json / jsconfig.json path mappings
 * - package.json workspace configuration
 * - Build configuration for specific files
 */
export class ImportExtractor {
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
		resolver?: ImportResolver
	): Promise<ImportResolutionMetadata> {
		if (!resolver) {
			return {};
		}

		const resolutions: ImportResolutionMetadata = {};

		// Walk the AST to find all import and export statements
		await this.walkAST(tree.rootNode, async (node: SyntaxNode) => {
			// Handle import statements for TypeScript/JavaScript
			if (node.type === 'import_statement') {
				await this.processImportStatement(node, resolver, resolutions);
			}
			// Handle export statements with 'from' clause (barrel exports)
			if (node.type === 'export_statement') {
				await this.processExportStatement(node, resolver, resolutions);
			}
		});

		return resolutions;
	}

	/**
	 * Recursively walks AST and calls visitor function for each node
	 */
	private async walkAST(
		node: SyntaxNode,
		visitor: (node: SyntaxNode) => Promise<void>
	): Promise<void> {
		await visitor(node);

		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child) {
				await this.walkAST(child, visitor);
			}
		}
	}

	/**
	 * Processes a single import statement node
	 */
	private async processImportStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata
	): Promise<void> {
		// Find the source string node (the imported module path)
		const sourceNode = node.childForFieldName('source');
		if (!sourceNode) {
			return;
		}

		const line = sourceNode.startPosition.row;
		const importSpecifier = sourceNode.text.replace(/['"]/g, '');

		// Resolve using CLI resolver (has tsconfig/jsconfig access)
		const resolvedPath = await resolver.resolve(importSpecifier);
		const isExternal = this.isExternalPackage(importSpecifier, resolvedPath);
		const importType = this.classifyImportType(importSpecifier, resolvedPath, isExternal);

		// Normalize resolved path to canonical format (project-root-relative without leading ./)
		const normalizedPath = isExternal ? undefined : this.normalizeToCanonical(resolvedPath);

		resolutions[line.toString()] = {
			source: importSpecifier,
			resolvedPath: normalizedPath,
			isExternal,
			importType
		};
	}

	/**
	 * Processes a single export statement node with 'from' clause
	 * Handles barrel exports like: export * from './foo' or export { bar } from './foo'
	 */
	private async processExportStatement(
		node: SyntaxNode,
		resolver: ImportResolver,
		resolutions: ImportResolutionMetadata
	): Promise<void> {
		// Find the source string node (the module path after 'from')
		const sourceNode = node.childForFieldName('source');
		if (!sourceNode) {
			// This is an export without 'from' clause (e.g., export const foo = 1)
			return;
		}

		const line = sourceNode.startPosition.row;
		const importSpecifier = sourceNode.text.replace(/['"]/g, '');

		// Resolve using CLI resolver (has tsconfig/jsconfig access)
		const resolvedPath = await resolver.resolve(importSpecifier);
		const isExternal = this.isExternalPackage(importSpecifier, resolvedPath);
		const importType = this.classifyImportType(importSpecifier, resolvedPath, isExternal);

		// Normalize resolved path to canonical format (project-root-relative without leading ./)
		const normalizedPath = isExternal ? undefined : this.normalizeToCanonical(resolvedPath);

		resolutions[line.toString()] = {
			source: importSpecifier,
			resolvedPath: normalizedPath,
			isExternal,
			importType
		};
	}

	/**
	 * Normalizes a path to canonical format: project-root-relative without leading ./
	 * Example: "./libs/indexer/src/index.ts" -> "libs/indexer/src/index.ts"
	 */
	private normalizeToCanonical(path: string): string {
		// Remove any leading ./ or /
		return path.replace(/^\.?\//, '');
	}

	/**
	 * Determines if import is an external package.
	 * If resolution didn't change or doesn't start with './', it's external.
	 */
	private isExternalPackage(specifier: string, resolved: string): boolean {
		// If resolution didn't change, it's external
		if (specifier === resolved) {
			return true;
		}

		// If resolved path doesn't start with './', it's external
		if (!resolved.startsWith('./')) {
			return true;
		}

		return false;
	}

	/**
	 * Classifies import type for analytics and debugging
	 */
	private classifyImportType(
		specifier: string,
		resolved: string,
		isExternal: boolean
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
