import {
	BaseLanguagePlugin,
	BuildConfigManager,
	ImportResolver,
} from './base-plugin';
import { ParserLanguage } from '../language.registry';
import { IConstellationLanguageConfig } from '../../config/config';
import { TsJsConfigManager } from './build-config/ts-js-config-manager';
import { TsJsImportResolver } from './resolvers/ts-js-import-resolver';

/**
 * TypeScript language plugin.
 * Provides build configuration management (tsconfig.json) and import path resolution.
 */
export class TypeScriptPlugin extends BaseLanguagePlugin {
	readonly language: ParserLanguage = 'typescript';
	readonly extensions: string[] = ['.ts', '.tsx', '.d.ts'];

	/**
	 * Gets a build configuration manager for TypeScript projects.
	 * Returns a manager that discovers and parses tsconfig.json files.
	 */
	getBuildConfigManager(
		projectRoot: string,
		languageConfig: IConstellationLanguageConfig,
	): BuildConfigManager | null {
		return new TsJsConfigManager(projectRoot, languageConfig);
	}

	/**
	 * Gets an import path resolver for TypeScript files.
	 * Resolves import specifiers using tsconfig path mappings and baseUrl.
	 */
	getImportResolver(
		sourceFilePath: string,
		buildConfig?: any,
	): ImportResolver | null {
		return new TsJsImportResolver(sourceFilePath, buildConfig);
	}
}
