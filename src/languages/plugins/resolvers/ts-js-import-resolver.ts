import { TSConfckParseResult } from 'tsconfck';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ImportResolver } from '../base-plugin';

/**
 * Resolves TypeScript/JavaScript import paths to project-relative paths.
 * Handles baseUrl, paths, and extension resolution.
 * Supports both TypeScript (.ts, .tsx, .d.ts) and JavaScript (.js, .jsx, .mjs, .cjs) extensions.
 */
export class TsJsImportResolver implements ImportResolver {
	/** Base URL for path resolution from tsconfig */
	private readonly baseUrl: string | null = null;

	/** Path mappings from tsconfig paths option */
	private readonly paths: Record<string, string[]> = {};

	/** Directory containing the source file being processed */
	private readonly sourceDir: string;

	/** Directory containing the tsconfig file */
	private readonly tsconfigDir: string;

	/** Project root directory for converting absolute to relative paths */
	private readonly projectRoot: string;

	/** Extensions to try when resolving paths (configured based on file type) */
	private readonly extensions: string[];

	/**
	 * Creates a new PathAliasResolver instance.
	 * @param sourceFilePath Absolute path to the source file containing imports
	 * @param tsconfigResult Parsed tsconfig result from tsconfck
	 */
	constructor(
		sourceFilePath: string,
		tsconfigResult: TSConfckParseResult | null
	) {
		this.sourceDir = path.dirname(sourceFilePath);
		this.projectRoot = process.cwd();

		// Determine extensions based on file type
		const isTypeScriptFile = sourceFilePath.endsWith('.ts') ||
		                         sourceFilePath.endsWith('.tsx') ||
		                         sourceFilePath.endsWith('.d.ts');
		const isJavaScriptFile = sourceFilePath.endsWith('.js') ||
		                         sourceFilePath.endsWith('.jsx') ||
		                         sourceFilePath.endsWith('.mjs') ||
		                         sourceFilePath.endsWith('.cjs');

		if (isTypeScriptFile) {
			this.extensions = ['.ts', '.tsx', '.d.ts'];
		} else if (isJavaScriptFile) {
			this.extensions = ['.js', '.jsx', '.mjs', '.cjs'];
		} else {
			// Default to TypeScript extensions for unknown file types
			this.extensions = ['.ts', '.tsx', '.d.ts'];
		}

		if (!tsconfigResult) {
			this.tsconfigDir = this.sourceDir;
			return;
		}

		this.tsconfigDir = path.dirname(tsconfigResult.tsconfigFile);

		const compilerOptions = tsconfigResult.tsconfig?.compilerOptions;
		if (!compilerOptions) {
			return;
		}

		// Extract baseUrl (resolved relative to tsconfig directory)
		if (compilerOptions.baseUrl) {
			this.baseUrl = path.resolve(this.tsconfigDir, compilerOptions.baseUrl);
		}

		// Extract paths mappings
		if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
			this.paths = compilerOptions.paths;
		}
	}

	/**
	 * Resolves an import specifier to a project-relative file path.
	 * Returns the resolved project-relative path, or the original specifier if resolution fails.
	 * @param specifier Import specifier to resolve (e.g., '@utils/helper' or './local')
	 * @returns Resolved project-relative path or original specifier
	 */
	async resolve(specifier: string): Promise<string> {
		// Resolve relative imports to project-relative paths
		if (specifier.startsWith('./') || specifier.startsWith('../')) {
			const absolutePath = path.resolve(this.sourceDir, specifier);
			const resolved = await this.findFileWithExtensions(absolutePath);
			// Convert absolute path to project-relative path
			if (resolved) {
				return this.toProjectRelative(resolved);
			}
			return specifier;
		}

		// Skip node_modules imports
		if (!specifier.startsWith('@') && !specifier.startsWith('~')) {
			// Check if it looks like a package (no path separator at start)
			if (!specifier.includes('/') || !this.baseUrl) {
				return specifier;
			}
		}

		// Try path alias resolution
		if (Object.keys(this.paths).length > 0) {
			const resolved = await this.resolveWithPaths(specifier);
			if (resolved) {
				return this.toProjectRelative(resolved);
			}
		}

		// Try baseUrl resolution (if no paths matched)
		if (this.baseUrl) {
			const resolved = await this.resolveWithBaseUrl(specifier);
			if (resolved) {
				return this.toProjectRelative(resolved);
			}
		}

		// Unable to resolve - return original
		return specifier;
	}

	/**
	 * Converts an absolute file path to a project-relative path.
	 * @param absolutePath Absolute file system path
	 * @returns Project-relative path
	 */
	private toProjectRelative(absolutePath: string): string {
		return path.relative(this.projectRoot, absolutePath);
	}

	/**
	 * Attempts to resolve a specifier using tsconfig paths mappings.
	 * @param specifier Import specifier to resolve
	 * @returns Resolved absolute path or null if not matched
	 */
	private async resolveWithPaths(specifier: string): Promise<string | null> {
		// Find matching path pattern
		for (const [pattern, substitutions] of Object.entries(this.paths)) {
			const match = this.matchPathPattern(specifier, pattern);
			if (!match) {
				continue;
			}

			// Try each substitution
			for (const substitution of substitutions) {
				const resolved = await this.trySubstitution(specifier, pattern, substitution, match);
				if (resolved) {
					return resolved;
				}
			}
		}

		return null;
	}

	/**
	 * Matches an import specifier against a path pattern.
	 * @param specifier Import specifier
	 * @param pattern Path pattern from tsconfig (e.g., '@utils/*')
	 * @returns The wildcard match content or null if no match
	 */
	private matchPathPattern(specifier: string, pattern: string): string | null {
		// Handle exact match (no wildcard)
		if (!pattern.includes('*')) {
			return specifier === pattern ? '' : null;
		}

		// Handle wildcard pattern
		const [prefix, suffix] = pattern.split('*');

		if (!specifier.startsWith(prefix)) {
			return null;
		}

		if (suffix && !specifier.endsWith(suffix)) {
			return null;
		}

		// Extract the wildcard match content
		const matchStart = prefix.length;
		const matchEnd = suffix ? specifier.length - suffix.length : specifier.length;
		return specifier.substring(matchStart, matchEnd);
	}

	/**
	 * Tries to resolve using a path substitution.
	 * @param specifier Original import specifier
	 * @param pattern The matched pattern
	 * @param substitution The substitution pattern to try
	 * @param wildcardMatch The wildcard match content
	 * @returns Resolved absolute path or null
	 */
	private async trySubstitution(
		specifier: string,
		pattern: string,
		substitution: string,
		wildcardMatch: string
	): Promise<string | null> {
		// Replace wildcard in substitution
		const resolvedPath = substitution.replace('*', wildcardMatch);

		// Resolve relative to tsconfig directory
		const absolutePath = path.resolve(this.tsconfigDir, resolvedPath);

		// Try to find the file with various extensions
		const found = await this.findFileWithExtensions(absolutePath);
		return found;
	}

	/**
	 * Attempts to resolve a specifier using tsconfig baseUrl.
	 * @param specifier Import specifier to resolve
	 * @returns Resolved absolute path or null
	 */
	private async resolveWithBaseUrl(specifier: string): Promise<string | null> {
		if (!this.baseUrl) {
			return null;
		}

		const absolutePath = path.resolve(this.baseUrl, specifier);
		return await this.findFileWithExtensions(absolutePath);
	}

	/**
	 * Tries to find a file with various TypeScript extensions.
	 * Also tries index files in directories.
	 * @param basePath Base path without extension
	 * @returns Resolved absolute path or null if not found
	 */
	private async findFileWithExtensions(basePath: string): Promise<string | null> {
		// Try with configured extensions
		for (const ext of this.extensions) {
			const pathWithExt = basePath + ext;
			if (await this.fileExists(pathWithExt)) {
				return pathWithExt;
			}
		}

		// Try as directory with index files
		for (const ext of this.extensions) {
			const indexPath = path.join(basePath, `index${ext}`);
			if (await this.fileExists(indexPath)) {
				return indexPath;
			}
		}

		return null;
	}

	/**
	 * Checks if a file exists and is readable.
	 * @param filePath Path to check
	 * @returns True if file exists and is readable
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		try {
			const stats = await fs.stat(filePath);
			return stats.isFile();
		} catch {
			return false;
		}
	}
}
