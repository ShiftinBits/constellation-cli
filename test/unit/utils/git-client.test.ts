import {
	jest,
	describe,
	it,
	beforeEach,
	afterEach,
	expect,
} from '@jest/globals';
import {
	GitClient,
	GitStatus,
	ChangedFiles,
} from '../../../src/utils/git-client';
import {
	SimpleGit,
	StatusResult,
	PullResult,
	LogResult,
	RemoteWithRefs,
	BranchSummary,
} from 'simple-git';

// Mock simple-git module
jest.mock('simple-git');

describe('GitClient', () => {
	let gitClient: GitClient;
	let mockGit: jest.Mocked<SimpleGit>;
	const testPath = '/test/repo';

	// Helper function to create a mock StatusResult
	const createMockStatusResult = (
		overrides: Partial<StatusResult> = {},
	): StatusResult =>
		({
			not_added: [],
			conflicted: [],
			created: [],
			deleted: [],
			modified: [],
			renamed: [],
			files: [],
			staged: [],
			ahead: 0,
			behind: 0,
			current: 'main',
			tracking: null,
			detached: false,
			isClean: () => true,
			...overrides,
		}) as StatusResult;

	beforeEach(() => {
		// Create a mock SimpleGit instance
		mockGit = {
			log: jest.fn(),
			diff: jest.fn(),
			getRemotes: jest.fn(),
			revparse: jest.fn(),
			version: jest.fn(),
			checkIsRepo: jest.fn(),
			branchLocal: jest.fn(),
			add: jest.fn(),
			status: jest.fn(),
			pull: jest.fn(),
		} as unknown as jest.Mocked<SimpleGit>;

		// Mock the simpleGit factory function
		const { simpleGit } = require('simple-git');
		(simpleGit as jest.Mock).mockReturnValue(mockGit);

		gitClient = new GitClient(testPath);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create GitClient with correct options', () => {
			const { simpleGit } = require('simple-git');

			expect(simpleGit).toHaveBeenCalledWith({
				baseDir: testPath,
				maxConcurrentProcesses: 6,
			});
		});
	});

	describe('getLatestCommitHash', () => {
		it('should return the latest commit hash', async () => {
			const expectedHash = 'abc123def456';
			const mockLogResult: LogResult = {
				latest: { hash: expectedHash } as any,
				all: [],
				total: 1,
			};

			mockGit.log.mockResolvedValue(mockLogResult);

			const result = await gitClient.getLatestCommitHash();

			expect(mockGit.log).toHaveBeenCalledWith({ maxCount: 1 });
			expect(result).toBe(expectedHash);
		});

		it('should throw error if no commits found', async () => {
			const mockLogResult: LogResult = {
				latest: null,
				all: [],
				total: 0,
			};

			mockGit.log.mockResolvedValue(mockLogResult);

			await expect(gitClient.getLatestCommitHash()).rejects.toThrow(
				'No commits found in repository',
			);
		});
	});

	describe('getChangedFiles', () => {
		it('should parse git diff output for added files', async () => {
			const diffOutput = 'A\tsrc/new-file.ts\nA\tsrc/another-file.js';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(mockGit.diff).toHaveBeenCalledWith([
				'--name-status',
				'base-commit',
				'HEAD',
			]);
			expect(result).toEqual({
				added: ['src/new-file.ts', 'src/another-file.js'],
				modified: [],
				deleted: [],
				renamed: [],
			});
		});

		it('should parse git diff output for modified files', async () => {
			const diffOutput = 'M\tsrc/existing-file.ts\nM\tsrc/other-file.js';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: [],
				modified: ['src/existing-file.ts', 'src/other-file.js'],
				deleted: [],
				renamed: [],
			});
		});

		it('should parse git diff output for deleted files', async () => {
			const diffOutput = 'D\tsrc/deleted-file.ts\nD\tsrc/old-file.js';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: [],
				modified: [],
				deleted: ['src/deleted-file.ts', 'src/old-file.js'],
				renamed: [],
			});
		});

		it('should parse git diff output for renamed files', async () => {
			const diffOutput =
				'R100\tsrc/old-name.ts\tsrc/new-name.ts\nR90\tlib/old.js\tlib/new.js';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: [],
				modified: [],
				deleted: [],
				renamed: [
					{ from: 'src/old-name.ts', to: 'src/new-name.ts' },
					{ from: 'lib/old.js', to: 'lib/new.js' },
				],
			});
		});

		it('should parse mixed git diff output', async () => {
			const diffOutput =
				'A\tsrc/new.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\nR100\tsrc/old.ts\tsrc/renamed.ts';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: ['src/new.ts'],
				modified: ['src/modified.ts'],
				deleted: ['src/deleted.ts'],
				renamed: [{ from: 'src/old.ts', to: 'src/renamed.ts' }],
			});
		});

		it('should handle empty diff output', async () => {
			mockGit.diff.mockResolvedValue('');

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: [],
				modified: [],
				deleted: [],
				renamed: [],
			});
		});

		it('should handle malformed lines gracefully', async () => {
			const diffOutput =
				'A\tsrc/new.ts\nINVALID_LINE\nM\tsrc/modified.ts\nR100\tincomplete_rename';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: ['src/new.ts'],
				modified: ['src/modified.ts'],
				deleted: [],
				renamed: [],
			});
		});

		it('should handle Windows CRLF line endings in diff output', async () => {
			// Windows git may return CRLF line endings
			const diffOutput =
				'A\tsrc/new-file.ts\r\nM\tsrc/modified-file.ts\r\nD\tsrc/deleted-file.ts\r\n';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: ['src/new-file.ts'],
				modified: ['src/modified-file.ts'],
				deleted: ['src/deleted-file.ts'],
				renamed: [],
			});
		});

		it('should handle mixed LF and CRLF line endings', async () => {
			// Mixed line endings can occur in edge cases
			const diffOutput =
				'A\tsrc/file1.ts\r\nM\tsrc/file2.ts\nD\tsrc/file3.ts\r\n';
			mockGit.diff.mockResolvedValue(diffOutput);

			const result = await gitClient.getChangedFiles('base-commit');

			expect(result).toEqual({
				added: ['src/file1.ts'],
				modified: ['src/file2.ts'],
				deleted: ['src/file3.ts'],
				renamed: [],
			});
		});
	});

	describe('getRemoteOriginUrl', () => {
		it('should return origin fetch URL', async () => {
			const expectedUrl = 'https://github.com/user/repo.git';
			const mockRemotes: RemoteWithRefs[] = [
				{
					name: 'origin',
					refs: {
						fetch: expectedUrl,
						push: expectedUrl,
					},
				},
			];

			mockGit.getRemotes.mockResolvedValue(mockRemotes);

			const result = await gitClient.getRemoteOriginUrl();

			expect(mockGit.getRemotes).toHaveBeenCalledWith(true);
			expect(result).toBe(expectedUrl);
		});

		it('should throw error if origin remote not found', async () => {
			const mockRemotes: RemoteWithRefs[] = [
				{
					name: 'upstream',
					refs: {
						fetch: 'https://github.com/upstream/repo.git',
						push: 'https://github.com/upstream/repo.git',
					},
				},
			];

			mockGit.getRemotes.mockResolvedValue(mockRemotes);

			await expect(gitClient.getRemoteOriginUrl()).rejects.toThrow(
				'Remote origin URL not found or has no fetch URL',
			);
		});

		it('should throw error if origin has no fetch URL', async () => {
			const mockRemotes: RemoteWithRefs[] = [
				{
					name: 'origin',
					refs: {
						fetch: '',
						push: 'https://github.com/user/repo.git',
					},
				},
			];

			mockGit.getRemotes.mockResolvedValue(mockRemotes);

			await expect(gitClient.getRemoteOriginUrl()).rejects.toThrow(
				'Remote origin URL not found or has no fetch URL',
			);
		});
	});

	describe('getRootDir', () => {
		it('should return repository root directory', async () => {
			const expectedRoot = '/path/to/repo';
			mockGit.revparse.mockResolvedValue(`${expectedRoot}\n`);

			const result = await gitClient.getRootDir();

			expect(mockGit.revparse).toHaveBeenCalledWith(['--show-toplevel']);
			expect(result).toBe(expectedRoot);
		});

		it('should return null if not in a git repository', async () => {
			mockGit.revparse.mockRejectedValue(new Error('Not a git repository'));

			const result = await gitClient.getRootDir();

			expect(result).toBeNull();
		});
	});

	describe('isGitAvailable', () => {
		it('should return true if git is available', async () => {
			mockGit.version.mockResolvedValue({
				major: 2,
				minor: 30,
				patch: 0,
				agent: 'git/2.30.0',
				installed: true,
			});

			const result = await gitClient.isGitAvailable();

			expect(mockGit.version).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it('should return false if git is not available', async () => {
			mockGit.version.mockRejectedValue(new Error('git not found'));

			const result = await gitClient.isGitAvailable();

			expect(result).toBe(false);
		});
	});

	describe('isGitRepository', () => {
		it('should return true if in a git repository', async () => {
			mockGit.checkIsRepo.mockResolvedValue(true);

			const result = await gitClient.isGitRepository();

			expect(mockGit.checkIsRepo).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it('should return false if not in a git repository', async () => {
			mockGit.checkIsRepo.mockResolvedValue(false);

			const result = await gitClient.isGitRepository();

			expect(result).toBe(false);
		});

		it('should return false if checkIsRepo throws an error', async () => {
			mockGit.checkIsRepo.mockRejectedValue(
				new Error('Error checking repository'),
			);

			const result = await gitClient.isGitRepository();

			expect(result).toBe(false);
		});
	});

	describe('listBranches', () => {
		it('should return list of local branches', async () => {
			const expectedBranches = ['main', 'feature/test', 'develop'];
			const mockBranchSummary: BranchSummary = {
				all: expectedBranches,
				branches: {},
				current: 'main',
				detached: false,
			};

			mockGit.branchLocal.mockResolvedValue(mockBranchSummary);

			const result = await gitClient.listBranches();

			expect(mockGit.branchLocal).toHaveBeenCalled();
			expect(result).toEqual(expectedBranches);
		});
	});

	describe('stageFile', () => {
		it('should stage a file for commit', async () => {
			const filePath = 'src/test-file.ts';
			mockGit.add.mockResolvedValue('');

			await gitClient.stageFile(filePath);

			expect(mockGit.add).toHaveBeenCalledWith(filePath);
		});
	});

	describe('status', () => {
		it('should return clean status when no files changed', async () => {
			const mockStatusResult = createMockStatusResult({
				files: [],
				current: 'main',
				isClean: () => true,
			});

			mockGit.status.mockResolvedValue(mockStatusResult);

			const result = await gitClient.status();

			expect(mockGit.status).toHaveBeenCalled();
			expect(result).toEqual({
				clean: true,
				currentBranch: 'main',
			});
		});

		it('should return dirty status when files are changed', async () => {
			const mockStatusResult = createMockStatusResult({
				files: [{ path: 'src/changed.ts' } as any],
				current: 'feature/test',
				isClean: () => false,
			});

			mockGit.status.mockResolvedValue(mockStatusResult);

			const result = await gitClient.status();

			expect(result).toEqual({
				clean: false,
				currentBranch: 'feature/test',
			});
		});

		it('should handle null current branch (detached HEAD)', async () => {
			const mockStatusResult = createMockStatusResult({
				files: [],
				current: null,
				isClean: () => true,
			});

			mockGit.status.mockResolvedValue(mockStatusResult);

			const result = await gitClient.status();

			expect(result).toEqual({
				clean: true,
				currentBranch: null,
			});
		});
	});

	describe('pull', () => {
		it('should successfully pull changes', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			const mockPullResult: PullResult = {
				summary: {
					changes: 5,
					insertions: 10,
					deletions: 3,
				},
			} as PullResult;

			// Mock console.log to avoid output during tests
			const consoleSpy = jest
				.spyOn(console, 'log')
				.mockImplementation(() => {});

			mockGit.status.mockResolvedValue(mockStatusResult);
			mockGit.pull.mockResolvedValue(mockPullResult);

			const result = await gitClient.pull();

			expect(mockGit.status).toHaveBeenCalled();
			expect(mockGit.pull).toHaveBeenCalled();
			expect(result).toBe(true);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'Pull successful: 5 files changed, 10 insertions(+), 3 deletions(-)',
				),
			);

			consoleSpy.mockRestore();
		});

		it('should handle pull with no changes (already up to date)', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			const mockPullResult: PullResult = {
				summary: {
					changes: 0,
					insertions: 0,
					deletions: 0,
				},
			} as PullResult;

			mockGit.status.mockResolvedValue(mockStatusResult);
			mockGit.pull.mockResolvedValue(mockPullResult);

			const result = await gitClient.pull();

			expect(result).toBe(true);
		});

		it('should throw error if working directory has uncommitted changes', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => false,
				modified: ['src/modified.ts'],
				created: ['src/new.ts'],
				deleted: ['src/deleted.ts'],
				conflicted: [],
				staged: [],
			});

			// Mock console.error to avoid output during tests
			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockGit.status.mockResolvedValue(mockStatusResult);

			await expect(gitClient.pull()).rejects.toThrow(
				/Cannot pull with uncommitted changes/,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'Cannot pull: Working directory has uncommitted changes',
				),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should throw error if there are conflicted files before pull', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => false,
				modified: [],
				created: [],
				deleted: [],
				conflicted: ['src/conflicted.ts'],
				staged: [],
			});

			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockGit.status.mockResolvedValue(mockStatusResult);

			await expect(gitClient.pull()).rejects.toThrow(
				/Cannot pull with uncommitted changes/,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'   ⚠️  Conflicted files:',
				'src/conflicted.ts',
			);

			consoleErrorSpy.mockRestore();
		});

		it('should throw error if conflicts are detected after pull', async () => {
			const cleanStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			const conflictedStatusResult = createMockStatusResult({
				isClean: () => false,
				conflicted: ['src/conflict.ts'],
			});

			const mockPullResult: PullResult = {
				summary: {
					changes: 0,
					insertions: 0,
					deletions: 0,
				},
			} as PullResult;

			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockGit.status
				.mockResolvedValueOnce(cleanStatusResult) // Initial status check
				.mockResolvedValueOnce(conflictedStatusResult) // After pull check
				.mockResolvedValueOnce(conflictedStatusResult); // Final check

			mockGit.pull.mockResolvedValue(mockPullResult);

			await expect(gitClient.pull()).rejects.toThrow(
				/Pull resulted in merge conflicts/,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Pull failed: Merge conflicts detected'),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle generic git errors gracefully', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockGit.status.mockResolvedValue(mockStatusResult);
			mockGit.pull.mockRejectedValue(
				new Error('Could not resolve host github.com'),
			);

			await expect(gitClient.pull()).rejects.toThrow(
				/Git pull operation failed/,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Pull failed: Network error'),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle authentication errors', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			mockGit.status.mockResolvedValue(mockStatusResult);
			mockGit.pull.mockRejectedValue(new Error('Authentication failed'));

			await expect(gitClient.pull()).rejects.toThrow(
				/Git pull operation failed/,
			);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Pull failed: Authentication error'),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle non-Error objects thrown during pull', async () => {
			const mockStatusResult = createMockStatusResult({
				isClean: () => true,
				conflicted: [],
			});

			mockGit.status.mockResolvedValue(mockStatusResult);
			mockGit.pull.mockRejectedValue('String error message');

			await expect(gitClient.pull()).rejects.toThrow(
				'Git pull operation failed: String error message',
			);
		});
	});
});
