import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TSConfckParseResult } from 'tsconfck';
import { ImportResolver } from '../base-plugin';
import { WorkspacePackageResolver } from './workspace-package-resolver';

/**
 * Resolves TypeScript/JavaScript import paths to project-relative paths.
 * Handles baseUrl, paths, and extension resolution.
 * Supports both TypeScript (.ts, .tsx, .d.ts) and JavaScript (.js, .jsx, .mjs, .cjs) extensions.
 * Resolves workspace packages to prevent internal imports from being treated as external.
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

	/** Package.json imports field for # prefix internal aliases */
	private packageImports: Record<string, string | string[]> = {};

	/** Directory containing the package.json file */
	private packageJsonDir: string | null = null;

	/** Path to the source file being resolved */
	private readonly sourceFilePath: string;

	/** Workspace package resolver for monorepo imports */
	private readonly workspaceResolver: WorkspacePackageResolver;

	/**
	 * Creates a new PathAliasResolver instance.
	 * @param sourceFilePath Absolute path to the source file containing imports
	 * @param tsconfigResult Parsed tsconfig result from tsconfck
	 */
	constructor(
		sourceFilePath: string,
		tsconfigResult: TSConfckParseResult | null
	) {
		this.sourceFilePath = sourceFilePath;
		this.sourceDir = path.dirname(sourceFilePath);
		this.projectRoot = process.cwd();

		// Initialize workspace package resolver
		this.workspaceResolver = new WorkspacePackageResolver(this.projectRoot, tsconfigResult);

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

		if (!tsconfigResult?.tsconfigFile) {
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

		// Resolve package.json "imports" field (# prefix internal aliases)
		// This has higher priority than path aliases per Node.js resolution
		if (specifier.startsWith('#')) {
			const resolved = await this.resolveWithPackageImports(specifier);
			if (resolved) {
				return this.toProjectRelative(resolved);
			}
			// If not found, return original (will be handled as external)
			return specifier;
		}

		// **CRITICAL FIX**: Try workspace package resolution FIRST
		// This prevents internal monorepo packages from being treated as external
		// Example: '@myorg/database' should resolve to 'libs/database/src/index.ts'
		// instead of being treated as an external npm package
		const workspaceResolved = await this.workspaceResolver.resolve(specifier);
		if (workspaceResolved) {
			return workspaceResolved;
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
	 * All returned paths will start with './' to indicate they are project-root relative.
	 * @param absolutePath Absolute file system path
	 * @returns Project-relative path starting with './'
	 */
	private toProjectRelative(absolutePath: string): string {
		const relativePath = path.relative(this.projectRoot, absolutePath);
		// Ensure all project-root relative paths start with ./
		return relativePath.startsWith('./') ? relativePath : `./${relativePath}`;
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

			// match can be '' (empty string) for exact matches, so we need to check for null explicitly
			if (match === null) {
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
	 * Resolves symlinks to their actual locations for accurate path tracking.
	 * @param basePath Base path without extension
	 * @returns Resolved absolute path or null if not found
	 */
	private async findFileWithExtensions(basePath: string): Promise<string | null> {
		// Check if path already has a known extension - if so, try it as-is first
		const hasKnownExtension = this.extensions.some(ext => basePath.endsWith(ext));
		if (hasKnownExtension && await this.fileExists(basePath)) {
			return await this.resolveSymlink(basePath);
		}

		// Try with configured extensions (skip if already has one)
		if (!hasKnownExtension) {
			for (const ext of this.extensions) {
				const pathWithExt = basePath + ext;
				if (await this.fileExists(pathWithExt)) {
					return await this.resolveSymlink(pathWithExt);
				}
			}
		}

		// Try as directory with index files
		for (const ext of this.extensions) {
			const indexPath = path.join(basePath, `index${ext}`);
			if (await this.fileExists(indexPath)) {
				return await this.resolveSymlink(indexPath);
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

	/**
	 * Resolves symlinks to their actual file locations.
	 * Critical for monorepo setups with workspace symlinks.
	 * @param filePath Path that may be a symlink
	 * @returns Real path or original path if not a symlink
	 */
	private async resolveSymlink(filePath: string): Promise<string> {
		try {
			return await fs.realpath(filePath);
		} catch {
			// If realpath fails (broken symlink, etc.), return original path
			return filePath;
		}
	}

	/**
	 * Finds the nearest package.json by walking up the directory tree from the source file.
	 * Stops at project root to avoid searching outside the project.
	 * @param startDir Directory to start searching from
	 * @returns Absolute path to package.json or null if not found
	 */
	private async findPackageJson(startDir: string): Promise<string | null> {
		let currentDir = startDir;

		// Walk up the directory tree until we hit the project root
		while (currentDir.startsWith(this.projectRoot)) {
			const packageJsonPath = path.join(currentDir, 'package.json');

			try {
				const stats = await fs.stat(packageJsonPath);
				if (stats.isFile()) {
					return packageJsonPath;
				}
			} catch {
				// File doesn't exist, continue searching
			}

			// Move up one directory
			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) {
				// Reached filesystem root without finding package.json
				break;
			}
			currentDir = parentDir;
		}

		return null;
	}

	/**
	 * Loads the "imports" field from the nearest package.json.
	 * This is called lazily on first use to avoid unnecessary file I/O.
	 * @returns Promise that resolves when imports are loaded
	 */
	private async loadPackageImports(): Promise<void> {
		// Only load once
		if (this.packageJsonDir !== null) {
			return;
		}

		const packageJsonPath = await this.findPackageJson(this.sourceDir);
		if (!packageJsonPath) {
			// Mark as attempted but not found
			this.packageJsonDir = '';
			return;
		}

		try {
			const content = await fs.readFile(packageJsonPath, 'utf-8');
			const packageJson = JSON.parse(content);

			this.packageJsonDir = path.dirname(packageJsonPath);

			// Extract imports field if it exists
			if (packageJson.imports && typeof packageJson.imports === 'object') {
				this.packageImports = packageJson.imports;
			}
		} catch {
			// Failed to read or parse package.json
			this.packageJsonDir = '';
		}
	}

	/**
	 * Resolves imports using package.json "imports" field (# prefix aliases).
	 * Supports both exact matches and wildcard patterns.
	 * @param specifier Import specifier to resolve (must start with #)
	 * @returns Resolved absolute path or null if not matched
	 */
	private async resolveWithPackageImports(specifier: string): Promise<string | null> {
		// Ensure imports are loaded
		await this.loadPackageImports();

		// No package.json or no imports field
		if (!this.packageJsonDir || Object.keys(this.packageImports).length === 0) {
			return null;
		}

		// Try to match against import patterns
		for (const [pattern, target] of Object.entries(this.packageImports)) {
			const match = this.matchPathPattern(specifier, pattern);
			if (match === null) {
				continue;
			}

			// Handle string target (most common case)
			if (typeof target === 'string') {
				const resolved = await this.tryPackageImportSubstitution(target, match);
				if (resolved) {
					return resolved;
				}
			}

			// Handle array of targets (try each in order)
			if (Array.isArray(target)) {
				for (const targetPath of target) {
					if (typeof targetPath === 'string') {
						const resolved = await this.tryPackageImportSubstitution(targetPath, match);
						if (resolved) {
							return resolved;
						}
					}
				}
			}
		}

		return null;
	}

	/**
	 * Tries to resolve a package import substitution.
	 * @param targetPath Target path from imports field
	 * @param wildcardMatch The wildcard match content (if any)
	 * @returns Resolved absolute path or null
	 */
	private async tryPackageImportSubstitution(
		targetPath: string,
		wildcardMatch: string
	): Promise<string | null> {
		if (!this.packageJsonDir) {
			return null;
		}

		// Replace wildcard in target path
		const resolvedPath = targetPath.replace('*', wildcardMatch);

		// Resolve relative to package.json directory
		const absolutePath = path.resolve(this.packageJsonDir, resolvedPath);

		// Try to find the file with various extensions
		return await this.findFileWithExtensions(absolutePath);
	}
}
