import { performance } from 'node:perf_hooks';
import {
	AuthenticationError,
	ConstellationClient,
	IndexingInProgressError,
	NotFoundError,
	ProjectValidationError,
} from '../api/constellation-client';
import { BuildConfigManager } from '../languages/plugins/base-plugin';
import { SourceParser } from '../parsers/source.parser';
import { FileInfo, FileScanner } from '../scanners/file-scanner';
import { SerializedASTSchema } from '../schemas/ast.schema';
import type { SerializedAST } from '@constellationdev/types';
import { ASTCompressor } from '../utils/ast-compressor';
import { ACCESS_KEY_ENV_VAR } from '../utils/constants';
import { PromisePool } from '../utils/promise-pool';
import { normalizeGraphPath } from '../utils/path.utils';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING,
	YELLOW_WARN,
} from '../utils/unicode-chars';
import { BaseCommand } from './base.command';
import { CommandDeps } from './command.deps';

/**
 * Command to index project files by parsing ASTs and uploading to the Constellation service.
 * Supports both full and incremental indexing based on git history.
 */
export default class IndexCommand extends BaseCommand {
	/** Scanner for discovering project files */
	private scanner: FileScanner;
	/** Parser for generating ASTs from source files */
	private parser: SourceParser;
	/** Client for communicating with the Constellation API */
	private apiClient?: ConstellationClient;
	/** Compressor for optimizing AST data transmission */
	private compressor: ASTCompressor;
	/** Map of build config managers by language */
	private buildConfigManagers: Map<string, BuildConfigManager> = new Map();

	/**
	 * Creates a new IndexCommand instance.
	 * @param dependencies Injected command dependencies
	 * @throws Error if configuration or language registry is not available
	 */
	constructor(dependencies: CommandDeps) {
		super(dependencies);
		if (!this.config || !this.langRegistry) {
			throw new Error('index command requires a valid configuration');
		}
		this.scanner = new FileScanner(process.cwd());
		this.parser = new SourceParser(this.langRegistry);
		this.compressor = new ASTCompressor();

		// Initialize build config managers for languages that support them
		for (const language of Object.keys(this.config.languages)) {
			const plugin = this.langRegistry.getPlugin(language as any);
			if (plugin?.getBuildConfigManager) {
				const manager = plugin.getBuildConfigManager(
					process.cwd(),
					this.config.languages,
				);
				if (manager) {
					this.buildConfigManagers.set(language, manager);
				}
			}
		}
	}

	/**
	 * Executes the indexing process.
	 * Validates git state, discovers files, generates ASTs, and uploads to the API.
	 * @param forceFullIndex If true, performs full index regardless of incremental state
	 * @param gitDirty If true, skips git validation checks (branch and working tree status)
	 * @throws Error if any step of the indexing process fails
	 */
	public async run(forceFullIndex = false, gitDirty = false): Promise<void> {
		try {
			const accessKey = await this.getAccessKey();

			this.apiClient = new ConstellationClient(this.config!, accessKey);

			// Validate project access before any processing
			await this.validateProject();

			console.log(`${YELLOW_LIGHTNING}Starting indexing procedure...\n`);

			const startTime = performance.now();

			// Step 1: Validate Git Branch (skip if gitDirty flag is set)
			if (!gitDirty) {
				await this.validateGitBranch();
			} else {
				console.log(`${YELLOW_WARN} Skipping git branch validation`);
			}

			// Step 2: Validate Git Status (skip if gitDirty flag is set)
			if (!gitDirty) {
				await this.validateGitStatus();
			} else {
				console.log(`${YELLOW_WARN} Skipping git status validation`);
			}

			// Step 3: Synchronize Latest Changes (skip if gitDirty flag is set)
			if (!gitDirty) {
				await this.synchronizeChanges();
			} else {
				console.log(`${YELLOW_WARN} Skipping repository synchronization`);
			}

			// Step 4: Initialize build configuration managers (if any languages support them)
			if (this.buildConfigManagers.size > 0) {
				console.log(
					`${BLUE_INFO} Discovering language build configurations...`,
				);
				let totalConfigs = 0;
				for (const [language, manager] of this.buildConfigManagers.entries()) {
					const configPaths = await manager.initialize();
					totalConfigs += configPaths.length;
				}
				if (totalConfigs > 0) {
					console.log(
						`${GREEN_CHECK} Found ${totalConfigs} configuration file(s)`,
					);
				}
			}

			// Step 5: Determine Index Scope
			const indexScopeResult = await this.determineIndexScope(forceFullIndex);

			// Get commit hash once for freshness check and upload
			const currentCommit = await this.git!.getLatestCommitHash();

			// Exit early if already up-to-date
			if (indexScopeResult.upToDate) {
				console.log(
					`\n${GREEN_CHECK} Index is already up-to-date for ${this.config!.projectId} on ${this.config!.branch} commit ${currentCommit.substring(0, 8)}`,
				);
				return;
			}

			// Pre-parse freshness check: skip parsing if server already has this commit
			if (indexScopeResult.isIncremental && currentCommit) {
				const indexStatus = await this.apiClient!.getIndexStatus(
					this.config!.branch,
					currentCommit,
				);
				if (
					indexStatus?.status === 'current' ||
					(indexStatus?.status === 'processing' &&
						indexStatus?.commitHash === currentCommit)
				) {
					console.log(
						`${GREEN_CHECK} Index already up to date for branch ${this.config!.branch} at commit ${currentCommit.substring(0, 8)}`,
					);
					return;
				}
			}

			// Step 6: Analyze Codebase
			const files = await this.discoverFiles(indexScopeResult.isIncremental);

			// Step 6: Transmit to API
			// Track whether upload has completed to avoid redundant messaging
			let uploadComplete = false;

			// Callback invoked when AST generation finishes (all files processed)
			const onProcessingComplete = () => {
				// Only print upload message if upload is still in progress
				// This happens when processing finishes before network upload completes
				if (!uploadComplete) {
					console.log(
						`${BLUE_INFO} Uploading metadata, processing, and indexing...`,
					);
				}
			};

			// Create AST stream with completion callback
			const astDataStream = this.generateASTs(files, onProcessingComplete);

			// Upload to API - mark complete when done (success or failure)
			try {
				await this.uploadToAPI(
					astDataStream,
					indexScopeResult.isIncremental,
					currentCommit,
				);
				uploadComplete = true;
			} catch (error) {
				uploadComplete = true;
				throw error; // Re-throw to outer catch
			}

			const endTime = performance.now();
			const execMs = endTime - startTime;

			// Convert milliseconds to human-readable format
			const totalSeconds = execMs / 1000;
			const minutes = Math.floor(totalSeconds / 60);
			const seconds = (totalSeconds % 60).toFixed(3);
			const humanReadableExecTime =
				minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

			console.log(
				`\n${GREEN_CHECK} Upload completed in ${humanReadableExecTime}! Server indexing in progress.`,
			);
		} catch (error) {
			// Project validation errors are already displayed by validateProject()
			if (error instanceof ProjectValidationError) {
				throw error;
			}
			// Provide actionable message for concurrent indexing conflicts
			if (error instanceof IndexingInProgressError) {
				console.error(
					`${RED_X} Indexing failed: Another indexing operation is currently in progress for branch ${error.branchName || this.config?.branch || 'unknown'}.`,
				);
				console.log(
					'  Your index may be out of date. Re-run this command after the current operation completes.',
				);
				throw error;
			}
			// Provide actionable message for auth failures
			if (error instanceof AuthenticationError) {
				console.error(`\n${RED_X} Authentication failed.`);
				console.log(
					`${BLUE_INFO} Your access key may be invalid or expired. Run 'constellation auth'\n` +
						`  to set or update your access key.`,
				);
				throw error;
			}
			// Access key not configured — already displayed by getAccessKey()
			if (
				error instanceof Error &&
				error.message === 'Access key not configured'
			) {
				throw error;
			}
			const errorMessage =
				error instanceof Error ? error.message : 'An unexpected error occurred';
			console.error(`${RED_X} Indexing failed: ${errorMessage}`);
			throw error;
		}
	}

	/**
	 * Get access key from system environment variables
	 * @returns Access key if found
	 * @throws When access key not found
	 */
	private async getAccessKey() {
		const accessKey = await this.env!.getKey(ACCESS_KEY_ENV_VAR);

		if (!accessKey) {
			console.error(`\n${RED_X} Access key not found.`);
			console.log(
				`${BLUE_INFO} Set the ${ACCESS_KEY_ENV_VAR} environment variable or run\n` +
					`  'constellation auth' to configure your access key.`,
			);
			throw new Error('Access key not configured');
		}
		return accessKey;
	}

	/**
	 * Validates that the configured project ID is registered and accessible
	 * for the current user. Exits early with actionable messaging if not.
	 * @throws ProjectValidationError if project is not registered, inactive, or has invalid ID
	 * @throws AuthenticationError if authentication fails
	 * @throws Error if the API is unreachable
	 */
	private async validateProject(): Promise<void> {
		console.log(`${BLUE_INFO} Validating project access...`);

		try {
			await this.apiClient!.getProjectState();
			console.log(`${GREEN_CHECK} Project validated successfully`);
		} catch (error) {
			if (error instanceof ProjectValidationError) {
				this.displayProjectValidationError(error);
				throw error;
			}
			// NotFoundError = project is valid but not yet indexed — normal for first-time indexing
			if (error instanceof NotFoundError) {
				console.log(`${GREEN_CHECK} Project validated (first index)`);
				return;
			}
			// AuthenticationError — re-throw, handled by outer catch
			if (error instanceof AuthenticationError) {
				throw error;
			}
			// Connectivity or unexpected errors — fail fast with clear messaging
			const message = error instanceof Error ? error.message : String(error);
			const isNetworkError =
				message === 'fetch failed' ||
				message.includes('ECONNREFUSED') ||
				message.includes('ENOTFOUND') ||
				message.includes('ETIMEDOUT') ||
				message.includes('EHOSTUNREACH') ||
				message.includes('ECONNRESET');

			if (isNetworkError) {
				throw new Error(
					'Unable to connect to the Constellation service.\n' +
						`  Verify your network connection and that the API URL is correct.`,
				);
			}
			throw error;
		}
	}

	/**
	 * Displays a formatted, actionable error message for project validation failures.
	 * @param error The project validation error with code and project ID
	 */
	private displayProjectValidationError(error: ProjectValidationError): void {
		const projectId = error.projectId || this.config!.projectId;
		const truncatedId =
			projectId.length > 40 ? projectId.substring(0, 37) + '...' : projectId;

		switch (error.code) {
			case 'PROJECT_NOT_REGISTERED':
				console.error(`\n${RED_X} Project not registered\n`);
				console.error(
					`  The project ID "${truncatedId}" in constellation.json`,
				);
				console.error(`  is not associated with your Constellation account.\n`);
				console.error(`  To resolve this:`);
				console.error(
					`  1. Verify the project exists at https://app.constellationdev.io`,
				);
				console.error(
					`  2. Check that the project ID in constellation.json is correct`,
				);
				console.error(`  3. Run 'constellation index' again\n`);
				break;
			case 'PROJECT_INACTIVE':
				console.error(`\n${RED_X} Project is inactive\n`);
				console.error(`  The project "${truncatedId}" has been deactivated.\n`);
				console.error(`  To resolve this:`);
				console.error(
					`  1. Reactivate the project at https://app.constellationdev.io`,
				);
				console.error(`  2. Run 'constellation index' again\n`);
				break;
			case 'INVALID_PROJECT_ID':
				console.error(`\n${RED_X} Invalid project ID\n`);
				console.error(
					`  The project ID "${truncatedId}" in constellation.json`,
				);
				console.error(`  is not a valid Constellation project identifier.\n`);
				console.error(`  To resolve this:`);
				console.error(
					`  1. Get your project ID from https://app.constellationdev.io`,
				);
				console.error(`  2. Update the projectId field in constellation.json`);
				console.error(`  3. Run 'constellation index' again\n`);
				break;
			default:
				console.error(
					`\n${RED_X} Project validation failed: ${error.message}\n`,
				);
		}
	}

	/**
	 * Validates that the current git branch is configured for indexing.
	 * @throws Error if current branch is not configured in constellation.json
	 */
	private async validateGitBranch(): Promise<void> {
		console.log(`${BLUE_INFO} Validating Git repository and branch...`);

		const status = await this.git!.status();
		const currentBranch = status.currentBranch;

		// Use the validation method from ConstellationConfig
		this.config!.validateBranch(currentBranch);

		console.log(
			`${GREEN_CHECK} Current branch "${currentBranch}" is configured for indexing`,
		);
	}

	/**
	 * Validates git working tree is clean with no pending changes.
	 * @throws Error if there are uncommitted changes in the working tree
	 */
	private async validateGitStatus(): Promise<void> {
		console.log(`${BLUE_INFO} Validating Git status...`);

		const status = await this.git!.status();

		if (!status.clean) {
			throw new Error(
				'Outstanding changes detected.\n' +
					'  Commit or stash changes first to ensure consistent indexing.',
			);
		}

		console.log(`${GREEN_CHECK} Working tree clean`);
	}

	/**
	 * Synchronizes local repository with remote changes.
	 * Handles conflicts gracefully and provides clear error messages.
	 * @throws Process exits with error code 1 if pull fails
	 */
	private async synchronizeChanges(): Promise<void> {
		console.log(`${BLUE_INFO} Synchronizing latest changes...`);

		try {
			const pullSuccessful = await this.git!.pull();

			if (pullSuccessful) {
				console.log(`${GREEN_CHECK} Repository synchronized successfully`);
			}
		} catch (error) {
			// Log the error details that were already logged by GitClient
			console.error(`${RED_X} Failed to synchronize repository`);

			// Provide actionable guidance based on error type
			if (error instanceof Error) {
				if (error.message.includes('uncommitted changes')) {
					console.error('\nTo resolve:');
					console.error(
						'  1. Commit your changes: git add . && git commit -m "your message"',
					);
					console.error('  2. Or stash them: git stash');
					console.error('  3. Then run the index command again\n');
				} else if (error.message.includes('merge conflicts')) {
					console.error('\nTo resolve:');
					console.error('  1. Fix the conflicted files manually');
					console.error(
						'  2. Stage the resolved files: git add <resolved-files>',
					);
					console.error('  3. Complete the merge: git commit');
					console.error('  4. Then run the index command again\n');
				} else if (error.message.includes('Network error')) {
					console.error(
						'\nPlease check your internet connection and try again\n',
					);
				} else if (error.message.includes('Authentication')) {
					console.error('\nPlease check your git credentials and try again\n');
				}
			}

			// Re-throw to allow proper cleanup and error handling
			throw error;
		}
	}

	/**
	 * Determines whether to perform a full or incremental index.
	 * @param forceFullIndex If true, forces a full index
	 * @returns Object indicating if index is up-to-date and whether to use incremental mode
	 */
	private async determineIndexScope(
		forceFullIndex: boolean,
	): Promise<{ isIncremental: boolean; upToDate: boolean }> {
		if (forceFullIndex) {
			return { isIncremental: false, upToDate: false }; // Not incremental
		}

		console.log(`${BLUE_INFO} Determining index scope...`);

		try {
			// Try to get last indexed commit from API
			const projectState = await this.apiClient!.getProjectState();
			const lastIndexedCommit = projectState?.latestCommit;

			if (!lastIndexedCommit) {
				console.log(
					`${BLUE_INFO} No previous index found - performing full index`,
				);
				return { isIncremental: false, upToDate: false }; // Full index needed
			}

			// Check if commit still exists in history
			const currentCommit = await this.git!.getLatestCommitHash();
			if (lastIndexedCommit === currentCommit) {
				console.log(`${GREEN_CHECK} Already up to date`);
				return { isIncremental: true, upToDate: true }; // Nothing to do
			}

			console.log(
				`${BLUE_INFO} Last indexed commit: ${lastIndexedCommit.substring(0, 8)}`,
			);
			console.log(
				`${BLUE_INFO} Current commit: ${currentCommit.substring(0, 8)}`,
			);

			console.log(
				`${BLUE_INFO} Performing incremental index starting from commit ${lastIndexedCommit.substring(0, 8)}`,
			);
			return { isIncremental: true, upToDate: false }; // Incremental index
		} catch (error) {
			// Re-throw auth errors - don't silently continue with invalid credentials
			if (error instanceof AuthenticationError) {
				throw error;
			}
			// For other errors, log and default to full index
			console.log(
				`${YELLOW_WARN} Could not determine last index - performing full index`,
			);
			return { isIncremental: false, upToDate: false }; // Default to full index
		}
	}

	/**
	 * Discovers files to be indexed based on incremental or full scan mode.
	 * @param isIncremental If true, only scans changed files since last index
	 * @returns Array of file information for files to be processed
	 */
	private async discoverFiles(isIncremental: boolean): Promise<FileInfo[]> {
		console.log(`${BLUE_INFO} Analyzing codebase...`);

		let files: FileInfo[];

		if (isIncremental) {
			try {
				// Get changed files since last indexed commit
				const projectState = await this.apiClient!.getProjectState();
				if (!projectState?.latestCommit) {
					// Fallback to full scan if we can't get last commit
					console.log(
						`${YELLOW_WARN} Cannot determine changes - falling back to full scan`,
					);
					files = await this.scanner.scanFiles(this.config!);
				} else {
					const changes = await this.git!.getChangedFiles(
						projectState.latestCommit,
					);
					const changedPaths = [
						...changes.added,
						...changes.modified,
						...changes.renamed.map((r) => r.to),
					];

					console.log(
						`${BLUE_INFO} Found ${changedPaths.length} changed files`,
					);
					files = await this.scanner.scanSpecificFiles(
						changedPaths,
						this.config!,
					);

					// Handle deleted files and old paths from renamed files
					const filesToDelete = [
						...changes.deleted,
						...changes.renamed.map((r) => r.from),
					];

					if (filesToDelete.length > 0) {
						const deletedCount = changes.deleted.length;
						const renamedCount = changes.renamed.length;
						const message =
							renamedCount > 0
								? `${BLUE_INFO} Removing ${deletedCount} deleted file(s) and ${renamedCount} renamed file(s) from graph`
								: `${BLUE_INFO} Removing ${deletedCount} deleted file(s) from graph`;
						console.log(message);
						await this.apiClient!.deleteFiles(filesToDelete);
					}
				}
			} catch (error) {
				// Re-throw auth errors - don't silently fall back
				if (error instanceof AuthenticationError) {
					throw error;
				}
				// For other errors, fall back to full scan
				console.log(
					`${YELLOW_WARN} Cannot determine changes - falling back to full scan`,
				);
				files = await this.scanner.scanFiles(this.config!);
			}
		} else {
			// Full scan
			console.log(`${BLUE_INFO} Scanning all project files...`);
			files = await this.scanner.scanFiles(this.config!);
		}

		console.log(`${GREEN_CHECK} Found ${files.length} files to index`);
		return files;
	}

	/**
	 * Generates Abstract Syntax Trees from discovered files.
	 * Uses a promise pool to limit concurrent parsing with adaptive concurrency.
	 * Concurrency is reduced for large projects to prevent memory exhaustion.
	 * @param files Array of files to parse and generate ASTs for
	 * @param onComplete Optional callback invoked after all files are processed
	 * @returns Async generator yielding serialized AST data with compression
	 */
	private async *generateASTs(
		files: FileInfo[],
		onComplete?: () => void,
	): AsyncGenerator<SerializedAST> {
		const timestamp = new Date().toISOString();
		const totalFiles = files.length;
		let processedCount = 0;
		let errorCount = 0;

		console.log(`${BLUE_INFO} Processing ${totalFiles} files...`);

		const currentCommit = await this.git!.getLatestCommitHash();

		// Adaptive concurrency based on project size to prevent OOM
		// Large projects (>10k files) use reduced concurrency to limit memory pressure
		const concurrency = totalFiles > 10000 ? 5 : totalFiles > 5000 ? 7 : 10;
		if (concurrency < 10) {
			console.log(
				`${BLUE_INFO} Large project detected - using concurrency of ${concurrency} to optimize memory usage`,
			);
		}

		// Create promise pool with adaptive concurrency limit
		const pool = new PromisePool<FileInfo, SerializedAST>(concurrency);

		// Process files with concurrent limit
		const results = pool.run(files, async (file, index) => {
			const progress = Math.round(((index + 1) / totalFiles) * 100);
			console.log(
				`${BLUE_INFO} Analyzing file ${file.path.replace(process.cwd() + '/', '')} (${progress}%)...`,
			);

			try {
				// Parse file with tree-sitter to get AST
				const tree = await this.parser.parseFile(file.path, file.language);

				// Get language plugin for this file
				const plugin = this.langRegistry!.getPlugin(file.language);

				// Extract import resolutions using CLI resolver (CLI has tsconfig/jsconfig access)
				let importResolutions;
				if (plugin?.getImportResolver) {
					// Get build config for this file if available
					const buildConfigManager = this.buildConfigManagers.get(
						file.language,
					);
					const buildConfig = buildConfigManager
						? await buildConfigManager.getConfigForFile(file.path)
						: null;

					// Create resolver instance
					const resolver = plugin.getImportResolver(file.path, buildConfig);
					if (resolver) {
						// Extract import resolutions without modifying AST
						const { ImportExtractor } =
							await import('../utils/import-extractor');
						const extractor = new ImportExtractor();
						importResolutions = await extractor.extractImportResolutions(
							tree,
							file.path,
							file.language,
							resolver,
						);
					}
				}

				// Serialize AST as streaming JSON chunks (no intermediate objects in memory)
				// This dramatically reduces memory usage for large files
				const { serializeASTStream } = await import('../utils/ast-serializer');
				const jsonStream = serializeASTStream(
					tree.rootNode,
					undefined,
					file.language,
				);

				// Compress the JSON stream directly
				// Note: Tree will be GC'd after this scope ends
				const compressedAst = await this.compressor.compressStream(jsonStream);

				// Create serialized AST structure (without source code)
				// Normalize file path to canonical format (project-root-relative without leading ./)
				const serializedAST: SerializedAST = {
					file: this.normalizePathToCanonical(file.relativePath),
					language: file.language,
					commit: currentCommit,
					timestamp,
					ast: compressedAst,
					importResolutions, // Include CLI-resolved import metadata
				};

				// Validate AST structure before upload (security + data integrity)
				const parseResult = SerializedASTSchema.safeParse(serializedAST);
				if (!parseResult.success) {
					throw new Error(
						`AST validation failed: ${parseResult.error.issues[0].message}`,
					);
				}

				processedCount++;
				return parseResult.data;
			} catch (error) {
				errorCount++;
				console.error(
					`    ${YELLOW_WARN} Failed to parse ${file.relativePath}: ${(error as Error).message}`,
					error,
				);
				// Re-throw to let PromisePool handle it
				throw error;
			}
		});

		// Yield results as they complete
		for await (const ast of results) {
			yield ast;
		}

		// Display completion statistics
		if (errorCount > 0) {
			console.log(
				`${YELLOW_WARN} Completed parsing with ${errorCount} parsing errors`,
			);
		} else {
			console.log(`${GREEN_CHECK} All files analyzed successfully`);
		}

		// Notify caller that AST generation is complete
		if (onComplete) {
			onComplete();
		}
	}

	/**
	 * Uploads AST data to the Constellation API service.
	 * Processes files individually with compression to optimize network transfer.
	 * @param astDataStream Async generator yielding serialized AST data
	 * @param incremental Whether this is an incremental index
	 * @throws Error if upload fails
	 */
	private async uploadToAPI(
		astDataStream: AsyncGenerator<SerializedAST>,
		incremental: boolean,
		commitHash?: string,
	): Promise<void> {
		const uploadSuccess = await this.apiClient!.streamToApi(
			astDataStream,
			'ast',
			this.config!.projectId,
			this.config!.branch,
			incremental,
			commitHash,
		);
		if (!uploadSuccess) {
			throw new Error('Failed to upload data to Constellation Service');
		}
		console.log(
			`${GREEN_CHECK} Data uploaded to Constellation Service, indexing in progress`,
		);
	}

	/**
	 * Normalizes a file path to canonical format: project-root-relative without leading ./
	 * Ensures consistency across the system for path matching.
	 * Uses normalizeGraphPath to handle cross-platform path separators.
	 * Example: "./libs/indexer/src/index.ts" -> "libs/indexer/src/index.ts"
	 */
	private normalizePathToCanonical(filePath: string): string {
		return normalizeGraphPath(filePath);
	}
}
