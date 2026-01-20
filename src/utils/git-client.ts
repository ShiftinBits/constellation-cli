import {
	PullResult,
	simpleGit,
	SimpleGit,
	SimpleGitOptions,
	StatusResult,
} from 'simple-git';

/**
 * Git repository status information
 */
export interface GitStatus {
	/** Whether the working directory is clean */
	clean: boolean;
	/** Current branch name or null if detached */
	currentBranch: null | string;
}

/**
 * Changed files information from git diff
 */
export interface ChangedFiles {
	/** Files that were added */
	added: string[];
	/** Files that were modified */
	modified: string[];
	/** Files that were deleted */
	deleted: string[];
	/** Files that were renamed with their old and new paths */
	renamed: Array<{ from: string; to: string }>;
}

/**
 * Client for interacting with Git repositories
 */
export class GitClient {
	private readonly git: SimpleGit;

	/**
	 * Creates a new GitClient instance
	 * @param localPath - Path to the git repository
	 */
	constructor(localPath: string) {
		const options: Partial<SimpleGitOptions> = {
			baseDir: localPath,
			maxConcurrentProcesses: 6,
		};

		this.git = simpleGit(options);
	}

	/**
	 * Gets the hash of the latest commit
	 * @returns SHA hash of the latest commit
	 * @throws If no commits found in repository
	 */
	async getLatestCommitHash(): Promise<string> {
		const log = await this.git.log({ maxCount: 1 });
		if (!log.latest) {
			throw new Error('No commits found in repository');
		}
		return log.latest.hash;
	}

	/**
	 * Gets the list of changed files between two commits
	 * @param baseCommit - Base commit hash to compare against
	 * @returns Object containing arrays of added, modified, deleted, and renamed files
	 */
	async getChangedFiles(baseCommit: string): Promise<ChangedFiles> {
		// Get name-status diff between the base commit and HEAD
		const diff = await this.git.diff(['--name-status', baseCommit, 'HEAD']);

		const result: ChangedFiles = {
			added: [],
			modified: [],
			deleted: [],
			renamed: [],
		};

		// Parse lines like: "A\tpath", "M\tpath", "D\tpath", "R100\told\tnew"
		// Use /\r?\n/ to handle both Unix (LF) and Windows (CRLF) line endings
		const lines = diff
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean);

		for (const line of lines) {
			const parts = line.split('\t');
			if (parts.length < 2) continue;

			const status = parts[0];

			if (status === 'A') {
				result.added.push(parts[1]);
			} else if (status === 'M') {
				result.modified.push(parts[1]);
			} else if (status === 'D') {
				result.deleted.push(parts[1]);
			} else if (status.startsWith('R')) {
				// Renamed files have format: R<percentage>\told\tnew
				if (parts.length >= 3) {
					result.renamed.push({
						from: parts[1],
						to: parts[2],
					});
				}
			}
		}

		return result;
	}

	/**
	 * Gets the remote origin URL
	 * @returns Remote origin fetch URL
	 * @throws If origin remote not found or has no fetch URL
	 */
	async getRemoteOriginUrl(): Promise<string> {
		const remotes = await this.git.getRemotes(true);
		const remote = remotes.find((r) => r.name === 'origin');
		if (!remote || !remote.refs.fetch) {
			throw new Error(`Remote origin URL not found or has no fetch URL`);
		}

		return remote.refs.fetch;
	}

	/**
	 * Gets the root directory of the git repository
	 * @returns Repository root path or null if not in a repository
	 */
	async getRootDir(): Promise<null | string> {
		try {
			const root = await this.git.revparse(['--show-toplevel']);
			return root.trim();
		} catch {
			return null;
		}
	}

	/**
	 * Checks if git is installed and available on the system
	 * @returns True if git is available, false otherwise
	 */
	async isGitAvailable(): Promise<boolean> {
		try {
			await this.git.version();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Checks if the current directory is a git repository
	 * @returns True if in a git repository, false otherwise
	 */
	async isGitRepository(): Promise<boolean> {
		try {
			const isRepo = await this.git.checkIsRepo();
			return isRepo;
		} catch {
			return false;
		}
	}

	/**
	 * Lists all local branches
	 * @returns Array of branch names
	 */
	async listBranches(): Promise<string[]> {
		const branchSummary = await this.git.branchLocal();
		return branchSummary.all;
	}

	/**
	 * Stages a file for commit
	 * @param filePath - Path to the file to stage
	 */
	async stageFile(filePath: string): Promise<void> {
		await this.git.add(filePath);
	}

	/**
	 * Gets the current repository status
	 * @returns Status information including cleanliness and current branch
	 */
	async status(): Promise<GitStatus> {
		const gitStatus: StatusResult = await this.git.status();
		const clean: boolean = gitStatus.files?.length === 0;
		const currentBranch = gitStatus.current;
		return {
			clean,
			currentBranch,
		};
	}

	/**
	 * Pulls latest changes from remote repository with conflict detection
	 * @returns True if pull successful, throws error on failure
	 * @throws If pull fails for any reason (conflicts, network, etc.)
	 */
	async pull(): Promise<boolean> {
		try {
			// First check if there are uncommitted changes that might cause conflicts
			const status = await this.git.status();

			if (!status.isClean()) {
				const details = {
					modified: status.modified.length,
					created: status.created.length,
					deleted: status.deleted.length,
					conflicted: status.conflicted.length,
					staged: status.staged.length,
				};

				console.error(
					'❌ Cannot pull: Working directory has uncommitted changes',
				);
				console.error('   Details:', JSON.stringify(details, null, 2));

				if (status.conflicted.length > 0) {
					console.error(
						'   ⚠️  Conflicted files:',
						status.conflicted.join(', '),
					);
				}

				throw new Error(
					`Cannot pull with uncommitted changes. Please commit or stash your changes first.\n` +
						`Modified: ${details.modified}, Created: ${details.created}, Deleted: ${details.deleted}, ` +
						`Conflicted: ${details.conflicted}, Staged: ${details.staged}`,
				);
			}

			// Attempt the pull operation
			const pullResult: PullResult = await this.git.pull();

			// Check if the pull resulted in conflicts
			if (
				pullResult.summary.changes === 0 &&
				pullResult.summary.insertions === 0 &&
				pullResult.summary.deletions === 0
			) {
				// No changes were pulled - check if we're already up to date
				const afterStatus = await this.git.status();

				if (afterStatus.conflicted.length > 0) {
					console.error('❌ Pull failed: Merge conflicts detected');
					console.error(
						'   Conflicted files:',
						afterStatus.conflicted.join(', '),
					);
					console.error(
						'   Please resolve conflicts manually and commit the result',
					);

					throw new Error(
						`Pull resulted in merge conflicts in ${afterStatus.conflicted.length} file(s): ${afterStatus.conflicted.join(', ')}`,
					);
				}
			}

			// Log successful pull details
			if (pullResult.summary.changes > 0) {
				console.log(
					`✅ Pull successful: ${pullResult.summary.changes} files changed, ` +
						`${pullResult.summary.insertions} insertions(+), ${pullResult.summary.deletions} deletions(-)`,
				);
			}

			// Final check for any unexpected conflicts after pull
			const finalStatus = await this.git.status();
			if (finalStatus.conflicted.length > 0) {
				console.error('❌ Unexpected conflicts after pull:');
				console.error(
					'   Conflicted files:',
					finalStatus.conflicted.join(', '),
				);

				throw new Error(
					`Unexpected merge conflicts detected after pull: ${finalStatus.conflicted.join(', ')}`,
				);
			}

			return true;
		} catch (error) {
			// Enhanced error logging
			if (error instanceof Error) {
				// Check for common git error patterns
				if (error.message.includes('CONFLICT')) {
					console.error('❌ Pull failed due to merge conflicts');
					console.error('   Run "git status" to see conflicted files');
					console.error(
						'   Resolve conflicts, then run "git add" and "git commit"',
					);
				} else if (error.message.includes('not a git repository')) {
					console.error('❌ Pull failed: Not in a git repository');
				} else if (
					error.message.includes('Could not resolve host') ||
					error.message.includes('unable to access')
				) {
					console.error(
						'❌ Pull failed: Network error - unable to reach remote repository',
					);
				} else if (error.message.includes('Authentication failed')) {
					console.error(
						'❌ Pull failed: Authentication error - check your credentials',
					);
				} else if (error.message.includes('uncommitted changes')) {
					// Already handled above, but just in case
					console.error(
						'❌ Pull failed: Uncommitted changes in working directory',
					);
				}

				// Preserve the full error with cause chain
				throw new Error(`Git pull operation failed: ${error.message}`, {
					cause: error,
				});
			}

			// Handle non-Error objects
			throw new Error(`Git pull operation failed: ${String(error)}`);
		}
	}
}
