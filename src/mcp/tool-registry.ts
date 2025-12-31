/**
 * Registry of all supported AI coding assistant tools and their MCP configuration.
 */

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
 * Registry of AI coding assistant tools that support project-level MCP configuration.
 * NOTE: Only tools with local project config support are included.
 * Global-only tools (windsurf, codex-cli, opencode) are excluded.
 */
export const AI_TOOLS: AITool[] = [
	{
		id: 'cursor',
		displayName: 'Cursor',
		configPath: '.cursor/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
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
		id: 'gemini-cli',
		displayName: 'Gemini CLI',
		configPath: '.gemini/settings.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'github-copilot',
		displayName: 'GitHub Copilot',
		configPath: '.vscode/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['servers'],
	},
	{
		id: 'amazon-q',
		displayName: 'Amazon Q',
		configPath: '.amazonq/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'jetbrains-ai',
		displayName: 'JetBrains AI',
		configPath: '.idea/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'tabnine',
		displayName: 'Tabnine',
		configPath: '.tabnine/mcp_servers.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'cline',
		displayName: 'Cline',
		configPath: '.vscode/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	},
	{
		id: 'kilo-code',
		displayName: 'Kilo Code',
		configPath: '.kilocode/mcp.json',
		format: 'json',
		permissionsConfig: {
			filePath: '.kilocode/mcp.json',
			allowKeyPath: ['mcpServers', 'constellation', 'alwaysAllow'],
			allowValue: 'execute_code',
		},
		mcpServersKeyPath: ['mcpServers'],
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
