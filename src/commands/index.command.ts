import { ConstellationClient } from '../api/constellation-client';
import { SourceParser } from '../parsers/source.parser';
import { FileInfo, FileScanner } from '../scanners/file-scanner';
import { SerializedAST } from '../types/api';
import { ASTCompressor } from '../utils/ast-compressor';
import { serializeAST } from '../utils/ast-serializer';
import { ACCESS_KEY_ENV_VAR } from '../utils/constants';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING,
	YELLOW_WARN
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

			console.log(`${YELLOW_LIGHTNING}Starting indexing procedure...\n`);

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

			// Step 4: Determine Index Scope
			const indexScopeResult = await this.determineIndexScope(forceFullIndex);

			// Exit early if already up-to-date
			if (indexScopeResult.upToDate) {
				const currentCommit = await this.git!.getLatestCommitHash();
				console.log(`\n${GREEN_CHECK} Index is already up-to-date for ${this.config!.namespace} on ${this.config!.branch} commit ${currentCommit.substring(0, 8)}`);
				return;
			}

			// Step 5: Analyze Codebase
			const files = await this.discoverFiles(indexScopeResult.isIncremental);
			const astDataStream = this.generateASTs(files);

			// Step 6: Transmit to API
			await this.uploadToAPI(astDataStream, indexScopeResult.isIncremental);

			console.log(`\n${GREEN_CHECK} Indexing complete!`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
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
			throw new Error(
				'Access key not found.\n' +
				`${BLUE_INFO} To configure your access key, set ${ACCESS_KEY_ENV_VAR} environment\n` +
				`  variable to the value of your access key or run 'constellation auth'.`
			);
		}
		return accessKey;
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

		console.log(`${GREEN_CHECK} Current branch "${currentBranch}" is configured for indexing`);
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
				'  Commit or stash changes first to ensure consistent indexing.'
			);
		}

		console.log(`  ${GREEN_CHECK} Working tree clean`);
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
				console.log(`  ${GREEN_CHECK} Repository synchronized successfully`);
			}
		} catch (error) {
			// Log the error details that were already logged by GitClient
			console.error(`  ${RED_X} Failed to synchronize repository`);

			// Provide actionable guidance based on error type
			if (error instanceof Error) {
				if (error.message.includes('uncommitted changes')) {
					console.error('\nTo resolve:');
					console.error('  1. Commit your changes: git add . && git commit -m "your message"');
					console.error('  2. Or stash them: git stash');
					console.error('  3. Then run the index command again\n');
				} else if (error.message.includes('merge conflicts')) {
					console.error('\nTo resolve:');
					console.error('  1. Fix the conflicted files manually');
					console.error('  2. Stage the resolved files: git add <resolved-files>');
					console.error('  3. Complete the merge: git commit');
					console.error('  4. Then run the index command again\n');
				} else if (error.message.includes('Network error')) {
					console.error('\nPlease check your internet connection and try again\n');
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
	private async determineIndexScope(forceFullIndex: boolean): Promise<{ isIncremental: boolean; upToDate: boolean }> {
		if (forceFullIndex) {
			return { isIncremental: false, upToDate: false }; // Not incremental
		}

		console.log(`${BLUE_INFO} Determining index scope...`);

		try {
			// Try to get last indexed commit from API
			const projectState = await this.apiClient!.getProjectState();
			const lastIndexedCommit = projectState?.latestCommit;

			if (!lastIndexedCommit) {
				console.log(`  ${BLUE_INFO} No previous index found - performing full index`);
				return { isIncremental: false, upToDate: false }; // Full index needed
			}

			// Check if commit still exists in history
			const currentCommit = await this.git!.getLatestCommitHash();
			if (lastIndexedCommit === currentCommit) {
				console.log(`  ${GREEN_CHECK} Already up to date`);
				return { isIncremental: true, upToDate: true }; // Nothing to do
			}

			console.log(`  ${BLUE_INFO} Last indexed commit: ${lastIndexedCommit.substring(0, 8)}`);
			console.log(`  ${BLUE_INFO} Current commit: ${currentCommit.substring(0, 8)}`);

			console.log(`${BLUE_INFO} Performing incremental index starting from commit ${lastIndexedCommit.substring(0, 8)}`);
			return { isIncremental: true, upToDate: false }; // Incremental index
		} catch (error) {
			// For errors, log and default to full index
			console.log(`${YELLOW_WARN} Could not determine last index - performing full index`);
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
			// Get changed files since last indexed commit
			const projectState = await this.apiClient!.getProjectState();
			if (!projectState?.latestCommit) {
				// Fallback to full scan if we can't get last commit
				console.log(`  ${YELLOW_WARN} Cannot determine changes - falling back to full scan`);
				files = await this.scanner.scanFiles(this.config!);
			} else {
				const changes = await this.git!.getChangedFiles(projectState.latestCommit);
				const changedPaths = [
					...changes.added,
					...changes.modified,
					...changes.renamed.map(r => r.to)
				];

				console.log(`  ${BLUE_INFO} Found ${changedPaths.length} changed files`);
				files = await this.scanner.scanSpecificFiles(changedPaths, this.config!);

				// Handle deleted files separately
				if (changes.deleted.length > 0) {
					console.log(`  ${BLUE_INFO} ${changes.deleted.length} files deleted`);
					await this.apiClient!.deleteFiles(changes.deleted);
				}
			}
		} else {
			// Full scan
			console.log(`  ${BLUE_INFO} Scanning all project files...`);
			files = await this.scanner.scanFiles(this.config!);
		}

		console.log(`  ${GREEN_CHECK} Found ${files.length} files to index`);
		return files;
	}

	/**
	 * Generates Abstract Syntax Trees from discovered files.
	 * @param files Array of files to parse and generate ASTs for
	 * @returns Array of serialized AST data with compression
	 */
	private async* generateASTs(files: FileInfo[]): AsyncGenerator<SerializedAST> {
		const timestamp = new Date().toISOString();
		const totalFiles = files.length;
		let processedCount = 0;
		let errorCount = 0;

		console.log(`  ${BLUE_INFO} Generating ASTs from ${totalFiles} files...`);

		const currentCommit = await this.git!.getLatestCommitHash();

		// Process files individually
		for (let i = 0; i < totalFiles; i++) {
			const file = files[i];

			const progress = Math.round(((i + 1) / totalFiles) * 100);
			console.log(`  ${BLUE_INFO} Processing file ${file.path.replace(process.cwd(), '')} (${progress}%)...`);

			try {
				// Parse file with tree-sitter to get AST
				const tree = await this.parser.parseFile(file.path, file.language);

				const serializedAstNode = serializeAST(tree.rootNode);

				const compressedAst = await this.compressor.compress(serializedAstNode);

				// Create serialized AST structure (without source code)
				const serializedAST: SerializedAST = {
					file: file.relativePath,
					language: file.language,
					commit: currentCommit,
					timestamp,
					ast: compressedAst
				};

				yield serializedAST;
				processedCount++;

			} catch (error) {
				errorCount++;
				console.error(`    ${YELLOW_WARN} Failed to parse ${file.relativePath}: ${(error as Error).message}`, error);
			}
		}

		if (errorCount > 0) {
			console.log(`  ${YELLOW_WARN} Completed parsing with ${errorCount} parsing errors`);
		} else {
			console.log(`  ${GREEN_CHECK} All files processed successfully`);
		}
	}


	/**
	 * Uploads AST data to the Constellation API service.
	 * Processes files individually with compression to optimize network transfer.
	 * @param astData Array of serialized AST data to upload
	 */
	private async uploadToAPI(astDataStream: AsyncGenerator<SerializedAST>, incremental: boolean): Promise<boolean> {
		const uploadSuccess = await this.apiClient!.streamToApi(astDataStream, 'ast', this.config!.namespace, this.config!.branch, incremental);
		console.log(`${!uploadSuccess ? `${RED_X} Failed to upload` : `${GREEN_CHECK} Successfully uploaded`} data to Constellation Service...`);
		return uploadSuccess;
	}
}
