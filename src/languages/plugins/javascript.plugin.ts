import { BaseLanguagePlugin, BuildConfigManager, ImportResolver } from './base-plugin';
import { ParserLanguage } from '../language.registry';
import { IConstellationLanguageConfig } from '../../config/config';
import { TsJsConfigManager } from './build-config/ts-js-config-manager';
import { TsJsImportResolver } from './resolvers/ts-js-import-resolver';

/**
 * JavaScript language plugin.
 * Provides build configuration management (jsconfig.json) and import path resolution.
 */
export class JavaScriptPlugin extends BaseLanguagePlugin {
	readonly language: ParserLanguage = 'javascript';
	readonly extensions: string[] = ['.js', '.jsx', '.mjs', '.cjs'];

	/**
	 * Gets a build configuration manager for JavaScript projects.
	 * Returns a manager that discovers and parses jsconfig.json files.
	 */
	getBuildConfigManager(
		projectRoot: string,
		languageConfig: IConstellationLanguageConfig
	): BuildConfigManager | null {
		return new TsJsConfigManager(projectRoot, languageConfig);
	}

	/**
	 * Gets an import path resolver for JavaScript files.
	 * Resolves import specifiers using jsconfig path mappings and baseUrl.
	 */
	getImportResolver(
		sourceFilePath: string,
		buildConfig?: any
	): ImportResolver | null {
		return new TsJsImportResolver(sourceFilePath, buildConfig);
	}
}
