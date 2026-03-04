import type { ImportResolutionMetadata } from '@constellationdev/types';
import type { ImportResolver } from '../../languages/plugins/base-plugin';
import { normalizeGraphPath } from '../path.utils';
import type { ImportTypeClassifier } from './types';

/**
 * Resolves an import specifier and stores the result.
 * Shared by all language processors to eliminate duplication.
 */
export async function resolveAndStore(
	importSpecifier: string,
	line: number,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	const resolvedPath = await resolver.resolve(importSpecifier);
	const isExternal = isExternalPackage(importSpecifier, resolvedPath);
	const importType = classifier(importSpecifier, resolvedPath, isExternal);
	const normalizedPath = isExternal
		? undefined
		: normalizeGraphPath(resolvedPath);
	resolutions[line.toString()] = {
		source: importSpecifier,
		resolvedPath: normalizedPath,
		isExternal,
		importType,
	};
}

/**
 * Determines if import is an external package.
 *
 * CRITICAL: This logic must distinguish between:
 * - External packages: @nestjs/common, lodash, node:fs (return true)
 * - Internal workspace packages: @constellation/graph-engine �� libs/graph-engine/src/index.ts (return false)
 * - Relative imports: ./foo, ../bar (return false)
 * - Canonical project paths: libs/..., apps/..., src/... (return false)
 */
export function isExternalPackage(
	specifier: string,
	resolved: string,
): boolean {
	// If resolution didn't change, it's external (e.g., @nestjs/common → @nestjs/common)
	if (specifier === resolved) {
		return true;
	}

	// Project-relative paths without leading ./ or ../ are canonical paths
	// Examples: "libs/graph-engine/src/index.ts", "apps/intel-api/src/main.ts"
	// These are internal workspace files, NOT external packages
	if (!resolved.startsWith('.') && !resolved.startsWith('/')) {
		// Canonical project-relative path = internal
		return false;
	}

	// Relative paths (./foo, ../bar) are internal
	if (resolved.startsWith('./') || resolved.startsWith('../')) {
		return false;
	}

	// Everything else is external (absolute paths, node: prefixes, etc.)
	return true;
}

/** Default classifier — works for JS/TS import conventions */
export const defaultClassifyImportType: ImportTypeClassifier = (
	specifier: string,
	_resolved: string,
	isExternal: boolean,
): 'relative' | 'workspace' | 'alias' | 'external' | 'builtin' => {
	if (isExternal) {
		return specifier.startsWith('node:') ? 'builtin' : 'external';
	}

	if (specifier.startsWith('./') || specifier.startsWith('../')) {
		return 'relative';
	}

	if (specifier.startsWith('@')) {
		return 'workspace';
	}

	return 'alias';
};
