import {
	BaseLanguagePlugin,
	BuildConfigManager,
	ImportResolver,
} from './base-plugin';
import { ParserLanguage } from '../language.registry';
import { PythonImportResolver } from './resolvers/python-import-resolver';

/**
 * Python language plugin.
 * Provides language support including import resolution.
 * Build configuration is not yet implemented for Python.
 */
export class PythonPlugin extends BaseLanguagePlugin {
	readonly language: ParserLanguage = 'python';
	readonly extensions: string[] = ['.py', '.pyi', '.pyw'];

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
	 * Resolves relative imports, stdlib modules, and local project modules.
	 */
	getImportResolver(
		sourceFilePath: string,
		buildConfig?: any,
	): ImportResolver | null {
		return new PythonImportResolver(sourceFilePath, process.cwd());
	}
}
