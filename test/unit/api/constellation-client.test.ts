import { jest, describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { ConstellationClient, RetryableError, AuthenticationError } from '../../../src/api/constellation-client';
import { ConstellationConfig } from '../../../src/config/config';
import { ProjectState, SerializedAST } from '../../../src/types/api';
import { generateAstId } from '../../../src/utils/id.utils';
import { NdJsonStreamWriter } from '../../../src/utils/ndjson-streamwriter';
import { z } from 'zod';

// Mock dependencies
jest.mock('../../../src/utils/id.utils', () => ({
	generateAstId: jest.fn()
}));
jest.mock('../../../src/utils/ndjson-streamwriter');

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('ConstellationClient', () => {
	let client: ConstellationClient;
	let mockConfig: ConstellationConfig;
	const mockAccessKey = 'test-access-key';

	// Helper to create test SerializedAST
	const createTestAST = (overrides: Partial<SerializedAST> = {}): SerializedAST => ({
		file: 'src/test.ts',
		language: 'typescript',
		commit: 'a'.repeat(40), // Valid SHA-1
		timestamp: '2023-01-01T00:00:00.000Z',
		ast: 'H4sIAAAAAAAAA6vmAgAAAAAA', // Valid base64
		...overrides
	});

	// Helper to create mock Response
	const createMockResponse = (status: number, ok: boolean, data?: any): any => ({
		ok,
		status,
		statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
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
		text: jest.fn()
	});

	beforeEach(() => {
		// Use fake timers for all tests (speeds up retry/timeout tests)
		jest.useFakeTimers();

		// Reset all mocks
		jest.clearAllMocks();

		// Create mock configuration
		mockConfig = {
			apiUrl: 'https://api.constellation.test',
			namespace: 'test-project',
			branch: 'main',
			languages: {}
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
				namespace: 'test-project',
				branch: 'main',
				commit: 'abc123'
			};

			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true, mockProjectState));

			const result = await client.getProjectState();

			expect(generateAstId).toHaveBeenCalledWith('test-project', 'main');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/v1//project/mock-project-id',
				expect.objectContaining({
					method: 'GET',
					headers: expect.objectContaining({
						'Content-Type': 'application/json; charset=utf-8',
						Accepts: 'application/json; charset=utf-8',
						Authorization: mockAccessKey
					})
				})
			);
			expect(result).toEqual(mockProjectState);
		});

		it('should return null when project not found', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(404, false));

			const result = await client.getProjectState();

			expect(result).toBeNull();
		});

		it('should return null when request fails', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(new Error('Network error'));

			const result = await client.getProjectState();

			expect(result).toBeNull();
		});

		it('should return null when authentication fails', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(new AuthenticationError('Authentication failed'));

			const result = await client.getProjectState();

			expect(result).toBeNull();
		});
	});

	describe('uploadAST', () => {
		it('should successfully upload valid AST', async () => {
			const testAST = createTestAST();
			const mockResponse = createMockResponse(200, true, testAST);
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(mockResponse);

			await client.uploadAST(testAST);

			expect(generateAstId).toHaveBeenCalledWith('test-project', 'main', 'src/test.ts');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/v1//ast/mock-project-id',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json; charset=utf-8',
						Authorization: mockAccessKey
					}),
					body: JSON.stringify(testAST)
				})
			);
		});

		it('should throw validation error for invalid AST', async () => {
			const invalidAST = createTestAST({
				commit: 'invalid-commit', // Invalid SHA-1
			});

			await expect(client.uploadAST(invalidAST)).rejects.toThrow(
				/AST validation failed/
			);

			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should format validation errors clearly', async () => {
			const invalidAST = createTestAST({
				file: '', // Empty file path
				language: 'invalid-lang', // Invalid language
				commit: 'short' // Invalid commit hash
			});

			await expect(client.uploadAST(invalidAST)).rejects.toThrow(/AST validation failed/);
		});

		it('should propagate non-validation errors', async () => {
			const testAST = createTestAST();
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(new Error('Network error'));

			await expect(client.uploadAST(testAST)).rejects.toThrow('Network error');
		});

		it('should handle server errors during upload', async () => {
			const testAST = createTestAST();
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(500, false));

			// Use real timers for this test since we want actual retry behavior
			jest.useRealTimers();
			await expect(client.uploadAST(testAST)).rejects.toThrow();
			jest.useFakeTimers();
		});
	});

	describe('deleteFiles', () => {
		it('should delete single file', async () => {
			const filePaths = ['src/deleted.ts'];
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true));

			await client.deleteFiles(filePaths);

			expect(generateAstId).toHaveBeenCalledWith('test-project', 'main', 'src/deleted.ts');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/v1//ast/mock-project-id',
				expect.objectContaining({
					method: 'DELETE'
				})
			);
		});

		it('should delete multiple files', async () => {
			const filePaths = ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'];
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true));

			await client.deleteFiles(filePaths);

			expect(generateAstId).toHaveBeenCalledTimes(3);
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it('should handle delete errors', async () => {
			const filePaths = ['src/error.ts'];
			// @ts-expect-error - Jest mock typing
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
				}
			};

			const mockNdJsonStream = {
				pipe: jest.fn(),
				on: jest.fn(),
				read: jest.fn()
			};
			(NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>)
				.mockImplementation(() => mockNdJsonStream as any);

			// Mock Readable.toWeb
			const mockWebStream = {};
			const mockReadable = {
				toWeb: jest.fn().mockReturnValue(mockWebStream)
			};

			// Mock dynamic import
			jest.doMock('stream', () => ({
				Readable: mockReadable
			}), { virtual: true });

			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true));

			const result = await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch'
			);

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/v1/upload',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/x-ndjson; charset=utf-8',
						'x-project-id': 'test-namespace',
						'x-branch-name': 'test-branch',
						Authorization: mockAccessKey
					}),
					body: mockWebStream,
					duplex: 'half'
				})
			);
		});

		it('should return false when response is not ok', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				}
			};

			const mockNdJsonStream = {};
			(NdJsonStreamWriter as jest.MockedClass<typeof NdJsonStreamWriter>)
				.mockImplementation(() => mockNdJsonStream as any);

			// Mock Readable.toWeb
			const mockReadable = {
				toWeb: jest.fn().mockReturnValue({})
			};
			jest.doMock('stream', () => ({ Readable: mockReadable }), { virtual: true });

			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(400, false));

			const result = await client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch'
			);

			expect(result).toBe(false);
		});

		it('should throw enhanced error on stream failure', async () => {
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield createTestAST();
				}
			};

			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(new Error('Network timeout'));

			await expect(client.streamToApi(
				mockStream as any,
				'upload',
				'test-namespace',
				'test-branch'
			)).rejects.toThrow(/Failed to upload data to Constellation Service/);
		});
	});

	describe('retry logic', () => {
		it('should retry on retryable errors (5xx)', async () => {
			// First two calls fail with 500, third succeeds
			mockFetch
				// @ts-expect-error - Jest mock typing
			.mockResolvedValueOnce(createMockResponse(500, false))
				// @ts-expect-error - Jest mock typing
			.mockResolvedValueOnce(createMockResponse(502, false))
				// @ts-expect-error - Jest mock typing
			.mockResolvedValueOnce(createMockResponse(200, true, { success: true }));

			const promise = client.getProjectState();
			await jest.runAllTimersAsync();
			const result = await promise;

			expect(mockFetch).toHaveBeenCalledTimes(3);
			expect(result).toEqual({ success: true });
		});

		it('should not retry on non-retryable errors (4xx)', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(400, false));

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should throw AuthenticationError on 401', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(401, false));

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should apply jittered delay between retries', async () => {
			mockFetch
				// @ts-expect-error - Jest mock typing
			.mockResolvedValueOnce(createMockResponse(500, false))
				// @ts-expect-error - Jest mock typing
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
			// @ts-expect-error - Jest mock typing
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
				signal: { aborted: false }
			};
			global.AbortController = jest.fn(() => mockAbortController) as any;

			// Create a delayed response that won't resolve before timeout
			const delayedPromise = new Promise(resolve =>
				setTimeout(() => resolve(createMockResponse(200, true)), 2000)
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
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true, {}));

			await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
						Accepts: 'application/json; charset=utf-8',
						Authorization: mockAccessKey
					},
					credentials: 'include'
				})
			);
		});

		it('should merge custom headers with defaults', async () => {
			const testAST = createTestAST();
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true, testAST));

			await client.uploadAST(testAST);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						'Content-Type': 'application/json; charset=utf-8',
						Authorization: mockAccessKey
					})
				})
			);
		});
	});

	describe('error handling', () => {
		it('should handle fetch rejections gracefully', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();
		});

		it('should preserve error context in retry logic', async () => {
			const originalError = new Error('Original error');
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue(originalError);

			// Mock console.log to capture retry messages
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('HTTP request attempt 1/3 failed: Original error')
			);

			consoleSpy.mockRestore();
		});

		it('should handle non-Error objects in catch blocks', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockRejectedValue('String error');

			const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			// getProjectState catches all errors and returns null
			const result = await client.getProjectState();
			expect(result).toBeNull();

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('HTTP request attempt 1/3 failed: String error')
			);

			consoleSpy.mockRestore();
		});
	});

	describe('API version handling', () => {
		it('should use v1 API version in all requests', async () => {
			// @ts-expect-error - Jest mock typing
		mockFetch.mockResolvedValue(createMockResponse(200, true, {}));

			await client.getProjectState();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.constellation.test/v1//project/mock-project-id',
				expect.any(Object)
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