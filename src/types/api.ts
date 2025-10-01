
/**
 * Represents the current state of a project in the Constellation service.
 * Used to track indexing progress and determine incremental update needs.
 */
export interface ProjectState {
	/** Project identifier */
	projectId: string;
	/** Git branch being tracked */
	branch: string;
	/** Last commit hash that was successfully indexed */
	latestCommit: string;
	/** Number of indexed files */
	fileCount: number;
	/** ISO timestamp when project was last indexed */
	lastIndexedAt: string;
	/** List of programming languages detected in the project */
	languages: string[];
}

/**
 * Represents a serialized Abstract Syntax Tree ready for transmission to the API.
 * Contains compressed AST data without source code to maintain privacy.
 */
export interface SerializedAST {
	/** Relative path to the source file from project root */
	file: string;
	/** Programming language identifier (e.g., 'typescript', 'javascript') */
	language: string;
	/** Git commit hash when this AST was generated */
	commit: string;
	/** ISO timestamp when the AST was created */
	timestamp: string;
	/** Base64-encoded, gzip-compressed AST structure (no source code) */
	ast: string;
}
