import { fetch as undiciFetch, Agent } from 'undici';
import { ConstellationConfig } from '../config/config';
import type { ProjectState, SerializedAST } from '@constellationdev/types';
import { generateAstId } from '../utils/id.utils';
import { NdJsonStreamWriter } from '../utils/ndjson-streamwriter';
import { GREEN_CHECK, RED_X } from '../utils/unicode-chars';

/**
 * Client for communicating with the Constellation central service.
 * Handles uploading AST data, managing project state, and file operations.
 */
export class ConstellationClient {
	/**
	 * API version for use in versioned endpoint paths
	 */
	private readonly apiVersion = 'intel/v1';

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

			// Handle non-OK responses with specific error codes from response body
			if (response && !response.ok) {
				await this.handleProjectStateError(response);
			}

			const state = response?.ok
				? (response.json() as unknown as ProjectState)
				: null;
			return state;
		} catch (error) {
			// Re-throw known error types so callers can handle them
			if (
				error instanceof NotFoundError ||
				error instanceof AuthenticationError ||
				error instanceof ProjectValidationError
			) {
				throw error;
			}
			console.error(`${RED_X} Failed to query current project state`, error);
			return null;
		}
	}

	/**
	 * Parses the error response body from the project state endpoint and throws
	 * the appropriate typed error based on the API error code.
	 * @param response Non-OK HTTP response from the project state endpoint
	 * @throws ProjectValidationError for project registration/access issues
	 * @throws NotFoundError when project has not been indexed yet
	 */
	private async handleProjectStateError(response: Response): Promise<void> {
		try {
			const body = (await response.json()) as {
				code?: string;
				message?: string;
			};
			const code = body?.code;

			switch (code) {
				case 'PROJECT_NOT_REGISTERED':
					throw new ProjectValidationError(
						body?.message || 'Project not registered',
						code,
						this.config.projectId,
					);
				case 'PROJECT_INACTIVE':
					throw new ProjectValidationError(
						body?.message || 'Project is inactive',
						code,
						this.config.projectId,
					);
				case 'INVALID_PROJECT_ID':
					throw new ProjectValidationError(
						body?.message || 'Invalid project ID format',
						code,
						this.config.projectId,
					);
				case 'PROJECT_NOT_FOUND':
					throw new NotFoundError(
						'Project not found - no previous index exists',
					);
				default:
					// No recognized error code — fall back to status-based handling
					if (response.status === 404) {
						throw new NotFoundError(
							'Project not found - no previous index exists',
						);
					}
					break;
			}
		} catch (parseError) {
			// Re-throw our custom errors
			if (
				parseError instanceof ProjectValidationError ||
				parseError instanceof NotFoundError
			) {
				throw parseError;
			}
			// JSON parse failed — fall back to status-based handling for 404
			if (response.status === 404) {
				throw new NotFoundError('Project not found - no previous index exists');
			}
			// Other status codes — fall through to existing handling
		}
	}

	/**
	 * Queries the index status for a given branch and optional commit.
	 * @param branch Branch name to check
	 * @param commit Optional commit hash to check
	 * @returns Index status object if available, null on error
	 * @throws AuthenticationError if authentication fails
	 */
	async getIndexStatus(
		branch: string,
		commit?: string,
	): Promise<Record<string, any> | null> {
		const params = new URLSearchParams({ branch });
		if (commit) params.set('commit', commit);
		const path = `projects/${encodeURIComponent(this.config.projectId)}/index-status?${params.toString()}`;
		try {
			const response = await this.sendRequest(path, null, 'GET');
			if (!response || !response.ok) return null;
			return (await response.json()) as Record<string, any>;
		} catch (error) {
			if (error instanceof AuthenticationError) throw error;
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
		commitHash?: string,
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
						...(commitHash && { 'x-commit-hash': commitHash }),
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

			// Handle concurrent indexing conflict
			if (response.status === 409) {
				let errorMessage = 'Indexing already in progress';
				let errorBranch: string | undefined;
				try {
					const body = (await response.json()) as Record<string, any>;
					errorMessage = body?.message || errorMessage;
					errorBranch = body?.details?.branchName;
				} catch {
					/* ignore parse errors */
				}
				throw new IndexingInProgressError(errorMessage, errorBranch);
			}

			// Handle 200 no-op when index is already current
			if (response.status === 200) {
				try {
					const body = (await response.json()) as Record<string, any>;
					if (body?.status === 'current') {
						console.log(
							`${GREEN_CHECK} Index already up to date for ${branchName} at commit ${body.commitHash || 'unknown'}`,
						);
						return true;
					}
				} catch {
					/* ignore parse errors, fall through */
				}
			}

			// Accept both 200 (legacy) and 202 (async processing)
			return response.ok === true || response.status === 202;
		} catch (error: any) {
			// Re-throw known error types so callers can handle them
			if (error instanceof AuthenticationError) {
				throw error;
			}
			if (error instanceof IndexingInProgressError) {
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

/**
 * Error thrown when project validation fails (project not registered, inactive, or invalid ID).
 * Provides specific error code and project ID for actionable error messaging.
 */
export class ProjectValidationError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly projectId?: string,
	) {
		super(message);
		this.name = 'ProjectValidationError';
	}
}

/**
 * Error thrown when an indexing operation is already in progress (409 status code).
 * Provides the branch name for actionable error messaging.
 */
export class IndexingInProgressError extends Error {
	constructor(
		message: string,
		public readonly branchName?: string,
	) {
		super(message);
		this.name = 'IndexingInProgressError';
	}
}
