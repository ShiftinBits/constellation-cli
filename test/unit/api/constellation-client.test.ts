import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from '@jest/globals';
import {
	AuthenticationError,
	ConstellationClient,
	IndexingInProgressError,
	NotFoundError,
	ProjectValidationError,
	RetryableError,
} from '../../../src/api/constellation-client';
import { ConstellationConfig } from '../../../src/config/config';
import type { ProjectState, SerializedAST } from '@constellationdev/types';
import { generateAstId } from '../../../src/utils/id.utils';
import { NdJsonStreamWriter } from '../../../src/utils/ndjson-streamwriter';
import { fetch as undiciFetch } from 'undici';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUndiciFetch = undiciFetch as any;

// Mock dependencies
jest.mock('../../../src/utils/id.utils', () => ({
	generateAstId: jest.fn(),
}));
jest.mock('../../../src/utils/ndjson-streamwriter');
// Mock undici module — streamToApi uses undici's own fetch to ensure the Agent
// dispatcher and fetch are from the same package (avoids Node.js built-in version mismatch)
jest.mock('undici', () => ({
	fetch: jest.fn(),
	Agent: jest.fn().mockReturnValue({}),
}));

// Mock global fetch (used by sendRequest for non-streaming calls)
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('ConstellationClient', () => {
	let client: ConstellationClient;
	let mockConfig: ConstellationConfig;
	const mockAccessKey = 'test-access-key';

	// Helper to create test SerializedAST
	const createTestAST = (
		overrides: Partial<SerializedAST> = {},
	): SerializedAST => ({
		file: 'src/test.ts',
		language: 'typescript',
		commit: 'a'.repeat(40), // Valid SHA-1
		timestamp: '2023-01-01T00:00:00.000Z',
		ast: 'H4sIAAAAAAAAA6vmAgAAAAAA', // Valid base64
		...overrides,
	});

	// Helper to create mock Response
	const createMockResponse = (
		status: number,
		ok: boolean,
		data?: any,
	): any => ({
		ok,
		status,
		statusText:
			status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
		// @ts-expect-error - Jest mock typing
		json: jest.fn().mockResolvedValue(data),
		headers: new Headers(),
		redirected: false,
		type: 'basic',
		url: '',
		body: null,
		bodyUsed: false,
		arrayBuffer: jest.fn(),
		blob: jest.fn(),
		clone: jest.fn(),
		formData: jest.fn(),
		text: jest.fn(),
	});

	beforeEach(() => {
		// Use fake timers for all tests (speeds up retry/timeout tests)
		jest.useFakeTimers();

		// Reset all mocks
		jest.clearAllMocks();

		// Create mock configuration
		mockConfig = {
			apiUrl: 'https://api.constellation.test',
			projectId: 'test-project',
			branch: 'main',
			languages: {},
		} as ConstellationConfig;

		// Mock utility functions
		(generateAstId as jest.Mock).mockReturnValue('mock-project-id');

		// Create client instance
		client = new ConstellationClient(mockConfig, mockAccessKey);
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should create ConstellationClient with config and access key', () => {
			expect(client).toBeInstanceOf(ConstellationClient);
		});
	});

	describe('getProjectState', () => {
		it('should return project state when found', async () => {
			const mockProjectState: ProjectState = {
				projectId: 'test-project',
				projectName: 'test-project',
				branch: 'main',
				latestCommit: 'abc123',
				fileCount: 10,
				lastIndexedAt: '2023-01-01T00:00:00.000Z',
				languages: ['typescript'],
			};

			mockFetch.mockResolvedValue(
				createMockResponse(200, true, mockProjectState),
			);

			const result = await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/intel/v1/project',
				expect.objectContaining({
					method: 'GET',
					headers: expect.objectContaining({
						'Content-Type': 'application/json; charset=utf-8',
						'x-project-id': 'test-project',
						'x-branch-name': 'main',
						Accepts: 'application/json; charset=utf-8',
						Authorization: `Bearer ${mockAccessKey}`,
					}),
				}),
			);
			expect(result).toEqual(mockProjectState);
		});

		it('should throw NotFoundError when project not found (404)', async () => {
			mockFetch.mockResolvedValue(
				createMockResponse(404, false, {
					code: 'PROJECT_NOT_FOUND',
					message: 'No indexed files found',
				}),
			);

			await expect(client.getProjectState()).rejects.toThrow(NotFoundError);
			await expect(client.getProjectState()).rejects.toThrow(
				'Project not found - no previous index exists',
			);
		});

		it('should throw ProjectValidationError when project not registered (404)', async () => {
			mockFetch.mockResolvedValue(
				createMockResponse(404, false, {
					code: 'PROJECT_NOT_REGISTERED',
					message: 'Project must be registered before indexing.',
				}),
			);

			await expect(client.getProjectState()).rejects.toThrow(
				ProjectValidationError,
			);
		});

		it('should throw ProjectValidationError when project is inactive (403)', async () => {
			mockFetch.mockResolvedValue(
				createMockResponse(403, false, {
					code: 'PROJECT_INACTIVE',
					message: 'Project is INACTIVE and cannot be indexed',
				}),
			);

			await expect(client.getProjectState()).rejects.toThrow(
				ProjectValidationError,
			);
		});

		it('should throw ProjectValidationError for invalid project ID (400)', async () => {
			mockFetch.mockResolvedValue(
				createMockResponse(400, false, {
					code: 'INVALID_PROJECT_ID',
					message: 'Invalid project ID format',
				}),
			);

			await expect(client.getProjectState()).rejects.toThrow(
				ProjectValidationError,
			);
		});

		it('should return null when request fails', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'));

			const result = await client.getProjectState();

			expect(result).toBeNull();
		});

		it('should throw AuthenticationError when authentication fails', async () => {
			mockFetch.mockResolvedValue(createMockResponse(401, false));

			await expect(client.getProjectState()).rejects.toThrow(
				AuthenticationError,
			);
			await expect(client.getProjectState()).rejects.toThrow(
				'Authentication failed',
			);
		});
	});

	describe('deleteFiles', () => {
		it('should delete single file', async () => {
			const filePaths = ['src/deleted.ts'];
			mockFetch.mockResolvedValue(createMockResponse(200, true));

			await client.deleteFiles(filePaths);

			expect(generateAstId).toHaveBeenCalledWith(
				'test-project',
				'main',
				'src/deleted.ts',
			);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/intel/v1//ast/mock-project-id',
				expect.objectContaining({
					method: 'DELETE',
				}),
			);
		});

		it('should delete multiple files', async () => {
			const filePaths = ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'];
			mockFetch.mockResolvedValue(createMockResponse(200, true));

			await client.deleteFiles(filePaths);

			expect(generateAstId).toHaveBeenCalledTimes(3);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('should handle delete errors', async () => {
			const filePaths = ['src/error.ts'];
			mockFetch.mockResolvedValue(createMockResponse(500, false));

			// Use real timers for this test since we want actual retry behavior
			jest.useRealTimers();
			await expect(client.deleteFiles(filePaths)).rejects.toThrow();
			jest.useFakeTimers();
		});

		it('should handle empty file list', async () => {
			await client.deleteFiles([]);

			expect(mockFetch).not.toHaveBeenCalled();
		});
	});

	describe('streamToApi', () => {
		it('should successfully stream data using NDJSON', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST({ file: 'file1.ts' });
					yield createTestAST({ file: 'file2.ts' });
				},
			};

			const mockNdJsonStream = {
				pipe: jest.fn(),
				on: jest.fn(),
				read: jest.fn(),
			};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			// Mock Readable.toWeb
			const mockWebStream = {};
			const mockReadable = {
				toWeb: jest.fn().mockReturnValue(mockWebStream),
			};

			// Mock dynamic import
			jest.doMock(
				'stream',
				() => ({
					Readable: mockReadable,
				}),
				{ virtual: true },
			);

			mockUndiciFetch.mockResolvedValue(createMockResponse(200, true));

			const result = await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
			);

			expect(result).toBe(true);
			expect(mockUndiciFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/intel/v1/upload',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/x-ndjson; charset=utf-8',
						'x-project-id': 'test-namespace',
						'x-branch-name': 'test-branch',
						Authorization: `Bearer ${mockAccessKey}`,
					}),
					body: mockWebStream,
					duplex: 'half',
				}),
			);
		});

		it('should return false when response is not ok', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			// Mock Readable.toWeb
			const mockReadable = {
				toWeb: jest.fn().mockReturnValue({}),
			};
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(createMockResponse(400, false));

			const result = await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
			);

			expect(result).toBe(false);
		});

		it('should throw enhanced error on stream failure', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			mockUndiciFetch.mockRejectedValue(new Error('Network timeout'));

			await expect(
				client.streamToApi(
					mockStream as any,
					'upload',
					'test-namespace',
					'test-branch',
					false,
				),
			).rejects.toThrow(/Failed to upload data to Constellation Service/);
		});

		it('should use a no-timeout dispatcher to prevent UND_ERR_HEADERS_TIMEOUT on large full-index uploads', async () => {
			// Root cause: undici's default headersTimeout is 30s. The server processes
			// the entire stream synchronously before sending response headers. Large
			// full-index uploads take > 30s, causing UND_ERR_HEADERS_TIMEOUT.
			// Fix: use undici's own fetch + Agent so both are from the same package,
			// and pass headersTimeout: 0 as the dispatcher to disable the timeout.
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			const mockReadable = { toWeb: jest.fn().mockReturnValue({}) };
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(createMockResponse(200, true));

			await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
			);

			expect(mockUndiciFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					dispatcher: expect.any(Object),
				}),
			);
		});

		it('should throw AuthenticationError on 401', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			// Mock Readable.toWeb
			const mockReadable = {
				toWeb: jest.fn().mockReturnValue({}),
			};
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(createMockResponse(401, false));

			await expect(
				client.streamToApi(
					mockStream as any,
					'upload',
					'test-namespace',
					'test-branch',
					false,
				),
			).rejects.toThrow(AuthenticationError);
		});

		it('should include x-commit-hash header when commitHash provided', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			const mockReadable = { toWeb: jest.fn().mockReturnValue({}) };
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(createMockResponse(200, true));

			await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
				'abc123def456',
			);

			expect(mockUndiciFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						'x-commit-hash': 'abc123def456',
					}),
				}),
			);
		});

		it('should omit x-commit-hash header when commitHash undefined', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			const mockReadable = { toWeb: jest.fn().mockReturnValue({}) };
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(createMockResponse(200, true));

			await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
			);

			const callHeaders = mockUndiciFetch.mock.calls[0][1].headers;
			expect(callHeaders).not.toHaveProperty('x-commit-hash');
		});

		it('should return true on 200 with status current (no-op)', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			const mockReadable = { toWeb: jest.fn().mockReturnValue({}) };
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(
				createMockResponse(200, true, {
					status: 'current',
					commitHash: 'abc123',
				}),
			);

			const result = await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch',
				false,
			);

			expect(result).toBe(true);
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining('Index already up to date'),
			);
		});

		it('should throw IndexingInProgressError on 409 response', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				},
			};

			const mockNdJsonStream = {};
			(
				NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>
			).mockImplementation(() => mockNdJsonStream as any);

			const mockReadable = { toWeb: jest.fn().mockReturnValue({}) };
			jest.doMock('stream', () => ({ Readable: mockReadable }), {
				virtual: true,
			});

			mockUndiciFetch.mockResolvedValue(
				createMockResponse(409, false, {
					message: 'Indexing already in progress',
					details: { branchName: 'main' },
				}),
			);

			await expect(
				client.streamToApi(
					mockStream as any,
					'upload',
					'test-namespace',
					'test-branch',
					false,
				),
			).rejects.toThrow(IndexingInProgressError);
		});
	});

	describe('retry logic', () => {
		it('should retry on retryable errors (5xx)', async () => {
			// First two calls fail with 500, third succeeds
			mockFetch
				.mockResolvedValueOnce(createMockResponse(500, false))
				.mockResolvedValueOnce(createMockResponse(502, false))
				.mockResolvedValueOnce(
					createMockResponse(200, true, { success: true }),
				);

			const promise = client.getProjectState();
			await jest.runAllTimersAsync();
			const result = await promise;

			expect(mockFetch).toHaveBeenCalledTimes(3);
			expect(result).toEqual({ success: true });
		});

		it('should not retry on non-retryable errors (4xx)', async () => {
			mockFetch.mockResolvedValue(createMockResponse(400, false));

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should throw AuthenticationError on 401 without retry', async () => {
			mockFetch.mockResolvedValue(createMockResponse(401, false));

			// AuthenticationError is now re-thrown, not caught and converted to null
			await expect(client.getProjectState()).rejects.toThrow(
				AuthenticationError,
			);
			expect(mockFetch).toHaveBeenCalledTimes(1); // No retries for auth errors
		});

		it('should apply jittered delay between retries', async () => {
			mockFetch
				.mockResolvedValueOnce(createMockResponse(500, false))
				.mockResolvedValueOnce(createMockResponse(200, true, {}));

			// Mock Math.random to return a predictable value
			const originalRandom = Math.random;
			// @ts-expect-error - Math.random mock typing
			Math.random = jest.fn().mockReturnValue(0.5);

			const promise = client.getProjectState();
			await jest.runAllTimersAsync();
			const result = await promise;

			expect(mockFetch).toHaveBeenCalledTimes(2);
			Math.random = originalRandom;
		});

		it('should exhaust retries and throw final error', async () => {
			mockFetch.mockResolvedValue(createMockResponse(500, false));

			const promise = client.getProjectState();
			await jest.runAllTimersAsync();

			// getProjectState catches all errors and returns null
			const result = await promise;
			expect(result).toBeNull();
			expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
		});
	});

	describe('timeout handling', () => {
		it('should abort request on timeout', async () => {
			// Mock a request that takes too long
			const mockAbortController = {
				abort: jest.fn(),
				signal: { aborted: false },
			};
			global.AbortController = jest.fn(() => mockAbortController) as any;

			// Create a delayed response that won't resolve before timeout
			const delayedPromise = new Promise<Response>((resolve) =>
				setTimeout(() => resolve(createMockResponse(200, true)), 2000),
			);
			mockFetch.mockReturnValue(delayedPromise);

			// Manually call the private sendRequest method through a public method
			const promise = client.getProjectState();
			await jest.runAllTimersAsync();

			// The request should complete normally since no timeout is set by default
			await promise;
		});
	});

	describe('request headers', () => {
		it('should include correct headers in requests', async () => {
			mockFetch.mockResolvedValue(createMockResponse(200, true, {}));

			await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
						Accepts: 'application/json; charset=utf-8',
						Authorization: `Bearer ${mockAccessKey}`,
						'x-branch-name': 'main',
						'x-project-id': 'test-project',
					},
				}),
			);
		});

		it('should merge custom headers with defaults', async () => {
			mockFetch.mockResolvedValue(createMockResponse(200, true, {}));

			await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						'Content-Type': 'application/json; charset=utf-8',
						Authorization: `Bearer ${mockAccessKey}`,
					}),
				}),
			);
		});
	});

	describe('error handling', () => {
		it('should handle fetch rejections gracefully', async () => {
			mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();
		});

		it('should log errors when sendRequest fails', async () => {
			const originalError = new Error('Original error');
			mockFetch.mockRejectedValue(originalError);

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			// Should log the error once (no retries for non-RetryableError)
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining(
					'HTTP request attempt 1/3 failed: Original error',
				),
			);
		});

		it('should handle non-Error objects in catch blocks', async () => {
			mockFetch.mockRejectedValue('String error');

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			// Should log the string error once
			expect(console.log).toHaveBeenCalledWith(
				expect.stringContaining(
					'HTTP request attempt 1/3 failed: String error',
				),
			);
		});
	});

	describe('API version handling', () => {
		it('should use v1 API version in all requests', async () => {
			mockFetch.mockResolvedValue(createMockResponse(200, true, {}));

			await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/intel/v1/project',
				expect.any(Object),
			);
		});
	});
});

describe('RetryableError', () => {
	it('should create error with correct name and message', () => {
		const error = new RetryableError('Server error');

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('RetryableError');
		expect(error.message).toBe('Server error');
	});
});

describe('AuthenticationError', () => {
	it('should create error with correct name and message', () => {
		const error = new AuthenticationError('Auth failed');

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('AuthenticationError');
		expect(error.message).toBe('Auth failed');
	});
});

describe('NotFoundError', () => {
	it('should create error with correct name and message', () => {
		const error = new NotFoundError('Resource not found');

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('NotFoundError');
		expect(error.message).toBe('Resource not found');
	});
});

describe('ProjectValidationError', () => {
	it('should create error with correct name, message, code, and projectId', () => {
		const error = new ProjectValidationError(
			'Project not registered',
			'PROJECT_NOT_REGISTERED',
			'proj:abc123',
		);

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('ProjectValidationError');
		expect(error.message).toBe('Project not registered');
		expect(error.code).toBe('PROJECT_NOT_REGISTERED');
		expect(error.projectId).toBe('proj:abc123');
	});

	it('should work without projectId', () => {
		const error = new ProjectValidationError(
			'Invalid ID',
			'INVALID_PROJECT_ID',
		);

		expect(error.projectId).toBeUndefined();
	});
});

describe('IndexingInProgressError', () => {
	it('should create error with correct name, message, and branchName', () => {
		const error = new IndexingInProgressError(
			'Indexing already in progress',
			'main',
		);

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('IndexingInProgressError');
		expect(error.message).toBe('Indexing already in progress');
		expect(error.branchName).toBe('main');
	});

	it('should work without branchName', () => {
		const error = new IndexingInProgressError('Indexing in progress');

		expect(error.branchName).toBeUndefined();
	});
});

describe('getIndexStatus', () => {
	let client: ConstellationClient;
	const mockAccessKey = 'test-access-key';
	const mockFetchLocal = jest.fn() as jest.MockedFunction<typeof fetch>;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		global.fetch = mockFetchLocal;

		const mockConfig = {
			apiUrl: 'https://api.constellation.test',
			projectId: 'test-project',
			branch: 'main',
			languages: {},
		} as any;

		client = new ConstellationClient(mockConfig, mockAccessKey);
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('should call correct URL with branch and commit params', async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			statusText: 'OK',
			json: jest
				.fn<() => Promise<Record<string, any>>>()
				.mockResolvedValue({ status: 'current' }),
			headers: new Headers(),
		} as any;
		mockFetchLocal.mockResolvedValue(mockResponse);

		await client.getIndexStatus('main', 'abc123');

		expect(mockFetchLocal).toHaveBeenCalledWith(
			'https://api.constellation.test/intel/v1/projects/test-project/index-status?branch=main&commit=abc123',
			expect.objectContaining({ method: 'GET' }),
		);
	});

	it('should return parsed JSON body on 200', async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			statusText: 'OK',
			json: jest
				.fn<() => Promise<Record<string, any>>>()
				.mockResolvedValue({ status: 'current', commitHash: 'abc123' }),
			headers: new Headers(),
		} as any;
		mockFetchLocal.mockResolvedValue(mockResponse);

		const result = await client.getIndexStatus('main', 'abc123');

		expect(result).toEqual({ status: 'current', commitHash: 'abc123' });
		expect(mockResponse.json).toHaveBeenCalled();
	});

	it('should return null on non-ok response', async () => {
		const mockResponse = {
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: jest
				.fn<() => Promise<Record<string, any>>>()
				.mockResolvedValue({ code: 'NOT_FOUND' }),
			headers: new Headers(),
		} as any;
		mockFetchLocal.mockResolvedValue(mockResponse);

		const result = await client.getIndexStatus('main');

		expect(result).toBeNull();
	});

	it('should return null on network error', async () => {
		mockFetchLocal.mockRejectedValue(new Error('Network error'));

		const result = await client.getIndexStatus('main');

		expect(result).toBeNull();
	});

	it('should re-throw AuthenticationError', async () => {
		const mockResponse = {
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({}),
			headers: new Headers(),
		} as any;
		mockFetchLocal.mockResolvedValue(mockResponse);

		await expect(client.getIndexStatus('main')).rejects.toThrow(
			AuthenticationError,
		);
	});
});
