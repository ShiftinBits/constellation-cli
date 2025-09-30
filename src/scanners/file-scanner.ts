import ignore, { Ignore } from 'ignore';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ConstellationConfig } from '../config/config';
import { ParserLanguage } from '../languages/language.registry';
import { FileUtils } from '../utils/file.utils';

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
				this.matchesLanguageExtension(file, config.languages)
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
	async scanSpecificFiles(filePaths: string[], config: ConstellationConfig): Promise<FileInfo[]> {
		const fileInfos: FileInfo[] = [];

		// Create an ignore instance for exclude patterns
		let ig: Ignore | null = null;
		if (config.exclude && config.exclude.length > 0) {
			ig = ignore().add(config.exclude);
		}

		for (const filePath of filePaths) {
			try {
				// Make path absolute if it isn't already
				const absolutePath = path.isAbsolute(filePath)
					? filePath
					: path.join(this.rootPath, filePath);

				// Check if file exists and get stats
				const stats = await fs.stat(absolutePath);
				if (!stats.isFile()) {
					continue;
				}

				// Get relative path
				const relativePath = path.relative(this.rootPath, absolutePath);

				// Check if file is excluded by exclude patterns
				if (ig && ig.ignores(relativePath)) {
					continue; // Skip excluded files
				}

				// Detect language from extension
				const language = this.detectLanguage(relativePath, config.languages);
				if (!language) {
					continue; // Skip files that don't match configured languages
				}

				fileInfos.push({
					path: absolutePath,
					relativePath,
					language,
					size: stats.size
				});
			} catch (error) {
				// File doesn't exist or isn't accessible, skip it
				console.warn(`[SCANNER] Skipping inaccessible file: ${filePath}`);
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
	private async loadGitignoreRules(ig: Ignore, startPath: string): Promise<void> {
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
				if (await FileUtils.fileIsReadable(rootGitignore) && !gitignorePaths.includes(rootGitignore)) {
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
				console.warn(`[SCANNER] Failed to load .gitignore: ${gitignorePath}`);
			}
		}

		// Add default patterns that git always ignores
		ig.add('.git');
	}

	/**
	 * Recursively walks a directory tree and collects file information.
	 * Skips hidden directories and handles file stat errors gracefully.
	 * @param dirPath Directory to walk
	 * @param baseDir Base directory for calculating relative paths (defaults to dirPath)
	 * @returns Array of file information with placeholder language values
	 */
	private async walkDirectory(dirPath: string, baseDir?: string): Promise<FileInfo[]> {
		const files: FileInfo[] = [];
		const base = baseDir || dirPath;

		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dirPath, entry.name);
				const relativePath = path.relative(base, fullPath);

				if (entry.isDirectory()) {
					// Skip hidden directories (starting with .)
					if (entry.name.startsWith('.')) {
						continue;
					}

					// Recursively walk subdirectories
					const subFiles = await this.walkDirectory(fullPath, base);
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
						size: stats.size
					});
				}
				// Skip symbolic links and other special files
			}
		} catch (error) {
			console.error(`[SCANNER] Error walking directory ${dirPath}:`, error);
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
		languages: ConstellationConfig['languages']
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
		languages: ConstellationConfig['languages']
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
