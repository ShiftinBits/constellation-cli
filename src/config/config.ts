import { ParserLanguage } from "../languages/language.registry";
import { FileUtils } from "../utils/file.utils";
import { RED_X } from "../utils/unicode-chars";

/**
 * Configuration mapping for supported programming languages.
 * Maps language identifiers to their file extension configurations.
 */
export type IConstellationLanguageConfig = {
	[key in ParserLanguage]: {
		/** File extensions associated with this language (e.g., ['.ts', '.tsx']) */
		fileExtensions: string[];
	};
};

/**
 * Interface defining the structure of Constellation project configuration.
 * Loaded from constellation.json file in project root.
 */
export interface IConstellationConfig {
	/** Git branch to track and index */
	readonly branch: string;
	/** Language-specific configuration including file extensions */
	readonly languages: IConstellationLanguageConfig;
	/** Project namespace identifier (typically project name) */
	readonly namespace: string;
	/** Glob patterns to exclude from indexing (optional) */
	readonly exclude?: string[];
}

/**
 * Constellation project configuration with validation and loading capabilities.
 * Manages configuration state and provides validation for project settings.
 */
export class ConstellationConfig implements IConstellationConfig {
	/** API endpoint URL for the Constellation service (from env or default) */
	readonly apiUrl: string;

	/**
	 * Creates a new ConstellationConfig instance.
	 * @param branch Git branch to track and index
	 * @param languages Language-specific configuration including file extensions
	 * @param namespace Project namespace identifier
	 * @param exclude Glob patterns to exclude from indexing (optional)
	 */
	constructor(
		readonly branch: string,
		readonly languages: IConstellationLanguageConfig,
		readonly namespace: string,
		readonly exclude?: string[]
	) {
		this.apiUrl = process.env.CONSTELLATION_API_URL || 'http://localhost:3000';
	}

	/**
	 * Loads and validates configuration from a JSON file.
	 * @param filePath Path to the constellation.json configuration file
	 * @returns Validated ConstellationConfig instance
	 * @throws Error if file cannot be read, parsed, or configuration is invalid
	 */
	static async loadFromFile(filePath: string): Promise<ConstellationConfig> {
		const readable = await FileUtils.fileIsReadable(filePath);
		if (!readable) {
			throw new Error(
				`${RED_X} Unable to find constellation config at ${filePath}`,
			);
		} else {
			const fileContents = await FileUtils.readFile(filePath);
			const parsed = JSON.parse(fileContents) as IConstellationConfig;
			const config = new ConstellationConfig(
				parsed.branch,
				parsed.languages,
				parsed.namespace,
				parsed.exclude
			);
			// Validate the configuration immediately after loading
			config.validate();
			return config;
		}
	}

	/**
	 * Validates that the configuration has all required fields with valid values
	 * @throws Error if any required field is missing or invalid
	 */
	validate(): void {
		if (!this.apiUrl) {
			throw new Error('Invalid configuration: apiUrl is missing');
		}

		if (!this.branch) {
			throw new Error('Invalid configuration: branch is missing');
		}

		if (!this.languages || Object.keys(this.languages).length === 0) {
			throw new Error('Invalid configuration: no languages configured');
		}

		if (!this.namespace) {
			throw new Error('Invalid configuration: namespace is missing');
		}

		// Validate apiUrl is a valid URL
		try {
			new URL(this.apiUrl);
		} catch {
			throw new Error(`Invalid configuration: apiUrl "${this.apiUrl}" is not a valid URL`);
		}

		// Validate language configurations
		for (const [lang, config] of Object.entries(this.languages)) {
			if (!config.fileExtensions || config.fileExtensions.length === 0) {
				throw new Error(`Invalid configuration: language "${lang}" has no file extensions`);
			}
			// Ensure all extensions start with a dot
			for (const ext of config.fileExtensions) {
				if (!ext.startsWith('.')) {
					throw new Error(`Invalid configuration: file extension "${ext}" for language "${lang}" must start with a dot`);
				}
			}
		}

		// Validate exclude patterns if present
		if (this.exclude && this.exclude.length > 0) {
			// Ensure exclude is an array of strings
			if (!Array.isArray(this.exclude)) {
				throw new Error('Invalid configuration: exclude must be an array of strings');
			}
			for (const pattern of this.exclude) {
				if (typeof pattern !== 'string') {
					throw new Error('Invalid configuration: exclude patterns must be strings');
				}
			}
		}
	}

	/**
	 * Checks if the current Git branch matches the configured branch
	 * @param currentBranch The current Git branch name
	 * @throws Error if branches don't match
	 */
	validateBranch(currentBranch: string | null): void {
		if (!currentBranch) {
			throw new Error('Not on a Git branch (detached HEAD state)');
		}

		if (this.branch !== currentBranch) {
			throw new Error(
				`Current branch "${currentBranch}" does not match configured branch "${this.branch}". ` +
				`Update constellation.json or switch to "${this.branch}" branch.`
			);
		}
	}
}
