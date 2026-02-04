import { describe, expect, it } from '@jest/globals';
import {
	AI_TOOLS,
	CONSTELLATION_MCP_CONFIG,
	getProjectConfigurableTools,
	getToolById,
} from '../../../src/mcp/tool-registry';

describe('tool-registry', () => {
	describe('CONSTELLATION_MCP_CONFIG', () => {
		it('should have correct command', () => {
			expect(CONSTELLATION_MCP_CONFIG.command).toBe('npx');
		});

		it('should have correct args', () => {
			expect(CONSTELLATION_MCP_CONFIG.args).toEqual([
				'-y',
				'@constellationdev/cli@latest',
			]);
		});
	});

	describe('AI_TOOLS', () => {
		it('should contain 11 tools', () => {
			expect(AI_TOOLS).toHaveLength(11);
		});

		it('should have all required properties for each tool', () => {
			for (const tool of AI_TOOLS) {
				expect(tool).toHaveProperty('id');
				expect(tool).toHaveProperty('displayName');
				expect(tool).toHaveProperty('configPath');
				expect(tool).toHaveProperty('format');
				expect(tool).toHaveProperty('mcpServersKeyPath');
			}
		});

		it('should not include unsupported global-only tools', () => {
			const unsupportedGlobalIds = ['windsurf'];
			for (const id of unsupportedGlobalIds) {
				const tool = AI_TOOLS.find((t) => t.id === id);
				expect(tool).toBeUndefined();
			}
		});

		it('should have cursor tool', () => {
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor');
			expect(cursor).toBeDefined();
			expect(cursor?.displayName).toBe('Cursor');
			expect(cursor?.format).toBe('json');
			expect(cursor?.configPath).toBe('.cursor/mcp.json');
		});

		it('should have claude-code tool with permissions config', () => {
			const claudeCode = AI_TOOLS.find((t) => t.id === 'claude-code');
			expect(claudeCode).toBeDefined();
			expect(claudeCode?.displayName).toBe('Claude Code');
			expect(claudeCode?.permissionsConfig).toBeDefined();
			expect(claudeCode?.permissionsConfig?.filePath).toBe(
				'.claude/settings.json',
			);
			expect(claudeCode?.permissionsConfig?.allowKeyPath).toEqual([
				'permissions',
				'allow',
			]);
			expect(claudeCode?.permissionsConfig?.allowValue).toBe(
				'mcp__constellation__*',
			);
		});

		it('should have gemini-cli tool', () => {
			const gemini = AI_TOOLS.find((t) => t.id === 'gemini-cli');
			expect(gemini).toBeDefined();
			expect(gemini?.displayName).toBe('Gemini CLI');
		});

		it('should have vscode-copilot tool with servers keyPath', () => {
			const copilot = AI_TOOLS.find((t) => t.id === 'vscode-copilot');
			expect(copilot).toBeDefined();
			expect(copilot?.displayName).toBe('VSCode');
			expect(copilot?.mcpServersKeyPath).toEqual(['servers']);
		});

		it('should have copilot-cli tool with absolute home path and getGlobalConfigPaths', () => {
			const copilotCli = AI_TOOLS.find((t) => t.id === 'copilot-cli');
			expect(copilotCli).toBeDefined();
			expect(copilotCli?.displayName).toBe('Copilot CLI');
			expect(copilotCli?.isGlobalConfig).toBe(true);
			// Should be an absolute path, not a tilde path
			expect(copilotCli?.configPath).not.toContain('~');
			expect(copilotCli?.configPath).toMatch(/\.copilot.*mcp-config\.json$/);
			// Should have getGlobalConfigPaths function for proper global config handling
			expect(copilotCli?.getGlobalConfigPaths).toBeDefined();
			const paths = copilotCli?.getGlobalConfigPaths?.();
			expect(paths).toHaveLength(1);
			expect(paths?.[0].displayName).toBe('Copilot CLI');
			expect(paths?.[0].settingsPath).toMatch(/\.copilot.*mcp-config\.json$/);
		});

		it('should have jetbrains-ai tool with servers keyPath', () => {
			const jetbrains = AI_TOOLS.find((t) => t.id === 'jetbrains-ai');
			expect(jetbrains).toBeDefined();
			expect(jetbrains?.displayName).toBe('JetBrains');
			expect(jetbrains?.configPath).toBe('.ai/mcp/mcp.json');
			expect(jetbrains?.mcpServersKeyPath).toEqual(['mcpServers']);
			expect(jetbrains?.mcpEnv).toEqual({
				CONSTELLATION_ACCESS_KEY: 'CONSTELLATION_ACCESS_KEY',
			});
			expect(jetbrains?.mcpServerExtras).toEqual({
				tools: ['query_code_graph'],
			});
		});

		it('should have tabnine tool', () => {
			const tabnine = AI_TOOLS.find((t) => t.id === 'tabnine');
			expect(tabnine).toBeDefined();
			expect(tabnine?.displayName).toBe('Tabnine');
		});

		it('should have cline tool', () => {
			const cline = AI_TOOLS.find((t) => t.id === 'cline');
			expect(cline).toBeDefined();
			expect(cline?.displayName).toBe('Cline');
		});

		it('should have codex-cli tool with TOML format and env', () => {
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli');
			expect(codex).toBeDefined();
			expect(codex?.displayName).toBe('Codex CLI');
			expect(codex?.format).toBe('toml');
			expect(codex?.configPath).toBe('.codex/config.toml');
			expect(codex?.mcpServersKeyPath).toEqual(['mcp_servers']);
			expect(codex?.mcpEnv).toEqual({
				CONSTELLATION_ACCESS_KEY: '$CONSTELLATION_ACCESS_KEY',
			});
			// Codex CLI is now project-local (not global)
			expect(codex?.isGlobalConfig).toBeUndefined();
		});

		it('should have kilo-code tool with permissions config', () => {
			const kilo = AI_TOOLS.find((t) => t.id === 'kilo-code');
			expect(kilo).toBeDefined();
			expect(kilo?.displayName).toBe('Kilo Code');
			expect(kilo?.permissionsConfig).toBeDefined();
			expect(kilo?.permissionsConfig?.filePath).toBe('.kilocode/mcp.json');
			expect(kilo?.permissionsConfig?.allowKeyPath).toEqual([
				'mcpServers',
				'constellation',
				'alwaysAllow',
			]);
			expect(kilo?.permissionsConfig?.allowValue).toBe('query_code_graph');
		});

		it('should have opencode tool with JSONC format and plugin config', () => {
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode');
			expect(opencode).toBeDefined();
			expect(opencode?.displayName).toBe('OpenCode');
			expect(opencode?.format).toBe('jsonc');
			expect(opencode?.configPath).toBe('opencode.jsonc');
			// mcpServersKeyPath required by interface but unused when skipMcpServer=true
			expect(opencode?.mcpServersKeyPath).toEqual(['mcp']);
			// Plugin-only configuration (no MCP server config)
			expect(opencode?.skipMcpServer).toBe(true);
			expect(opencode?.pluginConfig).toEqual({
				pluginKeyPath: ['plugin'],
				pluginValue: '@constellationdev/opencode',
			});
			// No MCP server properties (plugin handles this internally)
			expect(opencode?.mcpServerConfigOverride).toBeUndefined();
			expect(opencode?.mcpEnvKey).toBeUndefined();
			expect(opencode?.mcpEnv).toBeUndefined();
			expect(opencode?.mcpServerExtras).toBeUndefined();
			// Root-level defaults still apply
			expect(opencode?.configDefaults).toEqual({
				$schema: 'https://opencode.ai/config.json',
			});
		});
	});

	describe('getToolById', () => {
		it('should return tool when found', () => {
			const tool = getToolById('cursor');
			expect(tool).toBeDefined();
			expect(tool?.id).toBe('cursor');
		});

		it('should return undefined when not found', () => {
			const tool = getToolById('nonexistent');
			expect(tool).toBeUndefined();
		});
	});

	describe('getProjectConfigurableTools', () => {
		it('should return all tools (all have configPath)', () => {
			const tools = getProjectConfigurableTools();
			expect(tools).toHaveLength(AI_TOOLS.length);
			for (const tool of tools) {
				expect(tool.configPath).toBeDefined();
			}
		});
	});
});
