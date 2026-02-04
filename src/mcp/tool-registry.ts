/**
 * Registry of all supported AI coding assistant tools and their MCP configuration.
 */

import {
	getClinePrimarySettingsPath,
	getClineSettingsPaths,
	getCopilotCliSettingsPath,
	getCopilotCliSettingsPaths,
} from '../utils/platform.utils';
import type { AITool, MCPServerConfig } from './types';

/**
 * The MCP server configuration for Constellation.
 */
export const CONSTELLATION_MCP_CONFIG: MCPServerConfig = {
	command: 'npx',
	args: ['-y', '@constellationdev/cli@latest'],
};

/**
 * Claude Code marketplace configuration for Constellation plugin.
 */
export const CLAUDE_CODE_MARKETPLACE_CONFIG = {
	extraKnownMarketplaces: {
		'constellation-marketplace': {
			source: {
				source: 'github',
				repo: 'ShiftinBits/constellation-claude',
			},
		},
	},
	enabledPlugins: {
		'constellation@constellation-marketplace': true,
	},
};

/**
 * Registry of AI coding assistant tools that support MCP configuration.
 * Includes both project-level and global config tools.
 */
export const AI_TOOLS: AITool[] = [
	{
		id: 'claude-code',
		displayName: 'Claude Code',
		configPath: '.mcp.json',
		format: 'json',
		permissionsConfig: {
			filePath: '.claude/settings.json',
			allowKeyPath: ['permissions', 'allow'],
			allowValue: 'mcp__constellation__*',
		},
		marketplaceConfig: {
			filePath: '.claude/settings.json',
			config: CLAUDE_CODE_MARKETPLACE_CONFIG,
		},
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'cline',
		displayName: 'Cline',
		configPath: getClinePrimarySettingsPath(),
		isGlobalConfig: true,
		getGlobalConfigPaths: getClineSettingsPaths,
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		mcpServerExtras: {
			alwaysAllow: ['query_code_graph'],
			disabled: false,
		},
		hooksConfig: {
			filePath: '.clinerules/hooks/placeholder', // Not used - Cline uses scripts only
			schemaVersion: 1,
			adapterId: 'cline',
		},
	},
	{
		id: 'codex-cli',
		displayName: 'Codex CLI',
		configPath: '.codex/config.toml',
		format: 'toml',
		mcpServersKeyPath: ['mcp_servers'],
		mcpEnv: { CONSTELLATION_ACCESS_KEY: '$CONSTELLATION_ACCESS_KEY' },
		mcpServerExtras: {
			enabled_tools: ['query_code_graph'],
		},
		envPolicyConfig: {
			includeOnlyKeyPath: ['shell_environment_policy', 'include_only'],
			envVarsToAllow: ['CONSTELLATION_ACCESS_KEY'],
			globalConfigPath: '~/.codex/config.toml',
		},
	},
	{
		id: 'copilot-cli',
		displayName: 'Copilot CLI',
		configPath: getCopilotCliSettingsPath(),
		isGlobalConfig: true,
		getGlobalConfigPaths: getCopilotCliSettingsPaths,
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: '${CONSTELLATION_ACCESS_KEY}',
		},
		mcpServerExtras: {
			tools: ['query_code_graph'],
			type: 'local',
		},
	},
	{
		id: 'cursor',
		displayName: 'Cursor',
		configPath: '.cursor/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: '${env:CONSTELLATION_ACCESS_KEY}',
		},
		hooksConfig: {
			filePath: '.cursor/hooks.json',
			schemaVersion: 1,
			adapterId: 'cursor',
		},
	},
	{
		id: 'gemini-cli',
		displayName: 'Gemini CLI',
		configPath: '.gemini/settings.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: '${CONSTELLATION_ACCESS_KEY}',
		},
		mcpServerExtras: {
			trust: true,
		},
		hooksConfig: {
			filePath: '.gemini/settings.json',
			schemaVersion: 1,
			adapterId: 'gemini',
		},
	},
	{
		id: 'jetbrains-ai',
		displayName: 'JetBrains',
		configPath: '.ai/mcp/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: 'CONSTELLATION_ACCESS_KEY',
		},
		mcpServerExtras: {
			tools: ['query_code_graph'],
		},
	},
	{
		id: 'kilo-code',
		displayName: 'Kilo Code',
		configPath: '.kilocode/mcp.json',
		format: 'json',
		permissionsConfig: {
			filePath: '.kilocode/mcp.json',
			allowKeyPath: ['mcpServers', 'constellation', 'alwaysAllow'],
			allowValue: 'query_code_graph',
		},
		mcpServersKeyPath: ['mcpServers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: '${env:CONSTELLATION_ACCESS_KEY}',
		},
	},
	{
		id: 'opencode',
		displayName: 'OpenCode',
		configPath: 'opencode.jsonc',
		format: 'jsonc',
		mcpServersKeyPath: ['mcp'],
		mcpServerConfigOverride: {
			command: ['npx', '-y', '@constellationdev/mcp@latest'],
		},
		mcpEnvKey: 'environment',
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: '{env:CONSTELLATION_ACCESS_KEY}',
		},
		mcpServerExtras: {
			type: 'local',
			enabled: true,
		},
		configDefaults: {
			$schema: 'https://opencode.ai/config.json',
		},
	},
	{
		id: 'tabnine',
		displayName: 'Tabnine',
		configPath: '.tabnine/mcp_servers.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'vscode-copilot',
		displayName: 'VSCode',
		configPath: '.vscode/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['servers'],
		mcpEnv: {
			CONSTELLATION_ACCESS_KEY: 'CONSTELLATION_ACCESS_KEY',
		},
		mcpServerExtras: {
			tools: ['query_code_graph'],
		},
	},
];

/**
 * Get a tool by its ID.
 */
export function getToolById(id: string): AITool | undefined {
	return AI_TOOLS.find((tool) => tool.id === id);
}

/**
 * Get tools that support project-level configuration.
 */
export function getProjectConfigurableTools(): AITool[] {
	return AI_TOOLS.filter((tool) => tool.configPath !== undefined);
}
