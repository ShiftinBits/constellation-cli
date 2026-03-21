import { mergeFieldMaps } from '../ast-serializer';
import {
	SHARED_TEXT_TYPES,
	javascriptConfig,
	typescriptConfig,
} from './javascript.config';
import { pythonConfig } from './python.config';
import type { LanguageSerializerConfig } from './types';

export { SHARED_TEXT_TYPES } from './javascript.config';
export { JS_TS_FIELD_NAMES } from './javascript.config';
export { PYTHON_FIELD_NAMES } from './python.config';
export type { LanguageSerializerConfig } from './types';

/**
 * Registry of language-specific serializer configurations.
 */
const LANGUAGE_CONFIGS: ReadonlyMap<string, LanguageSerializerConfig> = new Map(
	[
		['javascript', javascriptConfig],
		['typescript', typescriptConfig],
		['python', pythonConfig],
	],
);

/**
 * Returns the language-specific serializer config, or undefined if no config exists.
 */
export function getLanguageConfig(
	language: string,
): LanguageSerializerConfig | undefined {
	return LANGUAGE_CONFIGS.get(language);
}

/**
 * Returns the combined set of text-included types for a language.
 * Merges SHARED_TEXT_TYPES with the language-specific types.
 * If no language is provided, returns SHARED_TEXT_TYPES only.
 */
export function getTextIncludedTypes(language?: string): ReadonlySet<string> {
	if (!language) {
		return SHARED_TEXT_TYPES;
	}

	const config = LANGUAGE_CONFIGS.get(language);
	if (!config) {
		return SHARED_TEXT_TYPES;
	}

	// Merge shared + language-specific types
	const combined = new Set<string>(SHARED_TEXT_TYPES);
	for (const type of config.textIncludedTypes) {
		combined.add(type);
	}
	return combined;
}

/**
 * Returns the field names for a specific language.
 * If no language is provided, returns the merged field names from all languages
 * (backwards-compatible with COMMON_FIELD_NAMES behavior).
 */
export function getFieldNamesForLanguage(
	language?: string,
): Readonly<Record<string, string[]>> {
	if (!language) {
		// Backwards compat: merge all language field maps
		const allMaps = Array.from(LANGUAGE_CONFIGS.values()).map(
			(c) => c.fieldNames,
		);
		return mergeFieldMaps(...allMaps);
	}

	const config = LANGUAGE_CONFIGS.get(language);
	if (!config) {
		// Unknown language — return merged all (backwards compat)
		const allMaps = Array.from(LANGUAGE_CONFIGS.values()).map(
			(c) => c.fieldNames,
		);
		return mergeFieldMaps(...allMaps);
	}

	return config.fieldNames;
}
