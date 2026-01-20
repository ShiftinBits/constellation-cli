import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TSConfckParseResult } from 'tsconfck';
import { relativePosix } from '../../../utils/path.utils';

/**
 * Mapping of package names to their entry points.
 * Example: { '@myorg/utils': './libs/utils/src/index.ts' }
 */
export type WorkspacePackageMap = Record<string, string>;

/**
 * Resolves workspace package imports to their actual file paths.
 *
 * This is critical for monorepo setups where internal packages like:
 * - `@myorg/database`
 * - `@myorg/shared`
 *
 * Need to be resolved to their actual file locations instead of being
 * treated as external npm packages.
 *
 * Supports multiple configuration sources:
 * - tsconfig.json paths (TypeScript path mappings)
 * - package.json workspaces (npm/yarn/pnpm workspaces)
 * - package.json name fields in workspace packages
 */
export class WorkspacePackageResolver {
	private workspacePackages: WorkspacePackageMap = {};
	private initialized = false;

	constructor(
		private readonly projectRoot: string,
		private readonly tsconfigResult: TSConfckParseResult | null,
	) {}

	/**
	 * Initializes the workspace package map by reading configuration files.
	 * This is called lazily on first use to avoid unnecessary file I/O.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		this.initialized = true;

		// Build workspace package map from multiple sources
		const packages: WorkspacePackageMap = {};

		// Source 2: package.json workspaces + individual package.json files (lower priority)
		const workspacePackages = await this.loadFromPackageJsonWorkspaces();
		Object.assign(packages, workspacePackages);

		// Source 1: tsconfig.json paths (most reliable for TypeScript projects - higher priority)
		// Load this LAST so it overwrites workspace packages
		const tsconfigPackages = await this.loadFromTsConfig();
		Object.assign(packages, tsconfigPackages);

		this.workspacePackages = packages;
	}

	/**
	 * Resolves a workspace package import to its actual file path.
	 *
	 * @param importPath Import specifier (e.g., '@myorg/database' or '@myorg/database/entities')
	 * @returns Resolved project-relative path, or null if not a workspace package
	 *
	 * @example
	 * // Direct package import
	 * resolve('@myorg/database') // => 'libs/database/src/index.ts'
	 *
	 * // Sub-path import
	 * resolve('@myorg/database/entities') // => 'libs/database/src/entities.ts'
	 */
	async resolve(importPath: string): Promise<string | null> {
		await this.initialize();

		// Try exact match first
		if (this.workspacePackages[importPath]) {
			return this.toProjectRelative(this.workspacePackages[importPath]);
		}

		// Try sub-path match (e.g., '@myorg/database/entities')
		for (const [packageName, entryPoint] of Object.entries(
			this.workspacePackages,
		)) {
			if (importPath.startsWith(packageName + '/')) {
				const subPath = importPath.substring(packageName.length + 1);
				const resolved = await this.resolveSubPath(entryPoint, subPath);
				if (resolved) {
					return this.toProjectRelative(resolved);
				}
			}
		}

		return null;
	}

	/**
	 * Checks if an import path is a workspace package.
	 * Useful for determining whether to mark an import as external.
	 */
	async isWorkspacePackage(importPath: string): Promise<boolean> {
		const resolved = await this.resolve(importPath);
		return resolved !== null;
	}

	/**
	 * Loads workspace packages from tsconfig.json paths configuration.
	 *
	 * Example tsconfig.json:
	 * {
	 *   "compilerOptions": {
	 *     "paths": {
	 *       "@myorg/database": ["libs/database/src"],
	 *       "@myorg/shared": ["libs/shared/src"]
	 *     }
	 *   }
	 * }
	 */
	private async loadFromTsConfig(): Promise<WorkspacePackageMap> {
		const packages: WorkspacePackageMap = {};

		if (!this.tsconfigResult?.tsconfig?.compilerOptions?.paths) {
			return packages;
		}

		const paths = this.tsconfigResult.tsconfig.compilerOptions.paths;
		const tsconfigDir = this.tsconfigResult.tsconfigFile
			? path.dirname(this.tsconfigResult.tsconfigFile)
			: this.projectRoot;

		for (const [pattern, targets] of Object.entries(paths)) {
			// Only process patterns without wildcards for workspace packages
			// Wildcards like "@myorg/*" are too broad and should be handled by normal resolution
			if (pattern.includes('*')) {
				continue;
			}

			// Ensure targets is an array
			if (!Array.isArray(targets)) {
				continue;
			}

			// Take the first target path
			const targetPath = targets[0];
			if (!targetPath) {
				continue;
			}

			// Resolve to absolute path
			const absolutePath = path.resolve(tsconfigDir, targetPath);

			// Try to find the entry point (index file or package main)
			const entryPoint = await this.findEntryPoint(absolutePath);
			if (entryPoint) {
				packages[pattern] = entryPoint;
			}
		}

		return packages;
	}

	/**
	 * Loads workspace packages from package.json workspaces configuration.
	 *
	 * Example package.json:
	 * {
	 *   "workspaces": ["packages/*", "apps/*"]
	 * }
	 *
	 * This method will:
	 * 1. Read the workspace patterns
	 * 2. Find all workspace directories
	 * 3. Read each workspace's package.json to get its name
	 * 4. Map package name to entry point
	 */
	private async loadFromPackageJsonWorkspaces(): Promise<WorkspacePackageMap> {
		const packages: WorkspacePackageMap = {};

		try {
			const rootPackageJsonPath = path.join(this.projectRoot, 'package.json');
			const content = await fs.readFile(rootPackageJsonPath, 'utf-8');
			const packageJson = JSON.parse(content);

			// Check for workspaces configuration
			const workspaces = packageJson.workspaces;
			if (!workspaces) {
				return packages;
			}

			// Workspaces can be an array or an object with packages property
			const workspacePatterns = Array.isArray(workspaces)
				? workspaces
				: workspaces.packages || [];

			// Find all workspace directories
			for (const pattern of workspacePatterns) {
				const workspaceDirs = await this.findWorkspaceDirs(pattern);
				for (const workspaceDir of workspaceDirs) {
					const workspacePackage =
						await this.loadWorkspacePackage(workspaceDir);
					if (workspacePackage) {
						Object.assign(packages, workspacePackage);
					}
				}
			}
		} catch {
			// No package.json or workspaces, return empty
		}

		return packages;
	}

	/**
	 * Finds workspace directories matching a glob pattern.
	 * Supports simple patterns like "packages/*" or "apps/*".
	 */
	private async findWorkspaceDirs(pattern: string): Promise<string[]> {
		const dirs: string[] = [];

		// Handle simple wildcard patterns like "packages/*" or "apps/*"
		if (pattern.endsWith('/*')) {
			const baseDir = pattern.slice(0, -2);
			const basePath = path.join(this.projectRoot, baseDir);

			try {
				const entries = await fs.readdir(basePath, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory()) {
						dirs.push(path.join(basePath, entry.name));
					}
				}
			} catch {
				// Directory doesn't exist
			}
		} else {
			// Exact path
			const exactPath = path.join(this.projectRoot, pattern);
			try {
				const stats = await fs.stat(exactPath);
				if (stats.isDirectory()) {
					dirs.push(exactPath);
				}
			} catch {
				// Directory doesn't exist
			}
		}

		return dirs;
	}

	/**
	 * Loads a workspace package by reading its package.json.
	 * Returns a map of package name to entry point.
	 */
	private async loadWorkspacePackage(
		workspaceDir: string,
	): Promise<WorkspacePackageMap | null> {
		try {
			const packageJsonPath = path.join(workspaceDir, 'package.json');
			const content = await fs.readFile(packageJsonPath, 'utf-8');
			const packageJson = JSON.parse(content);

			const packageName = packageJson.name;
			if (!packageName) {
				return null;
			}

			// Find the entry point
			const entryPoint = await this.findPackageEntryPoint(
				workspaceDir,
				packageJson,
			);
			if (!entryPoint) {
				return null;
			}

			return { [packageName]: entryPoint };
		} catch {
			return null;
		}
	}

	/**
	 * Finds the entry point for a workspace package.
	 * Checks multiple sources in order:
	 * 1. package.json "exports" field
	 * 2. package.json "main" field
	 * 3. Common convention directories (src/index.ts, index.ts)
	 */
	private async findPackageEntryPoint(
		workspaceDir: string,
		packageJson: any,
	): Promise<string | null> {
		// Check "exports" field (modern Node.js packages)
		if (packageJson.exports) {
			const exports = packageJson.exports;

			// Handle string export
			if (typeof exports === 'string') {
				return path.join(workspaceDir, exports);
			}

			// Handle object exports - look for "." or "./index"
			if (typeof exports === 'object') {
				const mainExport = exports['.'] || exports['./index'];
				if (typeof mainExport === 'string') {
					return path.join(workspaceDir, mainExport);
				}
				// Handle conditional exports
				if (typeof mainExport === 'object') {
					const importPath =
						mainExport.import || mainExport.default || mainExport.require;
					if (importPath) {
						return path.join(workspaceDir, importPath);
					}
				}
			}
		}

		// Check "main" field (traditional packages)
		if (packageJson.main) {
			return path.join(workspaceDir, packageJson.main);
		}

		// Fall back to common conventions
		const conventionPaths = [
			'src/index.ts',
			'src/index.tsx',
			'src/index.js',
			'src/index.jsx',
			'index.ts',
			'index.tsx',
			'index.js',
			'index.jsx',
		];

		for (const conventionPath of conventionPaths) {
			const fullPath = path.join(workspaceDir, conventionPath);
			try {
				const stats = await fs.stat(fullPath);
				if (stats.isFile()) {
					return fullPath;
				}
			} catch {
				// File doesn't exist, continue
			}
		}

		return null;
	}

	/**
	 * Finds the entry point for a directory.
	 * Used when resolving tsconfig paths to find index files.
	 */
	private async findEntryPoint(dirPath: string): Promise<string | null> {
		// Common entry point patterns
		const entryPoints = [
			'index.ts',
			'index.tsx',
			'index.js',
			'index.jsx',
			'index.d.ts',
		];

		for (const entry of entryPoints) {
			const fullPath = path.join(dirPath, entry);
			try {
				const stats = await fs.stat(fullPath);
				if (stats.isFile()) {
					return fullPath;
				}
			} catch {
				// File doesn't exist, continue
			}
		}

		// Also try the directory path directly (might be a file without extension in config)
		try {
			const stats = await fs.stat(dirPath);
			if (stats.isFile()) {
				return dirPath;
			}
		} catch {
			// Not a file
		}

		return null;
	}

	/**
	 * Resolves a sub-path import within a workspace package.
	 *
	 * @param entryPoint The package entry point (e.g., 'libs/database/src/index.ts')
	 * @param subPath The sub-path within the package (e.g., 'entities')
	 * @returns Resolved absolute path or null
	 *
	 * @example
	 * resolveSubPath('libs/database/src/index.ts', 'entities')
	 * // => 'libs/database/src/entities.ts' (if exists)
	 * // => 'libs/database/src/entities/index.ts' (if directory)
	 */
	private async resolveSubPath(
		entryPoint: string,
		subPath: string,
	): Promise<string | null> {
		// Get the package directory (remove /index.ts or similar)
		const packageDir =
			entryPoint.endsWith('index.ts') ||
			entryPoint.endsWith('index.tsx') ||
			entryPoint.endsWith('index.js') ||
			entryPoint.endsWith('index.jsx')
				? path.dirname(entryPoint)
				: path.dirname(entryPoint);

		// Try different resolutions
		const candidates = [
			path.join(packageDir, subPath + '.ts'),
			path.join(packageDir, subPath + '.tsx'),
			path.join(packageDir, subPath + '.js'),
			path.join(packageDir, subPath + '.jsx'),
			path.join(packageDir, subPath + '.d.ts'),
			path.join(packageDir, subPath, 'index.ts'),
			path.join(packageDir, subPath, 'index.tsx'),
			path.join(packageDir, subPath, 'index.js'),
			path.join(packageDir, subPath, 'index.jsx'),
		];

		for (const candidate of candidates) {
			try {
				const stats = await fs.stat(candidate);
				if (stats.isFile()) {
					return candidate;
				}
			} catch {
				// File doesn't exist, continue
			}
		}

		return null;
	}

	/**
	 * Converts an absolute file path to a project-relative path.
	 * All returned paths will start with './' to indicate they are project-root relative.
	 * Uses POSIX separators for cross-platform compatibility.
	 */
	private toProjectRelative(absolutePath: string): string {
		const relativePath = relativePosix(this.projectRoot, absolutePath);
		return relativePath.startsWith('./') ? relativePath : `./${relativePath}`;
	}
}
