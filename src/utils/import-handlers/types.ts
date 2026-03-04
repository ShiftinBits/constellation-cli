import type { SyntaxNode } from 'tree-sitter';
import type { ImportResolutionMetadata } from '@constellationdev/types';
import type { ImportResolver } from '../../languages/plugins/base-plugin';

/** Processor function that extracts import metadata from a single AST node. */
export type ImportNodeProcessor = (
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
) => Promise<void>;

/** Classifies an import specifier into a category. */
export type ImportTypeClassifier = (
	specifier: string,
	resolved: string,
	isExternal: boolean,
) => 'relative' | 'workspace' | 'alias' | 'external' | 'builtin';

/** Complete handler registration for a language's import system. */
export interface LanguageImportHandlers {
	language: string;
	handlers: Map<string, ImportNodeProcessor>;
	classifyImportType?: ImportTypeClassifier;
}
