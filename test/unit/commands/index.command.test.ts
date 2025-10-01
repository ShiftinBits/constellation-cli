import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import IndexCommand from '../../../src/commands/index.command';
import { ConstellationConfig } from '../../../src/config/config';
import { LanguageRegistry } from '../../../src/languages/language.registry';
import { CrossPlatformEnvironment } from '../../../src/env/env-manager';
import { GitClient } from '../../../src/utils/git-client';
import { ConstellationClient } from '../../../src/api/constellation-client';
import { FileScanner } from '../../../src/scanners/file-scanner';
import { SourceParser } from '../../../src/parsers/source.parser';
import { ACCESS_KEY_ENV_VAR } from '../../../src/utils/constants';

// Mock @scure/base to avoid ESM issues
jest.mock('@scure/base', () => ({
	base32: {
		encode: jest.fn((buffer: Buffer) => buffer.toString('base64').replace(/=/g, '')),
		decode: jest.fn((str: string) => Buffer.from(str, 'base64'))
	}
}));

// Mock all dependencies
jest.mock('../../../src/utils/git-client');
jest.mock('../../../src/env/env-manager');
jest.mock('../../../src/languages/language.registry');
jest.mock('../../../src/scanners/file-scanner');
jest.mock('../../../src/parsers/source.parser');
jest.mock('../../../src/api/constellation-client');
jest.mock('../../../src/utils/ast-compressor');
jest.mock('../../../src/utils/ast-serializer', () => ({
	serializeAST: jest.fn(() => ({ type: 'program', children: [] }))
}));

describe('IndexCommand', () => {
	let mockConfig: ConstellationConfig;
	let mockGit: jest.Mocked<GitClient>;
	let mockEnv: jest.Mocked<CrossPlatformEnvironment>;
	let mockLangRegistry: LanguageRegistry;
	let mockApiClient: jest.Mocked<ConstellationClient>;
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
	let processExitSpy: jest.SpiedFunction<typeof process.exit>;

	beforeEach(() => {
		// Spy on console methods
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

		// Create mock config
		mockConfig = {
			apiUrl: 'https://api.test.com',
			namespace: 'test-project',
			branch: 'main',
			languages: {
				javascript: { fileExtensions: ['.js'] },
				typescript: { fileExtensions: ['.ts'] }
			},
			validate: jest.fn(),
			validateBranch: jest.fn()
		} as any;

		// Create mock git client
		mockGit = {
			// @ts-expect-error - Jest mock typing
			status: jest.fn().mockResolvedValue({
				currentBranch: 'main',
				clean: true
			}),
			// @ts-expect-error - Jest mock typing
			pull: jest.fn().mockResolvedValue(true),
			// @ts-expect-error - Jest mock typing
			getLatestCommitHash: jest.fn().mockResolvedValue('abc123'),
			// @ts-expect-error - Jest mock typing
			getChangedFiles: jest.fn().mockResolvedValue({
				added: [],
				modified: [],
				deleted: [],
				renamed: []
			})
		} as any;

		// Create mock environment
		mockEnv = {
			// @ts-expect-error - Jest mock typing
			getKey: jest.fn().mockResolvedValue('test-access-key'),
			setKey: jest.fn()
		} as any;

		// Create mock language registry
		mockLangRegistry = new LanguageRegistry(mockConfig);

		// Create mock API client
		mockApiClient = {
			// @ts-expect-error - Jest mock typing
			getProjectState: jest.fn().mockResolvedValue(null),
			// @ts-expect-error - Jest mock typing
			deleteFiles: jest.fn().mockResolvedValue(undefined),
			// @ts-expect-error - Jest mock typing
			streamToApi: jest.fn().mockResolvedValue(true)
		} as any;

		// Mock ConstellationClient constructor
		(ConstellationClient as jest.MockedClass<typeof ConstellationClient>).mockImplementation(() => mockApiClient);

		// Mock FileScanner
		(FileScanner as jest.MockedClass<typeof FileScanner>).mockImplementation(() => ({
			// @ts-expect-error - Jest mock typing
			scanFiles: jest.fn().mockResolvedValue([
				{ path: '/test/file1.ts', relativePath: 'file1.ts', language: 'typescript' }
			]),
			// @ts-expect-error - Jest mock typing
			scanSpecificFiles: jest.fn().mockResolvedValue([])
		} as any));

		// Mock SourceParser
		(SourceParser as jest.MockedClass<typeof SourceParser>).mockImplementation(() => ({
			// @ts-expect-error - Jest mock typing
			parseFile: jest.fn().mockResolvedValue({
				rootNode: { type: 'program' }
			})
		} as any));
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		processExitSpy.mockRestore();
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create IndexCommand with valid dependencies', () => {
			const command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			expect(command).toBeInstanceOf(IndexCommand);
		});

		it('should throw error when config is missing', () => {
			expect(() => new IndexCommand({
				Config: undefined as any,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			})).toThrow('index command requires a valid configuration');
		});

		it('should throw error when language registry is missing', () => {
			expect(() => new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: undefined as any
			})).toThrow('index command requires a valid configuration');
		});
	});

	describe('run', () => {
		let command: IndexCommand;

		beforeEach(() => {
			command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});
		});

		it('should complete full indexing successfully', async () => {
			await command.run(false);

			expect(mockEnv.getKey).toHaveBeenCalledWith(ACCESS_KEY_ENV_VAR);
			expect(mockGit.status).toHaveBeenCalled();
			expect(mockGit.pull).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Starting indexing procedure'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should complete forced full indexing', async () => {
			await command.run(true);

			expect(mockApiClient.streamToApi).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should handle missing access key', async () => {
			mockEnv.getKey.mockResolvedValue(undefined);

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Access key not found'));
		});

		it('should handle git branch validation error', async () => {
			mockConfig.validateBranch = jest.fn().mockImplementation(() => {
				throw new Error('Branch not configured');
			});

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Branch not configured'));
		});

		it('should handle git pull failure with uncommitted changes', async () => {
			mockGit.pull.mockRejectedValue(new Error('Pull failed: uncommitted changes detected'));

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to synchronize'));
		});

		it('should handle git pull failure with merge conflicts', async () => {
			mockGit.pull.mockRejectedValue(new Error('Pull failed: merge conflicts detected'));

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Fix the conflicted files'));
		});

		it('should handle git pull failure with network error', async () => {
			mockGit.pull.mockRejectedValue(new Error('Network error: connection timeout'));

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('check your internet connection'));
		});

		it('should handle git pull failure with authentication error', async () => {
			mockGit.pull.mockRejectedValue(new Error('Authentication failed: invalid credentials'));

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('check your git credentials'));
		});

		it('should discover and scan files during indexing', async () => {
			await command.run(false);

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const scannerInstance = (FileScanner as jest.MockedClass<typeof FileScanner>).mock.results[0]?.value;

			expect(scannerInstance.scanFiles).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should handle generic error during indexing', async () => {
			mockGit.status.mockRejectedValue(new Error('Unexpected error'));

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing failed'));
		});

		it('should handle error with no message', async () => {
			mockGit.status.mockRejectedValue({ toString: () => 'Error object' });

			await command.run();

			expect(processExitSpy).toHaveBeenCalledWith(1);
		});
	});

	describe('incremental indexing', () => {
		let command: IndexCommand;

		beforeEach(() => {
			command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});
		});

		it('should perform full index when no project state exists', async () => {
			// No previous index found
			mockApiClient.getProjectState.mockResolvedValue(null);

			await command.run(false);

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const scannerInstance = (FileScanner as jest.MockedClass<typeof FileScanner>).mock.results[0]?.value;

			// Should call scanFiles for full index
			expect(scannerInstance.scanFiles).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No previous index found'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should perform incremental index when project state exists', async () => {
			// Mock existing project state
			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: 'old-commit-123',
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript']
			});

			// Mock changed files
			mockGit.getChangedFiles.mockResolvedValue({
				added: ['src/new-file.ts'],
				modified: ['src/existing-file.ts'],
				deleted: ['src/deleted-file.ts'],
				renamed: [{ from: 'src/old-name.ts', to: 'src/new-name.ts' }]
			});

			// Mock current commit
			mockGit.getLatestCommitHash.mockResolvedValue('new-commit-456');

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const mockScannerInstance: any = {
				// @ts-expect-error - Jest mock typing
				scanFiles: jest.fn().mockResolvedValue([]),
				// @ts-expect-error - Jest mock typing
				scanSpecificFiles: jest.fn().mockResolvedValue([
					{ path: '/test/src/new-file.ts', relativePath: 'src/new-file.ts', language: 'typescript' },
					{ path: '/test/src/existing-file.ts', relativePath: 'src/existing-file.ts', language: 'typescript' },
					{ path: '/test/src/new-name.ts', relativePath: 'src/new-name.ts', language: 'typescript' }
				])
			};

			(FileScanner as jest.MockedClass<typeof FileScanner>).mockImplementation(() => mockScannerInstance as any);

			command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			await command.run(false);

			// Should call scanSpecificFiles for incremental index
			expect(mockScannerInstance.scanSpecificFiles).toHaveBeenCalledWith(
				['src/new-file.ts', 'src/existing-file.ts', 'src/new-name.ts'],
				mockConfig
			);

			// Should delete removed files
			expect(mockApiClient.deleteFiles).toHaveBeenCalledWith(['src/deleted-file.ts']);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Performing incremental index'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 3 changed files'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1 files deleted'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should skip indexing when already up to date', async () => {
			const currentCommit = 'same-commit-123';

			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: currentCommit,
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript']
			});

			mockGit.getLatestCommitHash.mockResolvedValue(currentCommit);

			await command.run(false);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Already up to date'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should fallback to full index when getProjectState fails', async () => {
			mockApiClient.getProjectState.mockRejectedValue(new Error('API error'));

			await command.run(false);

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const scannerInstance = (FileScanner as jest.MockedClass<typeof FileScanner>).mock.results[0]?.value;

			expect(scannerInstance.scanFiles).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Could not determine last index'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('performing full index'));
		});

		it('should fallback to full scan when projectState has empty commit in determineIndexScope', async () => {
			// Mock project state with empty commit field
			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: '', // Empty commit triggers fallback in determineIndexScope
				fileCount: 0,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: []
			});

			mockGit.getLatestCommitHash.mockResolvedValue('new-commit-456');

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const mockScannerInstance: any = {
				// @ts-expect-error - Jest mock typing
				scanFiles: jest.fn().mockResolvedValue([
					{ path: '/test/file1.ts', relativePath: 'file1.ts', language: 'typescript' }
				]),
				// @ts-expect-error - Jest mock typing
				scanSpecificFiles: jest.fn().mockResolvedValue([])
			};

			(FileScanner as jest.MockedClass<typeof FileScanner>).mockImplementation(() => mockScannerInstance as any);

			command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			await command.run(false);

			// Should fall back to full scan via determineIndexScope
			expect(mockScannerInstance.scanFiles).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('No previous index found'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('performing full index'));
		});


		it('should force full index when forceFullIndex is true', async () => {
			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: 'old-commit-123',
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript']
			});

			await command.run(true);

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const scannerInstance = (FileScanner as jest.MockedClass<typeof FileScanner>).mock.results[0]?.value;

			// Should call scanFiles even though project state exists
			expect(scannerInstance.scanFiles).toHaveBeenCalled();
			// Should not call getProjectState since we're forcing full index
			// (Note: getProjectState might still be called, but we shouldn't use incremental logic)
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});

		it('should handle incremental index with only added files', async () => {
			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: 'old-commit-123',
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript']
			});

			mockGit.getChangedFiles.mockResolvedValue({
				added: ['src/new-file.ts'],
				modified: [],
				deleted: [],
				renamed: []
			});

			mockGit.getLatestCommitHash.mockResolvedValue('new-commit-456');

			await command.run(false);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 changed files'));
			expect(mockApiClient.deleteFiles).not.toHaveBeenCalled();
		});

		it('should handle incremental index with only deleted files', async () => {
			mockApiClient.getProjectState.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				latestCommit: 'old-commit-123',
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript']
			});

			mockGit.getChangedFiles.mockResolvedValue({
				added: [],
				modified: [],
				deleted: ['src/deleted-file.ts'],
				renamed: []
			});

			mockGit.getLatestCommitHash.mockResolvedValue('new-commit-456');

			const FileScanner = require('../../../src/scanners/file-scanner').FileScanner;
			const mockScannerInstance: any = {
				// @ts-expect-error - Jest mock typing
				scanFiles: jest.fn().mockResolvedValue([]),
				// @ts-expect-error - Jest mock typing
				scanSpecificFiles: jest.fn().mockResolvedValue([])
			};

			(FileScanner as jest.MockedClass<typeof FileScanner>).mockImplementation(() => mockScannerInstance as any);

			command = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			await command.run(false);

			expect(mockApiClient.deleteFiles).toHaveBeenCalledWith(['src/deleted-file.ts']);
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('1 files deleted'));
			// Found 0 changed files because only deleted files exist
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Found 0 changed files'));
		});
	});

	describe('integration', () => {
		it('should handle upload failure', async () => {
			mockApiClient.streamToApi.mockResolvedValue(false);

			const testCommand = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			await testCommand.run(false);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upload'));
		});

		it('should complete successfully with valid configuration', async () => {
			const testCommand = new IndexCommand({
				Config: mockConfig,
				GitClient: mockGit,
				Environment: mockEnv,
				LanguageRegistry: mockLangRegistry
			});

			await testCommand.run(false);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Indexing complete'));
		});
	});
});
