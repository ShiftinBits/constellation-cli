import { find, findAll, parse, TSConfckParseResult } from 'tsconfck';
import { IConstellationLanguageConfig } from '../../../config/config';
import { YELLOW_WARN } from '../../../utils/unicode-chars';
import { BuildConfigManager } from '../base-plugin';

/**
 * Manages TypeScript/JavaScript configuration discovery and caching for path alias resolution.
 * Supports both tsconfig.json (TypeScript) and jsconfig.json (JavaScript).
 * Activates if TypeScript or JavaScript is configured in the project's languages.
 */
export class TsJsConfigManager implements BuildConfigManager {
	/** All discovered tsconfig.json and jsconfig.json paths in the project */
	private configPaths: string[] = [];

	/** Cache of parsed config results by file path */
	private parseCache: Map<string, TSConfckParseResult | null> = new Map();

	/** Config files that failed to parse (e.g., unresolvable extends) — avoids repeated attempts and noisy logs */
	private failedConfigFiles: Set<string> = new Set();

	/** Whether config discovery has been performed */
	private initialized = false;

	/** Whether TypeScript is enabled in the project configuration */
	private readonly isTypeScriptEnabled: boolean;

	/** Whether JavaScript is enabled in the project configuration */
	private readonly isJavaScriptEnabled: boolean;

	/** Whether path resolution is enabled (TS or JS configured) */
	private readonly isPathResolutionEnabled: boolean;

	/** Project root directory for config discovery */
	private readonly projectRoot: string;

	/**
	 * Creates a new PathConfigManager instance.
	 * @param projectRoot Root directory of the project
	 * @param languages Language configuration from constellation.json
	 */
	constructor(projectRoot: string, languages: IConstellationLanguageConfig) {
		this.projectRoot = projectRoot;
		this.isTypeScriptEnabled = 'typescript' in languages;
		this.isJavaScriptEnabled = 'javascript' in languages;
		this.isPathResolutionEnabled =
			this.isTypeScriptEnabled || this.isJavaScriptEnabled;
	}

	/**
	 * Discovers all tsconfig.json and jsconfig.json files in the project.
	 * Only runs if TypeScript or JavaScript is enabled in the configuration.
	 * Results are cached for the lifetime of this manager instance.
	 * @returns Array of absolute paths to all config files found
	 */
	async initialize(): Promise<string[]> {
		if (this.initialized) {
			return this.configPaths;
		}

		this.initialized = true;

		if (!this.isPathResolutionEnabled) {
			return [];
		}

		try {
			const configFiles: string[] = [];

			// Find all tsconfig.json files if TypeScript is enabled
			if (this.isTypeScriptEnabled) {
				const tsconfigFiles = await findAll(this.projectRoot, {
					skip: (dir: string) => dir === 'node_modules' || dir === '.git',
					configNames: ['tsconfig.json'],
				});
				configFiles.push(...tsconfigFiles);
			}

			// Find all jsconfig.json files if JavaScript is enabled
			if (this.isJavaScriptEnabled) {
				const jsconfigFiles = await findAll(this.projectRoot, {
					skip: (dir: string) => dir === 'node_modules' || dir === '.git',
					configNames: ['jsconfig.json'],
				});
				configFiles.push(...jsconfigFiles);
			}

			this.configPaths = configFiles;
			return this.configPaths;
		} catch (error) {
			console.warn(`${YELLOW_WARN} Failed to discover config files:`, error);
			return [];
		}
	}

	/**
	 * Gets the applicable config (tsconfig or jsconfig) for a given file path.
	 * Automatically finds and parses the correct config based on file location and type.
	 * For TypeScript files (.ts, .tsx), looks for tsconfig.json.
	 * For JavaScript files (.js, .jsx), looks for jsconfig.json, falls back to tsconfig.json.
	 * @param filePath Absolute path to the source file
	 * @returns Parsed config result or null if not found/path resolution not enabled
	 */
	async getConfigForFile(
		filePath: string,
	): Promise<TSConfckParseResult | null> {
		// Return cached result if available
		if (this.parseCache.has(filePath)) {
			return this.parseCache.get(filePath)!;
		}

		// If path resolution not enabled, return null
		if (!this.isPathResolutionEnabled) {
			this.parseCache.set(filePath, null);
			return null;
		}

		try {
			// Determine which config to look for based on file extension
			const isTypeScriptFile =
				filePath.endsWith('.ts') ||
				filePath.endsWith('.tsx') ||
				filePath.endsWith('.d.ts');
			const isJavaScriptFile =
				filePath.endsWith('.js') ||
				filePath.endsWith('.jsx') ||
				filePath.endsWith('.mjs');

			// For TypeScript files, use tsconfig.json
			if (isTypeScriptFile && this.isTypeScriptEnabled) {
				const result = await this.findAndParse(filePath, 'tsconfig.json');
				this.parseCache.set(filePath, result);
				return result;
			}

			// For JavaScript files, prefer jsconfig.json but fall back to tsconfig.json
			if (isJavaScriptFile) {
				// Try jsconfig.json first if JavaScript is enabled
				if (this.isJavaScriptEnabled) {
					try {
						const result = await this.findAndParse(filePath, 'jsconfig.json');
						this.parseCache.set(filePath, result);
						return result;
					} catch (jsconfigError) {
						// jsconfig.json not found, try tsconfig.json as fallback
						if (this.isTypeScriptEnabled) {
							const result = await this.findAndParse(filePath, 'tsconfig.json');
							this.parseCache.set(filePath, result);
							return result;
						}
						// Neither found
						throw jsconfigError;
					}
				}

				// JavaScript enabled but no jsconfig, try tsconfig as fallback
				if (this.isTypeScriptEnabled) {
					const result = await this.findAndParse(filePath, 'tsconfig.json');
					this.parseCache.set(filePath, result);
					return result;
				}
			}

			// File type not recognized or no applicable config
			this.parseCache.set(filePath, null);
			return null;
		} catch (error) {
			this.handleConfigError(filePath, error);
			this.parseCache.set(filePath, null);
			return null;
		}
	}

	/**
	 * Checks if path resolution is enabled in the project configuration.
	 * @returns True if TypeScript or JavaScript language is configured
	 */
	isEnabled(): boolean {
		return this.isPathResolutionEnabled;
	}

	/**
	 * Gets all discovered config paths (tsconfig.json and jsconfig.json).
	 * Returns empty array if not yet initialized or path resolution not enabled.
	 * @returns Array of absolute paths to config files
	 */
	getConfigPaths(): string[] {
		return [...this.configPaths];
	}

	/**
	 * Gets all discovered tsconfig paths.
	 * @deprecated Use getConfigPaths() instead
	 * @returns Array of absolute paths to config files
	 */
	getTsconfigPaths(): string[] {
		return this.getConfigPaths();
	}

	/**
	 * Clears the parse cache.
	 * Useful if tsconfig files are modified during runtime.
	 */
	clearCache(): void {
		this.parseCache.clear();
		this.failedConfigFiles.clear();
	}

	/**
	 * Finds the applicable config file for a source file and parses it,
	 * skipping parse if the config is already known to be broken.
	 * @param filePath Absolute path to the source file
	 * @param configName Config file name to search for (tsconfig.json or jsconfig.json)
	 * @returns Parsed config result or null if config is known-broken
	 */
	private async findAndParse(
		filePath: string,
		configName: string,
	): Promise<TSConfckParseResult | null> {
		// Use find() to cheaply locate the applicable config file
		const configPath = await find(filePath, {
			root: this.projectRoot,
			configName,
		});

		// If no config found, return null
		if (!configPath) {
			return null;
		}

		// Skip parse if this config already failed (e.g., unresolvable extends)
		if (this.failedConfigFiles.has(configPath)) {
			return null;
		}

		return parse(filePath, {
			root: this.projectRoot,
			configName,
		});
	}

	/**
	 * Handles config parse errors with concise logging.
	 * Logs a one-line warning per unique config file instead of full stack traces per source file.
	 * @param filePath Source file that triggered the error
	 * @param error The error from tsconfck parse
	 */
	private handleConfigError(filePath: string, error: unknown): void {
		// Extract the tsconfig file path from TSConfckParseError if available
		const tsconfigFile =
			error && typeof error === 'object' && 'tsconfigFile' in error
				? (error as { tsconfigFile: string }).tsconfigFile
				: null;

		if (tsconfigFile && !this.failedConfigFiles.has(tsconfigFile)) {
			// First failure for this config — log a concise warning
			this.failedConfigFiles.add(tsconfigFile);
			const reason = error instanceof Error ? error.message : String(error);
			console.warn(`${YELLOW_WARN} Failed to parse ${tsconfigFile}: ${reason}`);
			console.warn(
				`${YELLOW_WARN} Path alias resolution will be skipped for files using this config`,
			);
		} else if (!tsconfigFile) {
			// Unknown error type — log with file path for debugging
			console.warn(
				`${YELLOW_WARN} Failed to parse config for ${filePath}:`,
				error instanceof Error ? error.message : error,
			);
		}
		// Subsequent failures for the same config file are silently skipped
	}
}
