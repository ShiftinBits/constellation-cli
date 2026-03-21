import path from 'node:path';
import { ConstellationConfig } from '../config/config';

/**
 * Detects programming languages based on file extensions.
 * Builds a reverse mapping from file extensions to language identifiers.
 */
export class LanguageDetector {
	/** Map from file extensions to language identifiers */
	private extensionToLanguageMap: Map<string, string>;

	/**
	 * Creates a new LanguageDetector instance.
	 * @param config Constellation configuration containing language extension mappings
	 */
	constructor(config: ConstellationConfig) {
		// Build reverse mapping from extensions to languages
		this.extensionToLanguageMap = new Map();

		for (const [language, langConfig] of Object.entries(config.languages)) {
			for (const ext of langConfig.fileExtensions) {
				this.extensionToLanguageMap.set(ext, language);
			}
		}
	}

	/**
	 * Detects the programming language of a file based on its extension.
	 * @param filePath Path to the file to analyze
	 * @returns Language identifier if detected, null if not supported
	 */
	detectLanguage(filePath: string): string | null {
		const ext = path.extname(filePath).toLowerCase();
		return this.extensionToLanguageMap.get(ext) || null;
	}
}
