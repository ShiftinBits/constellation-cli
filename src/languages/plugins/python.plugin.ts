import {
	BaseLanguagePlugin,
	BuildConfigManager,
	ImportResolver,
} from './base-plugin';
import { ParserLanguage } from '../language.registry';

/**
 * Python language plugin.
 * Provides basic language support. Build configuration and import resolution
 * are not yet implemented for Python.
 */
export class PythonPlugin extends BaseLanguagePlugin {
	readonly language: ParserLanguage = 'python';
	readonly extensions: string[] = ['.py', '.pyi'];

	/**
	 * Gets a build configuration manager for Python projects.
	 * Returns null — Python build config support is not yet implemented.
	 */
	getBuildConfigManager(
		projectRoot: string,
		languageConfig: any,
	): BuildConfigManager | null {
		return null;
	}

	/**
	 * Gets an import path resolver for Python files.
	 * Returns null — Python import resolution is not yet implemented.
	 */
	getImportResolver(
		sourceFilePath: string,
		buildConfig?: any,
	): ImportResolver | null {
		return null;
	}
}
