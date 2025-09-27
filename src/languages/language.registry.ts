import jsTreeSitter from "tree-sitter-javascript";
import tsTreeSitter from "tree-sitter-typescript";

import { ConstellationConfig } from "../config/config.js";

/**
 * Supported programming languages for Tree-sitter parsing.
 * These correspond to available Tree-sitter grammars.
 */
export type ParserLanguage =
	'bash'
	| 'c'
	| 'c-sharp'
	| 'cpp'
	| 'go'
	| 'java'
	| 'javascript'
	| 'json'
	| 'php'
	| 'python'
	| 'ruby'
	| 'typescript';


/**
 * Default file extensions for each supported programming language.
 * Used as fallback when extensions are not specified in configuration.
 */
export const LANGUAGE_EXTENSIONS: { [key: string]: string[] } = {
	bash: ['.sh', '.bash'],
	c: ['.c', '.h'],
	'c-sharp': ['.cs'],
	cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
	go: ['.go'],
	java: ['.java'],
	javascript: ['.js', '.jsx'],
	json: ['.json'],
	php: ['.php'],
	python: ['.py'],
	ruby: ['.rb'],
	typescript: ['.ts', '.tsx'],
};

/**
 * Interface defining language registry structure.
 * Maps language identifiers to their Tree-sitter parsers and file extensions.
 */
export type ILangaugeRegistry = {
	[key in ParserLanguage]: {
		/** Function returning the Tree-sitter language parser */
		language: () => unknown;
		/** Function returning supported file extensions for this language */
		fileExtensions: () => string[]
	} | undefined;
};

/**
 * Registry managing Tree-sitter parsers and file extensions for supported languages.
 * Provides access to language parsers with configuration-based extension overrides.
 */
export class LanguageRegistry implements ILangaugeRegistry {

	/**
	 * Creates a new LanguageRegistry instance.
	 * @param config Constellation configuration containing language-specific settings
	 */
	constructor(private readonly config: ConstellationConfig) {}

	/** JavaScript language parser configuration */
	['javascript'] = {
		language: () => {
			return jsTreeSitter;
		},
		fileExtensions: () => this.config?.languages['javascript']?.fileExtensions ?? LANGUAGE_EXTENSIONS['javascript']
	};

	/** TypeScript language parser configuration */
	['typescript'] = {
		language: () => {
			return tsTreeSitter.typescript;
		},
		fileExtensions: () => this.config?.languages['typescript']?.fileExtensions ?? LANGUAGE_EXTENSIONS['typescript']
	};

	/** Python language parser (not yet implemented) */
	['python']: undefined;
	/** PHP language parser (not yet implemented) */
	['php']: undefined;
	/** JSON language parser (not yet implemented) */
	['json']: undefined;
	/** Java language parser (not yet implemented) */
	['java']: undefined;
	/** Go language parser (not yet implemented) */
	['go']: undefined;
	/** C++ language parser (not yet implemented) */
	['cpp']: undefined;
	/** C# language parser (not yet implemented) */
	['c-sharp']: undefined;
	/** C language parser (not yet implemented) */
	['c']: undefined;
	/** Bash language parser (not yet implemented) */
	['bash']: undefined;
	/** Ruby language parser (not yet implemented) */
	['ruby']: undefined;
};
