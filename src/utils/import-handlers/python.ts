import type { SyntaxNode } from 'tree-sitter';
import type { ImportResolutionMetadata } from '@constellationdev/types';
import type { ImportResolver } from '../../languages/plugins/base-plugin';
import type { LanguageImportHandlers, ImportTypeClassifier } from './types';
import { resolveAndStore } from './utils';

/**
 * Processes a Python `import` statement (e.g., `import os`, `import os.path as osp`).
 *
 * AST structure:
 *   import_statement → [name] dotted_name | aliased_import
 */
async function processImportStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	const nameNode = node.childForFieldName('name');
	if (!nameNode) return;

	// For aliased imports (`import os.path as osp`), the name field is an aliased_import
	// whose own name sub-field is the dotted_name we want
	let importSpecifier: string;
	if (nameNode.type === 'aliased_import') {
		const innerName = nameNode.childForFieldName('name');
		importSpecifier = innerName ? innerName.text : nameNode.text;
	} else {
		importSpecifier = nameNode.text;
	}

	await resolveAndStore(
		importSpecifier,
		node.startPosition.row,
		resolver,
		resolutions,
		classifier,
	);
}

/**
 * Processes a Python `from ... import ...` statement
 * (e.g., `from pathlib import Path`, `from . import utils`, `from ..core import Base`).
 *
 * AST structure:
 *   import_from_statement → [module_name] (dotted_name | relative_import) + [name] ...
 */
async function processImportFromStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
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

	await resolveAndStore(
		importSpecifier,
		node.startPosition.row,
		resolver,
		resolutions,
		classifier,
	);
}

export function createPythonHandlers(): LanguageImportHandlers {
	return {
		language: 'python',
		handlers: new Map([
			['import_statement', processImportStatement],
			['import_from_statement', processImportFromStatement],
		]),
	};
}
