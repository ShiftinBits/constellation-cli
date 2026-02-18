import { fetch as undiciFetch, Agent } from 'undici';
import { ConstellationConfig } from '../config/config';
import type { ProjectState, SerializedAST } from '@constellationdev/types';
import { generateAstId } from '../utils/id.utils';
import { NdJsonStreamWriter } from '../utils/ndjson-streamwriter';
import { RED_X } from '../utils/unicode-chars';

/**
 * Client for communicating with the Constellation central service.
 * Handles uploading AST data, managing project state, and file operations.
 */
export class ConstellationClient {
	/**
	 * API version for use in versioned endpoint paths
	 */
	private readonly apiVersion = 'v1';

	/**
	 * Creates a new ConstellationClient instance.
	 * @param config Configuration settings for API connection
	 */
	constructor(
		private config: ConstellationConfig,
		private accessKey: string,
	) {}

	/**
	 * Retrieves the current project state from the central service.
	 * @returns Project state if available, null on error
	 * @throws NotFoundError if project has not been indexed yet (404 response)
	 */
	async getProjectState(): Promise<ProjectState | null> {
		try {
			const params = new URLSearchParams({
				branchName: this.config.branch,
			});
			const headers = {
				'Content-Type': 'application/x-ndjson; charset=utf-8', // Newline-delimited JSON
				'x-project-id': this.config.projectId,
				'x-branch-name': this.config.branch,
				Authorization: `Bearer ${this.accessKey}`,
			};
			const response = await this.sendRequest(
				'project',
				undefined,
				'GET',
				headers,
			);

			// Handle 404 specifically - indicates project not indexed yet
			if (response?.status === 404) {
				throw new NotFoundError('Project not found - no previous index exists');
			}

			const state = response?.ok
				? (response.json() as unknown as ProjectState)
				: null;
			return state;
		} catch (error) {
			// Re-throw NotFoundError so caller can handle it
			if (error instanceof NotFoundError) {
				throw error;
			}
			// Re-throw AuthenticationError - caller must handle auth failures explicitly
			if (error instanceof AuthenticationError) {
				throw error;
			}
			console.error(`${RED_X} Failed to query current project state`, error);
			return null;
		}
	}

	/**
	 * Removes AST data for deleted files from the central service.
	 * @param deletedFiles Array of file paths that have been deleted
	 * @throws Error if deletion fails for any file
	 */
	async deleteFiles(deletedFiles: string[]): Promise<void> {
		// API call to remove data for deleted files
		for (const filePath of deletedFiles) {
			const projectFileId = generateAstId(
				this.config.projectId,
				this.config.branch,
				filePath,
			);
			await this.delete(`/ast/${projectFileId}`);
		}
	}

	/** HTTP status codes that should trigger retry logic */
	private retryableStatusCodes: number[] = [500, 502, 503, 504];

	/**
	 * Streams AST data to the API using newline-delimited JSON format.
	 * @param dataStream Async generator yielding SerializedAST objects
	 * @param path API endpoint path (without base URL or version)
	 * @param projectId Unique project identifier
	 * @param branchName Branch name
	 * @param incrementalIndex Whether this is an incremental index
	 * @returns True if upload successful, false otherwise
	 * @throws Error if stream fails to upload
	 */
	async streamToApi(
		dataStream: AsyncGenerator<SerializedAST>,
		path: string,
		projectId: string,
		branchName: string,
		incrementalIndex: boolean,
	): Promise<boolean> {
		try {
			const { Readable } = await import('stream');
			const stream = new NdJsonStreamWriter(dataStream);

			// Convert Node.js Readable to Web ReadableStream
			const webStream = Readable.toWeb(stream) as ReadableStream;

			// Use undici's own fetch + Agent so both are from the same package instance.
			// Passing an npm-undici Agent to Node.js's built-in fetch causes a version
			// mismatch that silently returns non-ok responses. Using undiciFetch here
			// ensures the dispatcher is accepted correctly.
			//
			// headersTimeout: 0 / bodyTimeout: 0 — the server processes the entire
			// NDJSON stream synchronously before sending response headers, so large
			// full-index uploads legitimately take > 30s and would trigger the default
			// 30s UND_ERR_HEADERS_TIMEOUT without this override.
			const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

			const response = await undiciFetch(
				`${this.config.apiUrl}/${this.apiVersion}/${path}`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-ndjson; charset=utf-8', // Newline-delimited JSON
						'x-project-id': projectId,
						'x-branch-name': branchName,
						'x-constellation-index': incrementalIndex ? 'incremental' : 'full',
						Authorization: `Bearer ${this.accessKey}`,
					},
					body: webStream,
					duplex: 'half', // Required for streaming requests in fetch
					dispatcher,
				},
			);

			// Handle authentication errors explicitly
			if (response.status === 401) {
				throw new AuthenticationError('Authentication failed');
			}

			return response.ok === true;
		} catch (error: any) {
			// Re-throw AuthenticationError so callers can handle it
			if (error instanceof AuthenticationError) {
				throw error;
			}

			// Extract detailed network error information
			const originalError =
				error instanceof Error ? error : new Error(String(error));

			// Build detailed error message based on error type
			let errorDetails = '';

			// Network-level failures (DNS, connection refused, etc.)
			if (originalError.message === 'fetch failed' || error.code) {
				const networkDetails = [];

				// Extract Node.js system error details from both error and cause
				const errorCode = error.code || error.cause?.code;

				if (error.code) networkDetails.push(`Error Code: ${error.code}`);
				if (error.cause) {
					const cause = error.cause as any;
					if (cause.code) networkDetails.push(`Cause Code: ${cause.code}`);
					if (cause.errno) networkDetails.push(`Errno: ${cause.errno}`);
					if (cause.syscall)
						networkDetails.push(`System Call: ${cause.syscall}`);
					if (cause.address) networkDetails.push(`Address: ${cause.address}`);
					if (cause.port) networkDetails.push(`Port: ${cause.port}`);
				}

				// Add common error code explanations
				if (errorCode === 'ERR_INVALID_ARG_VALUE') {
					errorDetails =
						'Invalid argument value - check stream/body format and duplex option';
				} else if (errorCode === 'ECONNREFUSED') {
					errorDetails =
						'Connection refused - service may be down or unreachable';
				} else if (errorCode === 'ENOTFOUND') {
					errorDetails = 'DNS lookup failed - check service URL';
				} else if (errorCode === 'ETIMEDOUT') {
					errorDetails = 'Connection timeout - service not responding';
				} else if (errorCode === 'ECONNRESET') {
					errorDetails = 'Connection reset by server';
				} else if (errorCode === 'EHOSTUNREACH') {
					errorDetails = 'Host unreachable - check network connectivity';
				} else {
					errorDetails = 'Network failure';
				}

				if (networkDetails.length > 0) {
					errorDetails += ` (${networkDetails.join(', ')})`;
				}
			} else {
				errorDetails = originalError.message;
			}

			// Create enhanced error with full context
			const enhancedError = new Error(
				`Failed to upload data to Constellation Service: ${errorDetails}`,
			);
			enhancedError.cause = originalError;
			enhancedError.stack = `${enhancedError.stack}\nCaused by: ${originalError.stack}`;
			throw enhancedError;
		}
	}

	/**
	 * Sends an HTTP request with retry logic and timeout handling.
	 * @param path API endpoint path
	 * @param data Request body data
	 * @param method HTTP method (GET, POST, DELETE)
	 * @param headers Additional request headers
	 * @param timeout Request timeout in milliseconds (0 for no timeout)
	 * @param retries Number of retry attempts
	 * @param delay Base delay between retries in milliseconds
	 * @param jitter Random jitter added to delay to prevent thundering herd
	 * @returns HTTP Response object
	 * @throws Error on non-retryable failures or after exhausting retries
	 */
	private async sendRequest(
		path: string,
		data: any,
		method: string,
		headers = {},
		timeout = 0,
		retries = 3,
		delay = 1000,
		jitter = 250,
	) {
		for (let i = 1; i <= retries; i++) {
			try {
				const controller = new AbortController();
				let timeoutTimer: string | number | NodeJS.Timeout | undefined;
				if (timeout > 0) {
					timeoutTimer = setTimeout(() => controller.abort(), timeout);
				}

				const requestHeaders: Record<string, string> = {
					...headers,
					'Content-Type': 'application/json; charset=utf-8',
					Accepts: 'application/json; charset=utf-8',
					Authorization: `Bearer ${this.accessKey}`,
				};

				const response = await fetch(
					`${this.config.apiUrl}/${this.apiVersion}/${path}`,
					{
						method,
						headers: requestHeaders,
						body: data ? JSON.stringify(data) : undefined,
						signal: controller.signal,
					},
				);

				if (timeoutTimer) {
					clearTimeout(timeoutTimer);
				}

				// Handle authentication errors silently
				if (response.status === 401) {
					throw new AuthenticationError('Authentication failed');
				}

				if (!response.ok) {
					if (this.retryableStatusCodes.includes(response.status)) {
						throw new RetryableError(
							`${response.statusText} (${response.status})`,
						);
					}
				}

				return response;
			} catch (error: Error | any) {
				// Skip logging for auth errors - they're not retryable and will be handled by caller
				if (!(error instanceof AuthenticationError)) {
					const errorDetails =
						error instanceof Error
							? `${error.message}${error.cause ? ` (Cause: ${error.cause})` : ''}`
							: String(error);
					console.log(
						`HTTP request attempt ${i}/${retries} failed: ${errorDetails}`,
					);
				}

				// Only retry RetryableError, everything else gets thrown immediately
				if (i < retries && error instanceof RetryableError) {
					const jitteredDelay = delay + Math.floor(Math.random() * jitter);
					await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
				} else {
					throw error;
				}
			}
		}
	}

	/**
	 * Sends a DELETE request to the API.
	 * @param path URL path to delete
	 * @throws Error if request fails with non-retryable error
	 */
	private async delete(path: string): Promise<void> {
		// Include required project headers for API authorization
		const headers = {
			'x-project-id': this.config.projectId,
			'x-branch-name': this.config.branch,
		};
		const response = await this.sendRequest(path, undefined, 'DELETE', headers);

		// Handle 401 responses gracefully
		if (!response) {
			return;
		}

		if (!response.ok) {
			throw new Error(`Failed sending HTTP DELETE to ${path}`);
		}
	}
}

/**
 * Error thrown for server issues that can be retried (5xx status codes).
 */
export class RetryableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RetryableError';
	}
}

/**
 * Error thrown when authentication fails (401 status code).
 */
export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

/**
 * Error thrown when resource is not found (404 status code).
 * Indicates that the project has not been indexed yet.
 */
export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}
