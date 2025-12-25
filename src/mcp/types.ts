/**
 * MCP (Model Context Protocol) type definitions for AI coding assistant configuration.
 */

/**
 * MCP server configuration that will be added to each tool's config.
 */
export interface MCPServerConfig {
	/** Command to run the MCP server */
	command: string;
	/** Arguments to pass to the command */
	args: string[];
	/** Optional environment variables */
	env?: Record<string, string>;
}

/**
 * Configuration file paths for a tool.
 */
export interface PermissionsConfig {
	/** Project-level config path (relative to cwd) */
	filePath: string;
	/** Key path within permissions config where MCP permissions live */
	allowKeyPath: string[];
	/** Proper value to allow MCP server tools */
	allowValue: string;
}

/**
 * Represents an AI coding assistant tool that supports MCP.
 */
export interface AITool {
	/** Internal identifier */
	id: string;
	/** Display name for prompts */
	displayName: string;
	/** Config file locations (project and/or global) */
	configPath: string;
	/** Config file format */
	format: 'json' | 'toml';
	/** Permissions file locations (project only - never set global permissions) */
	permissionsConfig?: PermissionsConfig;
	/** Key path within config where mcpServers lives */
	mcpServersKeyPath: string[];
}

/**
 * Configuration result after attempting to configure a tool.
 */
export interface ToolConfigResult {
	/** The tool that was configured */
	tool: AITool;
	/** Whether configuration was successful */
	success: boolean;
	/** Path where configuration was written */
	configuredPath?: string;
	/** Error message if configuration failed */
	error?: string;
}

/**
 * Options for the init command.
 */
export interface InitOptions {
	/** Skip MCP server configuration */
	skipMcp?: boolean;
}
