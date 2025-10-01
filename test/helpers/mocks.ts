import { jest } from '@jest/globals';
import { ConstellationConfig } from '../../src/config/config';
import { GitClient } from '../../src/utils/git-client';
import { ConstellationClient } from '../../src/api/constellation-client';
import { FileScanner } from '../../src/scanners/file-scanner';

/**
 * Creates a mock ConstellationConfig
 */
export function createMockConfig(overrides?: Partial<ConstellationConfig>): ConstellationConfig {
	return {
		version: '1.0.0',
		namespace: 'test-project',
		branch: 'main',
		languages: {
			typescript: {
				fileExtensions: ['.ts', '.tsx'],
				parserPackage: 'tree-sitter-typescript',
			},
			javascript: {
				fileExtensions: ['.js', '.jsx'],
				parserPackage: 'tree-sitter-javascript',
			},
		},
		exclude: ['node_modules', '.git', 'dist', 'coverage'],
		apiUrl: 'http://localhost:3000',
		apiKey: 'test-api-key',
		...overrides,
	} as ConstellationConfig;
}

/**
 * Creates a mock GitClient
 */
export function createMockGitClient(): jest.Mocked<GitClient> {
	const mock: Partial<jest.Mocked<GitClient>> = {
		init: jest.fn(),
		isGitRepository: jest.fn().mockResolvedValue(true),
		getRemoteUrl: jest.fn().mockResolvedValue('https://github.com/test/repo.git'),
		getNormalizedRemoteUrl: jest.fn().mockResolvedValue('github.com/test/repo'),
		getCurrentBranch: jest.fn().mockResolvedValue('main'),
		getCurrentCommit: jest.fn().mockResolvedValue('abc123'),
		getChangedFiles: jest.fn().mockResolvedValue({
			added: [],
			modified: [],
			deleted: [],
			renamed: [],
			all: [],
		}),
		getTrackedFiles: jest.fn().mockResolvedValue([]),
		getBranchBase: jest.fn().mockResolvedValue('def456'),
		getCommitInfo: jest.fn().mockResolvedValue({
			hash: 'abc123',
			message: 'test commit',
			author: 'Test User',
			timestamp: new Date().toISOString(),
		}),
		getFileHistory: jest.fn().mockResolvedValue([]),
		getRepositoryRoot: jest.fn().mockResolvedValue('/test/repo'),
		hasUncommittedChanges: jest.fn().mockResolvedValue(false),
		hasUntrackedFiles: jest.fn().mockResolvedValue(false),
		pull: jest.fn().mockResolvedValue({ success: true }),
	};

	return mock as jest.Mocked<GitClient>;
}

/**
 * Creates a mock ConstellationClient
 */
export function createMockApiClient(): jest.Mocked<ConstellationClient> {
	const mock: Partial<jest.Mocked<ConstellationClient>> = {
		uploadBatch: jest.fn().mockResolvedValue({ success: true }),
		getProject: jest.fn().mockResolvedValue({
			id: 'test-project',
			name: 'Test Project',
			created: new Date().toISOString(),
		}),
		createProject: jest.fn().mockResolvedValue({
			id: 'test-project',
			name: 'Test Project',
		}),
		deleteProject: jest.fn().mockResolvedValue({ success: true }),
		getSymbols: jest.fn().mockResolvedValue([]),
		getRelationships: jest.fn().mockResolvedValue([]),
		searchSymbols: jest.fn().mockResolvedValue([]),
		getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
		validateApiKey: jest.fn().mockResolvedValue(true),
		getApiVersion: jest.fn().mockResolvedValue('1.0.0'),
	};

	return mock as jest.Mocked<ConstellationClient>;
}

/**
 * Creates a mock FileScanner
 */
export function createMockFileScanner(): jest.Mocked<FileScanner> {
	const mock: Partial<jest.Mocked<FileScanner>> = {
		scanFiles: jest.fn().mockResolvedValue([]),
		scanSpecificFiles: jest.fn().mockResolvedValue([]),
	};

	return mock as jest.Mocked<FileScanner>;
}

/**
 * Mock Tree-sitter parser language
 */
export function createMockLanguage() {
	return {
		name: 'typescript',
		parse: jest.fn(),
	};
}

/**
 * Mock command context for testing commands
 */
export interface MockCommandContext {
	config: ConstellationConfig;
	gitClient: jest.Mocked<GitClient>;
	apiClient: jest.Mocked<ConstellationClient>;
	fileScanner: jest.Mocked<FileScanner>;
	outputSpy: jest.SpyInstance;
	errorSpy: jest.SpyInstance;
}

/**
 * Creates a complete mock command context
 */
export function createMockCommandContext(): MockCommandContext {
	return {
		config: createMockConfig(),
		gitClient: createMockGitClient(),
		apiClient: createMockApiClient(),
		fileScanner: createMockFileScanner(),
		outputSpy: jest.spyOn(console, 'log').mockImplementation(),
		errorSpy: jest.spyOn(console, 'error').mockImplementation(),
	};
}

/**
 * Mock environment variables
 */
export function mockEnv(vars: Record<string, string>) {
	const original = { ...process.env };

	beforeEach(() => {
		Object.assign(process.env, vars);
	});

	afterEach(() => {
		// Restore original env
		Object.keys(vars).forEach(key => {
			if (original[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original[key];
			}
		});
	});
}

/**
 * Creates a mock AST node
 */
export function createMockASTNode(overrides?: any) {
	return {
		type: 'function_declaration',
		startPosition: { row: 0, column: 0 },
		endPosition: { row: 5, column: 1 },
		startIndex: 0,
		endIndex: 100,
		childCount: 2,
		children: [],
		namedChildCount: 2,
		namedChildren: [],
		text: 'function test() {}',
		...overrides,
	};
}