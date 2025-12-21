import { base32Encode } from './functions';

/**
 * Generates a unique, deterministic identifier for AST data in the Constellation service.
 * Creates URL-safe IDs using base32 encoding for consistent API endpoints.
 * @param projectId Unique project identifier
 * @param branch Git branch name
 * @param filePath Optional file path for file-specific IDs
 * @returns Base32-encoded identifier string
 */
export function generateAstId(
	projectId: string,
	branch: string,
	filePath?: string,
): string {
	// Create a unique, deterministic identifier string
	const identifier = `${projectId}:${branch}${filePath ? `:${filePath}` : ''}`;

	// Use base32 encoding for URL-safe, consistent IDs
	return base32Encode(identifier);
}
