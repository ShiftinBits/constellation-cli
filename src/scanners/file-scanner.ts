import ignore, { Ignore } from 'ignore';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ConstellationConfig } from '../config/config';
import { ParserLanguage } from '../languages/language.registry';
import { FileUtils } from '../utils/file.utils';
import { relativePosix } from '../utils/path.utils';
import { RED_X, YELLOW_WARN } from '../utils/unicode-chars';

/**
 * Information about a discovered file ready for parsing.
 * Contains all metadata needed for AST generation and tracking.
 */
export interface FileInfo {
	/** Absolute path to the file */
	path: string;
	/** Path relative to the project root */
	relativePath: string;
	/** Detected language based on file extension */
	language: ParserLanguage;
	/** File size in bytes */
	size: number;
}

/**
 * Scanner for discovering project files that match configured languages.
 * Respects .gitignore rules and provides both full and incremental scanning capabilities.
 */
export class FileScanner {
	/** Root directory path for file scanning operations */
	private rootPath: string;

	/**
	 * Creates a new FileScanner instance.
	 * @param rootPath Root directory to scan (defaults to current working directory)
	 */
	constructor(rootPath?: string) {
		this.rootPath = rootPath || process.cwd();
	}

	/**
	 * Performs a full scan of all project files matching configured languages.
	 * Respects .gitignore rules and filters by file extensions.
	 * Also applies custom exclude patterns from configuration.
	 * @param config Constellation configuration containing language settings
	 * @returns Array of file information for files to be parsed
	 */
	async scanFiles(config: ConstellationConfig): Promise<FileInfo[]> {
		// Load .gitignore rules from all levels
		const ig = ignore();
		await this.loadGitignoreRules(ig, this.rootPath);

		// Add exclude patterns from configuration
		if (config.exclude && config.exclude.length > 0) {
			ig.add(config.exclude);
		}

		// Walk directory tree
		const allFiles = await this.walkDirectory(this.rootPath);

		// Filter: not ignored + matches configured language extensions
		const filteredFiles = allFiles.filter(
			(file) =>
				!ig.ignores(file.relativePath) &&
				this.matchesLanguageExtension(file, config.languages),
		);

		return filteredFiles;
	}

	/**
	 * Scans specific files for incremental indexing operations.
	 * Only processes existing files that match configured language extensions.
	 * Also applies custom exclude patterns from configuration.
	 * @param filePaths Array of file paths to scan (absolute or relative)
	 * @param config Constellation configuration containing language settings
	 * @returns Array of file information for existing files that match language filters
	 */
	async scanSpecificFiles(
		filePaths: string[],
		config: ConstellationConfig,
	): Promise<FileInfo[]> {
		const fileInfos: FileInfo[] = [];

		// Create an ignore instance for exclude patterns
		let ig: Ignore | null = null;
		if (config.exclude && config.exclude.length > 0) {
			ig = ignore().add(config.exclude);
		}

		// Get canonical project root path for security validation
		const projectRealPath = await fs.realpath(this.rootPath);

		for (const filePath of filePaths) {
			try {
				// Make path absolute if it isn't already
				const absolutePath = path.isAbsolute(filePath)
					? filePath
					: path.join(this.rootPath, filePath);

				// Use lstat to check if path is a symlink without following it
				const lStats = await fs.lstat(absolutePath);

				// Security check: If it's a symlink, verify target stays within project
				if (lStats.isSymbolicLink()) {
					const realPath = await fs.realpath(absolutePath);

					// Verify the real path is within project boundaries
					if (
						!realPath.startsWith(projectRealPath + path.sep) &&
						realPath !== projectRealPath
					) {
						console.warn(
							`${YELLOW_WARN} Skipping symlink pointing outside project: ${filePath} -> ${realPath}`,
						);
						continue;
					}

					// Get stats of the symlink target
					const stats = await fs.stat(absolutePath);
					if (!stats.isFile()) {
						continue;
					}

					// Use the real path for further processing
					const relativePath = relativePosix(this.rootPath, absolutePath);

					// Check if file is excluded by exclude patterns
					if (ig && ig.ignores(relativePath)) {
						continue;
					}

					// Detect language from extension
					const language = this.detectLanguage(relativePath, config.languages);
					if (!language) {
						continue;
					}

					fileInfos.push({
						path: absolutePath,
						relativePath,
						language,
						size: stats.size,
					});
				} else if (lStats.isFile()) {
					// Regular file - process normally
					const relativePath = relativePosix(this.rootPath, absolutePath);

					// Check if file is excluded by exclude patterns
					if (ig && ig.ignores(relativePath)) {
						continue;
					}

					// Detect language from extension
					const language = this.detectLanguage(relativePath, config.languages);
					if (!language) {
						continue;
					}

					fileInfos.push({
						path: absolutePath,
						relativePath,
						language,
						size: lStats.size,
					});
				}
				// Skip directories and other file types
			} catch (error) {
				// File doesn't exist or isn't accessible, skip it
				console.warn(`${YELLOW_WARN} Skipping inaccessible file: ${filePath}`);
			}
		}

		return fileInfos;
	}

	/**
	 * Loads .gitignore rules from all levels of the directory hierarchy.
	 * Walks up from startPath to git repository root, collecting ignore patterns.
	 * @param ig The ignore instance to add rules to
	 * @param startPath The path to start searching from
	 */
	private async loadGitignoreRules(
		ig: Ignore,
		startPath: string,
	): Promise<void> {
		const gitignorePaths: string[] = [];
		let currentPath = startPath;

		// Walk up the directory tree to find all .gitignore files
		while (true) {
			const gitignorePath = path.join(currentPath, '.gitignore');
			if (await FileUtils.fileIsReadable(gitignorePath)) {
				gitignorePaths.unshift(gitignorePath); // Add to beginning to maintain hierarchy
			}

			const parentPath = path.dirname(currentPath);
			if (parentPath === currentPath) {
				break; // Reached root of filesystem
			}
			currentPath = parentPath;

			// Stop at git repository root if we find one
			const gitPath = path.join(currentPath, '.git');
			if (await FileUtils.directoryExists(gitPath)) {
				// Check for .gitignore at git root too
				const rootGitignore = path.join(currentPath, '.gitignore');
				if (
					(await FileUtils.fileIsReadable(rootGitignore)) &&
					!gitignorePaths.includes(rootGitignore)
				) {
					gitignorePaths.unshift(rootGitignore);
				}
				break;
			}
		}

		// Load all .gitignore files in order (from root to current directory)
		for (const gitignorePath of gitignorePaths) {
			try {
				const content = await FileUtils.readFile(gitignorePath);
				ig.add(content);
			} catch (error) {
				console.warn(
					`${YELLOW_WARN} Failed to load .gitignore: ${gitignorePath}`,
				);
			}
		}

		// Add default patterns that git always ignores
		ig.add('.git');
	}

	/**
	 * Recursively walks a directory tree and collects file information.
	 * Skips hidden directories and handles file stat errors gracefully.
	 * Validates symlinks to prevent path traversal attacks.
	 * @param dirPath Directory to walk
	 * @param baseDir Base directory for calculating relative paths (defaults to dirPath)
	 * @param projectRealPath Canonical project root path for security validation (optional, computed on first call)
	 * @returns Array of file information with placeholder language values
	 */
	private async walkDirectory(
		dirPath: string,
		baseDir?: string,
		projectRealPath?: string,
	): Promise<FileInfo[]> {
		const files: FileInfo[] = [];
		const base = baseDir || dirPath;

		// Get canonical project root path on first call for security validation
		const projectRoot = projectRealPath || (await fs.realpath(this.rootPath));

		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				const relativePath = relativePosix(base, fullPath);

				if (entry.isDirectory()) {
					// Skip hidden directories (starting with .)
					if (entry.name.startsWith('.')) {
						continue;
					}

					// Recursively walk subdirectories, passing down projectRoot
					const subFiles = await this.walkDirectory(
						fullPath,
						base,
						projectRoot,
					);
					files.push(...subFiles);
				} else if (entry.isFile()) {
					// Get file stats
					const stats = await fs.stat(fullPath);

					// For now, add all files - filtering happens later
					// We need language detection first
					files.push({
						path: fullPath,
						relativePath,
						language: '' as ParserLanguage, // Will be set during filtering
						size: stats.size,
					});
				} else if (entry.isSymbolicLink()) {
					// Security check: Validate symlink target stays within project
					try {
						const realPath = await fs.realpath(fullPath);

						// Verify the real path is within project boundaries
						if (
							!realPath.startsWith(projectRoot + path.sep) &&
							realPath !== projectRoot
						) {
							console.warn(
								`${YELLOW_WARN} Skipping symlink pointing outside project: ${fullPath} -> ${realPath}`,
							);
							continue;
						}

						// Check if symlink points to a file or directory
						const stats = await fs.stat(fullPath);

						if (stats.isDirectory()) {
							// Skip hidden directories
							if (entry.name.startsWith('.')) {
								continue;
							}

							// Recursively walk symlinked directories
							const subFiles = await this.walkDirectory(
								fullPath,
								base,
								projectRoot,
							);
							files.push(...subFiles);
						} else if (stats.isFile()) {
							// Add symlinked file
							files.push({
								path: fullPath,
								relativePath,
								language: '' as ParserLanguage,
								size: stats.size,
							});
						}
					} catch (symlinkError) {
						// Broken symlink or permission error
						console.warn(
							`${YELLOW_WARN} Skipping invalid symlink: ${fullPath}`,
						);
					}
				}
				// Skip other special files (pipes, sockets, etc.)
			}
		} catch (error) {
			console.error(`${RED_X} Error walking directory ${dirPath}:`, error);
		}

		return files;
	}

	/**
	 * Checks if a file matches any configured language extensions.
	 * Mutates the file object to set the detected language if matched.
	 * @param file File information object to check and potentially modify
	 * @param languages Configured languages and their extensions
	 * @returns True if the file matches a configured language, false otherwise
	 */
	private matchesLanguageExtension(
		file: FileInfo,
		languages: ConstellationConfig['languages'],
	): boolean {
		const ext = path.extname(file.path).toLowerCase();

		for (const [language, config] of Object.entries(languages)) {
			if (config.fileExtensions.includes(ext)) {
				// Set the detected language on the file
				file.language = language as ParserLanguage;
				return true;
			}
		}

		return false;
	}

	/**
	 * Detects the programming language of a file based on its extension.
	 * Pure function that doesn't modify any objects.
	 * @param filePath Path to the file to analyze
	 * @param languages Configured languages and their extensions
	 * @returns The detected language identifier or null if no match found
	 */
	private detectLanguage(
		filePath: string,
		languages: ConstellationConfig['languages'],
	): ParserLanguage | null {
		const ext = path.extname(filePath).toLowerCase();

		for (const [language, config] of Object.entries(languages)) {
			if (config.fileExtensions.includes(ext)) {
				return language as ParserLanguage;
			}
		}

		return null;
	}
}

export default FileScanner;
