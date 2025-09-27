import { ConstellationConfig } from "../config/config";
import { ProjectState, SerializedAST } from "../types/api";
import { generateAstId } from "../utils/id.utils";
import { NdJsonStreamWriter } from "../utils/ndjson-streamwriter";

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
		private accessKey: string
	) {}

	/**
	 * Retrieves the current project state from the central service.
	 * @returns Project state if available, null if not found or on error
	 */
	async getProjectState(): Promise<ProjectState | null> {
		try {
			const projectId = generateAstId(this.config.namespace, this.config.branch);
			return await this.get<ProjectState>(`/project/${projectId}`);
		} catch (error) {
			return null;
		}
	}

	/**
	 * Uploads a serialized AST to the central service for processing.
	 * The AST contains no source code, only syntax tree metadata.
	 * @param serializedAST The compressed AST data to upload
	 * @throws Error if upload fails
	 */
	async uploadAST(serializedAST: SerializedAST): Promise<void> {
		// Send SerializedAST object to server for processing
		// The AST structure contains no source code, only syntax tree metadata
		// The ast property is already compressed as base64 string
		const projectFileId = generateAstId(this.config.namespace, this.config.branch, serializedAST.file);

		// Upload SerializedAST object for server-side intelligence extraction
		await this.post(`/ast/${projectFileId}`, serializedAST);
	}

	/**
	 * Removes AST data for deleted files from the central service.
	 * @param deletedFiles Array of file paths that have been deleted
	 * @throws Error if deletion fails for any file
	 */
	async deleteFiles(deletedFiles: string[]): Promise<void> {
		// API call to remove data for deleted files
		for (const filePath of deletedFiles) {
			const projectFileId = generateAstId(this.config.namespace, this.config.branch, filePath);
			await this.delete(`/ast/${projectFileId}`);
		}
	}

	/** HTTP status codes that should trigger retry logic */
	private retryableStatusCodes: number[] = [500, 502, 503, 504];

	/**
	 * Streams AST data to the API using newline-delimited JSON format.
	 * @param dataStream Async generator yielding SerializedAST objects
	 * @param path API endpoint path (without base URL or version)
	 * @returns True if upload successful, false otherwise
	 * @throws Error if stream fails to upload
	 */
	async streamToApi(dataStream: AsyncGenerator<SerializedAST>, path: string, namespace: string, branchName: string): Promise<boolean> {
		try {
			const { Readable } = await import('stream');
			const stream = new NdJsonStreamWriter(dataStream);

			const response = await fetch(`${this.config.apiUrl}/${this.apiVersion}/${path}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-ndjson; charset=utf-8', // Newline-delimited JSON
						'x-project-id': namespace,
						'x-branch-name': branchName,
						// 'Transfer-Encoding': 'chunked',
						Authorization: this.accessKey
					},
					body: Readable.toWeb(stream),
					duplex: 'half' // Required for streaming requests in fetch
			});
			return response.ok === true;
		} catch (error: any) {
			throw new Error(`Failed to upload data to Constellation Service due to error:\n    ${error.message}`);
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
		jitter = 250
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
					"Content-Type": "application/json; charset=utf-8",
					Accepts: "application/json; charset=utf-8",
					Authorization: this.accessKey
				};

				const response = await fetch(`${this.config.apiUrl}/${this.apiVersion}/${path}`, {
					method,
					headers: requestHeaders,
					body: data ? JSON.stringify(data) : undefined,
					credentials: "include",
					signal: controller.signal,
				});

				if (timeoutTimer) {
					clearTimeout(timeoutTimer);
				}

				// Handle authentication errors silently
				if (response.status === 401) {
					throw new AuthenticationError("Authentication failed");
				}

				if (!response.ok) {
					if (this.retryableStatusCodes.includes(response.status)) {
						throw new RetryableError(
							`${response.statusText} (${response.status})`
						);
					}
				}

				return response;
			} catch (error: Error | any) {
				console.log(
					`HTTP request attempt ${i}/${retries} failed due to error: ${error.message}`
				);

				// Only retry RetryableError, everything else gets thrown immediately
				if (i < retries && error instanceof RetryableError) {
					const jitteredDelay = delay + Math.floor(Math.random() * jitter);
					await new Promise(resolve => setTimeout(resolve, jitteredDelay));
				} else {
					throw error;
				}
			}
		}
	}

	/**
	 * Sends a GET request to the API.
	 * @param path URL path to request
	 * @returns The fetched entity or null if not found
	 * @throws Error if request fails with non-retryable error
	 */
	private async get<T>(
		path: string
	): Promise<T | null> {
		const response = await this.sendRequest(
			path,
			undefined,
			"GET"
		);

		// Handle 401 responses gracefully
		if (!response) {
			return null;
		}

		if (!response.ok) {
			throw new Error(`Failed to load`);
		}

		const data = await response.json();
		return data as T;
	}

	/**
	 * Sends a POST request to the API.
	 * @param path URL path to post to
	 * @param body Request body data
	 * @returns The response from the API or null if request fails
	 * @throws Error if request fails with non-retryable error
	 */
	private async post<T>(path: string, body: T): Promise<T | null> {

		const response = await this.sendRequest(
			path,
			body,
			"POST"
		);

		// Handle 401 responses gracefully
		if (!response) {
			return null;
		}

		if (!response.ok) {
			throw new Error(`Failed sending HTTP POST to ${path}`);
		}

		const data = await response.json();
		return data as T;
	}

	/**
	 * Sends a DELETE request to the API.
	 * @param path URL path to delete
	 * @throws Error if request fails with non-retryable error
	 */
	private async delete(path: string): Promise<void> {

		const response = await this.sendRequest(
			path,
			undefined,
			"DELETE"
		);

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
		this.name = "RetryableError";
	}
}

/**
 * Error thrown when authentication fails (401 status code).
 */
export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuthenticationError";
	}
}
