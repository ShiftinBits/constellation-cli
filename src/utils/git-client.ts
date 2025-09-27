import {
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
			renamed: []
		};

		// Parse lines like: "A\tpath", "M\tpath", "D\tpath", "R100\told\tnew"
		const lines = diff.split('\n').map(l => l.trim()).filter(Boolean);

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
						to: parts[2]
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
	 * Pulls latest changes from remote repository
	 * @returns True if pull successful, throws error on failure
	 * @throws If pull fails for any reason (conflicts, network, etc.)
	 */
	async pull(): Promise<boolean> {
		try {
			await this.git.pull();
			return true;
		} catch (error) {
			throw new Error(`Git pull failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

}
