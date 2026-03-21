import type { SyntaxNode } from 'tree-sitter';

/**
 * Language-specific serializer configuration.
 * Controls which node types preserve text and which field names are tracked.
 */
export interface LanguageSerializerConfig {
	/** Language identifier matching ParserLanguage */
	language: string;

	/** Node types whose text should be preserved in serialized AST.
	 * Combined with SHARED_TEXT_TYPES at runtime. */
	textIncludedTypes: ReadonlySet<string>;

	/** Field name mappings for Tree-sitter node types.
	 * Controls which named fields are serialized for Core extraction. */
	fieldNames: Readonly<Record<string, string[]>>;

	/** Optional: Custom text inclusion check.
	 * Called AFTER the standard set check for language-specific logic.
	 * Return false to exclude, true to include, undefined to fall through to standard check. */
	shouldIncludeText?: (node: SyntaxNode) => boolean | undefined;
}
