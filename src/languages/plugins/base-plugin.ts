import { ParserLanguage } from '../language.registry';

/**
 * Generic interface for language-specific build configuration managers.
 * Examples: tsconfig.json, jsconfig.json, go.mod, requirements.txt, etc.
 */
export interface BuildConfigManager {
	/**
	 * Initializes the build config manager by discovering all relevant config files.
	 * @returns Array of absolute paths to discovered config files
	 */
	initialize(): Promise<string[]>;

	/**
	 * Gets the applicable build configuration for a given source file.
	 * @param filePath Absolute path to the source file
	 * @returns Parsed configuration object or null if not applicable
	 */
	getConfigForFile(filePath: string): Promise<any | null>;

	/**
	 * Checks if this build config manager is enabled based on project configuration.
	 * @returns True if the manager should be active
	 */
	isEnabled(): boolean;

	/**
	 * Clears any internal caches.
	 */
	clearCache(): void;
}

/**
 * Generic interface for language-specific import path resolvers.
 * Resolves import specifiers to project-relative paths.
 */
export interface ImportResolver {
	/**
	 * Resolves an import specifier to a project-relative file path.
	 * @param specifier Import specifier from source code (e.g., './helper', '@utils/foo')
	 * @returns Resolved project-relative path or original specifier if resolution fails
	 */
	resolve(specifier: string): Promise<string>;
}

/**
 * Language plugin interface defining the contract for language-specific functionality.
 * Each language can provide optional build configuration management and import resolution.
 */
export interface LanguagePlugin {
	/** The programming language this plugin supports */
	readonly language: ParserLanguage;

	/** File extensions handled by this plugin */
	readonly extensions: string[];

	/**
	 * Gets a build configuration manager for this language.
	 * Returns null if the language doesn't have build configuration files.
	 * @param projectRoot Absolute path to project root directory
	 * @param languageConfig Language configuration from constellation.json
	 * @returns Build config manager instance or null
	 */
	getBuildConfigManager?(
		projectRoot: string,
		languageConfig: any,
	): BuildConfigManager | null;

	/**
	 * Gets an import path resolver for a specific source file.
	 * Returns null if the language doesn't support import resolution.
	 * @param sourceFilePath Absolute path to the source file
	 * @param buildConfig Optional build configuration (from getBuildConfigManager)
	 * @returns Import resolver instance or null
	 */
	getImportResolver?(
		sourceFilePath: string,
		buildConfig?: any,
	): ImportResolver | null;
}

/**
 * Abstract base class for language plugins.
 * Provides default implementations for optional plugin methods.
 */
export abstract class BaseLanguagePlugin implements LanguagePlugin {
	abstract readonly language: ParserLanguage;
	abstract readonly extensions: string[];

	/**
	 * Default implementation returns null (no build config support).
	 * Override in subclass to provide build configuration management.
	 */
	getBuildConfigManager?(
		projectRoot: string,
		languageConfig: any,
	): BuildConfigManager | null {
		return null;
	}

	/**
	 * Default implementation returns null (no import resolution support).
	 * Override in subclass to provide import path resolution.
	 */
	getImportResolver?(
		sourceFilePath: string,
		buildConfig?: any,
	): ImportResolver | null {
		return null;
	}
}
