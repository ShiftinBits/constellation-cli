import type { ImportResolutionMetadata } from '@constellationdev/types';
import { SyntaxNode, Tree } from 'tree-sitter';
import type { ImportResolver } from '../languages/plugins/base-plugin';
import type {
	ImportNodeProcessor,
	ImportTypeClassifier,
	LanguageImportHandlers,
} from './import-handlers/types';
import { DEFAULT_HANDLERS } from './import-handlers';
import { defaultClassifyImportType } from './import-handlers/utils';

/**
 * Extracts import resolution metadata from AST without modifying it.
 * Uses tree-sitter to traverse AST and resolve imports using CLI resolver.
 *
 * The CLI must handle import resolution because only it has access to:
 * - tsconfig.json / jsconfig.json path mappings
 * - package.json workspace configuration
 * - Build configuration for specific files
 *
 * Languages register their import node types and processors via handler modules,
 * making it straightforward to add new language support without modifying
 * this class. Pass custom handlers to the constructor, or omit to use the
 * built-in JS/TS/Python handlers.
 */
export class ImportExtractor {
	/**
	 * Per-language map of node types to their import processors.
	 * Adding a new language = creating a handler module and adding it to DEFAULT_HANDLERS.
	 */
	private readonly languageHandlers: Map<
		string,
		Map<string, ImportNodeProcessor>
	>;

	/** Per-language import type classifiers (falls back to defaultClassifyImportType). */
	private readonly classifiers: Map<string, ImportTypeClassifier>;

	constructor(handlers?: LanguageImportHandlers[]) {
		this.languageHandlers = new Map();
		this.classifiers = new Map();
		for (const reg of handlers ?? DEFAULT_HANDLERS) {
			this.languageHandlers.set(reg.language, reg.handlers);
			if (reg.classifyImportType) {
				this.classifiers.set(reg.language, reg.classifyImportType);
			}
		}
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

		const classifier =
			this.classifiers.get(language) ?? defaultClassifyImportType;
		const resolutions: ImportResolutionMetadata = {};

		await this.walkAST(tree.rootNode, async (node: SyntaxNode) => {
			const processor = handlers.get(node.type);
			if (processor) {
				await processor(node, resolver, resolutions, classifier);
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
}
