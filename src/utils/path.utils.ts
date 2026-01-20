import * as path from 'node:path';

/**
 * Cross-platform path utilities for ensuring consistent POSIX-style paths.
 * All paths stored in the graph database must use forward slashes regardless of OS.
 */

/**
 * Converts a path to POSIX format (forward slashes).
 * Essential for Windows compatibility - Node's path.join() and path.relative()
 * return backslashes on Windows, but all stored paths must use forward slashes.
 *
 * @param filePath Path that may contain backslashes
 * @returns Path with all backslashes converted to forward slashes
 *
 * @example
 * toPosixPath('libs\\database\\src\\index.ts')
 * // => 'libs/database/src/index.ts'
 */
export function toPosixPath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

/**
 * Converts an array of paths to POSIX format.
 *
 * @param paths Array of paths that may contain backslashes
 * @returns Array of paths with forward slashes
 */
export function toPosixPaths(paths: string[]): string[] {
	return paths.map(toPosixPath);
}

/**
 * Joins path segments and ensures the result uses POSIX separators.
 * Use this instead of path.join() when the result will be stored or transmitted.
 *
 * @param segments Path segments to join
 * @returns Joined path with forward slashes
 *
 * @example
 * joinPosix('libs', 'database', 'src', 'index.ts')
 * // => 'libs/database/src/index.ts' (even on Windows)
 */
export function joinPosix(...segments: string[]): string {
	return toPosixPath(path.join(...segments));
}

/**
 * Normalizes a path to canonical graph format:
 * - Project-root-relative without leading ./
 * - Forward slashes only
 *
 * This is the standard format for all paths stored in Neo4j.
 *
 * @param filePath Path to normalize (may have leading ./ or /)
 * @returns Canonical path format for graph storage
 *
 * @example
 * normalizeGraphPath('./libs/indexer/src/index.ts')
 * // => 'libs/indexer/src/index.ts'
 *
 * normalizeGraphPath('libs\\database\\src\\index.ts')
 * // => 'libs/database/src/index.ts'
 */
export function normalizeGraphPath(filePath: string): string {
	return toPosixPath(filePath).replace(/^\.?\//, '');
}

/**
 * Computes a relative path and ensures POSIX format.
 * Use this instead of path.relative() when the result will be stored or transmitted.
 *
 * @param from The base path
 * @param to The target path
 * @returns Relative path with forward slashes
 *
 * @example
 * relativePosix('/project', '/project/libs/database/src/index.ts')
 * // => 'libs/database/src/index.ts' (even on Windows)
 */
export function relativePosix(from: string, to: string): string {
	return toPosixPath(path.relative(from, to));
}
