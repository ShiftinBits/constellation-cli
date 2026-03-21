import type { SyntaxNode } from 'tree-sitter';
import type { ImportResolutionMetadata } from '@constellationdev/types';
import type { ImportResolver } from '../../languages/plugins/base-plugin';
import type { LanguageImportHandlers, ImportTypeClassifier } from './types';
import { resolveAndStore } from './utils';

/**
 * Processes a JS/TS import statement (e.g., `import { foo } from './bar'`).
 * Uses the `source` field to find the module path string.
 */
async function processImportStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	const sourceNode = node.childForFieldName('source');
	if (!sourceNode) return;
	const line = sourceNode.startPosition.row;
	const importSpecifier = sourceNode.text.replace(/['"]/g, '');
	await resolveAndStore(
		importSpecifier,
		line,
		resolver,
		resolutions,
		classifier,
	);
}

/**
 * Processes a JS/TS export statement with 'from' clause.
 * Handles barrel exports like: `export * from './foo'`
 */
async function processExportStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	const sourceNode = node.childForFieldName('source');
	if (!sourceNode) return;
	const line = sourceNode.startPosition.row;
	const importSpecifier = sourceNode.text.replace(/['"]/g, '');
	await resolveAndStore(
		importSpecifier,
		line,
		resolver,
		resolutions,
		classifier,
	);
}

export function createJavaScriptHandlers(): LanguageImportHandlers {
	return {
		language: 'javascript',
		handlers: new Map([
			['import_statement', processImportStatement],
			['export_statement', processExportStatement],
		]),
	};
}

export function createTypeScriptHandlers(): LanguageImportHandlers {
	const jsHandlers = createJavaScriptHandlers();
	return { ...jsHandlers, language: 'typescript' };
}
