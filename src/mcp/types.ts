/**
 * MCP (Model Context Protocol) type definitions for AI coding assistant configuration.
 */

import type { ToolHooksConfig } from '../hooks/types';

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
 * Marketplace configuration for tools that support plugin marketplaces.
 */
export interface MarketplaceConfig {
	/** Project-level config path (relative to cwd) */
	filePath: string;
	/** Configuration object to deep merge into the file */
	config: Record<string, unknown>;
}

/**
 * Plugin configuration for tools that use array-based plugin systems.
 * Appends to an existing array instead of replacing it.
 */
export interface PluginConfig {
	/** Key path within config where plugin array lives (e.g., ['plugin']) */
	pluginKeyPath: string[];
	/** Plugin package name to add (e.g., '@constellationdev/opencode') */
	pluginValue: string;
}

/**
 * Global config path entry for tools that support multiple installations.
 */
export interface GlobalConfigPath {
	/** Display name for the installation (e.g., 'VS Code', 'VS Code Insiders') */
	displayName: string;
	/** Absolute path to the settings file */
	settingsPath: string;
}

/**
 * Configuration for environment variable policy handling.
 * Some tools (like Codex) have a whitelist of allowed env vars.
 */
export interface EnvPolicyConfig {
	/** Key path to the include_only array (e.g., ['shell_environment_policy', 'include_only']) */
	includeOnlyKeyPath: string[];
	/** Environment variable names to add to the whitelist */
	envVarsToAllow: string[];
	/** Optional: also check/update this global config path */
	globalConfigPath?: string;
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
	format: 'json' | 'jsonc' | 'toml';
	/** Permissions file locations (project only - never set global permissions) */
	permissionsConfig?: PermissionsConfig;
	/** Marketplace configuration (for tools that support plugin marketplaces) */
	marketplaceConfig?: MarketplaceConfig;
	/** Key path within config where mcpServers lives */
	mcpServersKeyPath: string[];
	/** Tool-specific environment variables to add to MCP server config */
	mcpEnv?: Record<string, string>;
	/** Whether this tool uses global config (requires special handling) */
	isGlobalConfig?: boolean;
	/** Function to get all config paths for global configs (supports multiple installations) */
	getGlobalConfigPaths?: () => GlobalConfigPath[];
	/** Additional server properties (like alwaysAllow, disabled) */
	mcpServerExtras?: Record<string, unknown>;
	/** Override the default CONSTELLATION_MCP_CONFIG for tools with a different server config shape */
	mcpServerConfigOverride?: Record<string, unknown>;
	/** Key name for environment variables in server config (default: 'env') */
	mcpEnvKey?: string;
	/** Root-level defaults for new config files (e.g., $schema). Only applied to missing keys. */
	configDefaults?: Record<string, unknown>;
	/** Environment policy configuration (for tools that whitelist env vars) */
	envPolicyConfig?: EnvPolicyConfig;
	/** Hook configuration for tools that support AI hooks */
	hooksConfig?: ToolHooksConfig;
	/** Plugin configuration (for tools that use plugin arrays) */
	pluginConfig?: PluginConfig;
	/** Skip MCP server configuration (plugin handles this internally) */
	skipMcpServer?: boolean;
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
	/** Skip CI/CD pipeline configuration */
	skipCi?: boolean;
}
