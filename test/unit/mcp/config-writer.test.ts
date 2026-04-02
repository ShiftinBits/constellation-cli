import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import { ConfigWriter } from '../../../src/mcp/config-writer';
import { AI_TOOLS } from '../../../src/mcp/tool-registry';
import { FileUtils } from '../../../src/utils/file.utils';

// Mock FileUtils
jest.mock('../../../src/utils/file.utils', () => ({
	FileUtils: {
		fileIsReadable: jest.fn(),
		readFile: jest.fn(),
		writeFile: jest.fn(),
	},
}));

// Mock fs/promises
jest.mock('node:fs/promises', () => ({
	mkdir: jest.fn(),
}));

const mockFileUtils = FileUtils as jest.Mocked<typeof FileUtils>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigWriter', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFs.mkdir.mockResolvedValue(undefined);
	});

	describe('constructor', () => {
		it('should use provided cwd', () => {
			const writer = new ConfigWriter('/custom/path');
			expect(writer).toBeDefined();
		});

		it('should use process.cwd when no path provided', () => {
			const writer = new ConfigWriter();
			expect(writer).toBeDefined();
		});
	});

	describe('configureTool', () => {
		it('should create new config file when none exists', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			const result = await writer.configureTool(cursor);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toContain('.cursor/mcp.json');
			expect(mockFileUtils.writeFile).toHaveBeenCalled();
		});

		it('should preserve existing config when adding constellation', async () => {
			const existingConfig = {
				mcpServers: {
					existingServer: {
						command: 'existing',
						args: ['arg1'],
					},
				},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			const result = await writer.configureTool(cursor);

			expect(result.success).toBe(true);

			// Check that writeFile was called with both servers
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);
			expect(writtenConfig.mcpServers.existingServer).toBeDefined();
			expect(writtenConfig.mcpServers.constellation).toBeDefined();
		});

		it('should not duplicate constellation if already configured', async () => {
			const existingConfig = {
				mcpServers: {
					constellation: {
						command: 'old-command',
						args: ['old-arg'],
					},
				},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			const result = await writer.configureTool(cursor);

			expect(result.success).toBe(true);

			// Check that the original constellation config is preserved
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);
			expect(writtenConfig.mcpServers.constellation.command).toBe(
				'old-command',
			);
		});

		it('should create directories if they do not exist', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			await writer.configureTool(cursor);

			expect(mockFs.mkdir).toHaveBeenCalledWith(
				expect.stringContaining('.cursor'),
				{ recursive: true },
			);
		});

		it('should configure Claude Code permissions', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const claudeCode = AI_TOOLS.find((t) => t.id === 'claude-code')!;
			await writer.configureTool(claudeCode);

			// Should have three write calls: config, permissions, and marketplace
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(3);

			// Check permissions file was written with correct structure
			const permissionsCall = mockFileUtils.writeFile.mock.calls[1];
			const settings = JSON.parse(permissionsCall[1] as string);
			expect(settings.permissions.allow).toContain(
				'mcp__plugin_constellation_*',
			);
		});

		it('should configure Claude Code marketplace settings', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const claudeCode = AI_TOOLS.find((t) => t.id === 'claude-code')!;
			await writer.configureTool(claudeCode);

			// Should have three write calls: config, permissions, and marketplace
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(3);

			// Find the marketplace write call (last one to .claude/settings.json)
			const marketplaceCall = mockFileUtils.writeFile.mock.calls[2];
			const settings = JSON.parse(marketplaceCall[1] as string);

			// Check marketplace configuration
			expect(settings.extraKnownMarketplaces).toBeDefined();
			expect(
				settings.extraKnownMarketplaces['constellation-plugins'],
			).toBeDefined();
			expect(
				settings.extraKnownMarketplaces['constellation-plugins'].source.source,
			).toBe('github');
			expect(
				settings.extraKnownMarketplaces['constellation-plugins'].source.repo,
			).toBe('ShiftinBits/constellation-claude');

			// Check enabled plugins
			expect(settings.enabledPlugins).toBeDefined();
			expect(
				settings.enabledPlugins['constellation@constellation-plugins'],
			).toBe(true);
		});

		it('should deep merge marketplace settings preserving existing properties', async () => {
			const existingSettings = {
				someExistingProperty: 'value',
				extraKnownMarketplaces: {
					'other-marketplace': {
						source: { source: 'github', repo: 'other/repo' },
					},
				},
				enabledPlugins: {
					'other-plugin@other-marketplace': true,
				},
			};

			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('settings.json')) {
					return true;
				}
				return false;
			});
			mockFileUtils.readFile.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('settings.json')) {
					return JSON.stringify(existingSettings);
				}
				return '{}';
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const claudeCode = AI_TOOLS.find((t) => t.id === 'claude-code')!;
			await writer.configureTool(claudeCode);

			// Find the last marketplace write call
			const marketplaceCalls = mockFileUtils.writeFile.mock.calls.filter(
				(call) =>
					typeof call[0] === 'string' && call[0].includes('settings.json'),
			);
			const lastMarketplaceCall = marketplaceCalls[marketplaceCalls.length - 1];
			const settings = JSON.parse(lastMarketplaceCall[1] as string);

			// Should preserve existing top-level property
			expect(settings.someExistingProperty).toBe('value');

			// Should preserve existing marketplace
			expect(
				settings.extraKnownMarketplaces['other-marketplace'],
			).toBeDefined();

			// Should add new marketplace
			expect(
				settings.extraKnownMarketplaces['constellation-plugins'],
			).toBeDefined();

			// Should preserve existing enabled plugin
			expect(settings.enabledPlugins['other-plugin@other-marketplace']).toBe(
				true,
			);

			// Should add new enabled plugin
			expect(
				settings.enabledPlugins['constellation@constellation-plugins'],
			).toBe(true);
		});

		it('should configure Kilo Code permissions with different allowKeyPath', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const kiloCode = AI_TOOLS.find((t) => t.id === 'kilo-code')!;
			await writer.configureTool(kiloCode);

			// Should have two write calls: config and permissions
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(2);

			// Check permissions file was written with correct nested structure
			const permissionsCall = mockFileUtils.writeFile.mock.calls[1];
			const settings = JSON.parse(permissionsCall[1] as string);
			// Kilo Code uses mcpServers.constellation.alwaysAllow path
			expect(settings.mcpServers.constellation.alwaysAllow).toContain(
				'code_intel',
			);
		});

		it('should include env configuration for Kilo Code', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const kiloCode = AI_TOOLS.find((t) => t.id === 'kilo-code')!;
			await writer.configureTool(kiloCode);

			// Check MCP config has env block
			const configCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(configCall[1] as string);
			expect(config.mcpServers.constellation.env).toEqual({
				CONSTELLATION_ACCESS_KEY: '${env:CONSTELLATION_ACCESS_KEY}',
			});
		});

		it('should preserve existing permissions when adding constellation', async () => {
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('settings.json')) {
					return true;
				}
				return false;
			});
			mockFileUtils.readFile.mockResolvedValue(
				JSON.stringify({
					permissions: {
						allow: ['existing_permission'],
						deny: [],
						ask: [],
					},
				}),
			);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const claudeCode = AI_TOOLS.find((t) => t.id === 'claude-code')!;
			await writer.configureTool(claudeCode);

			// Find the permissions write call
			const permissionsCall = mockFileUtils.writeFile.mock.calls.find(
				(call) =>
					typeof call[0] === 'string' && call[0].includes('settings.json'),
			);
			const settings = JSON.parse(permissionsCall![1] as string);
			expect(settings.permissions.allow).toContain('existing_permission');
			expect(settings.permissions.allow).toContain(
				'mcp__plugin_constellation_*',
			);
		});

		it('should return error when configuration fails', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockRejectedValue(new Error('Write failed'));

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			const result = await writer.configureTool(cursor);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Write failed');
		});

		it('should handle nested mcpServersKeyPath', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			// Create a mock tool with nested mcpServersKeyPath
			const mockTool = {
				id: 'mock-nested',
				displayName: 'Mock Nested',
				description: 'Mock tool with nested key path',
				configPath: '.mock/config.json',
				format: 'json' as const,
				mcpServersKeyPath: ['settings', 'mcp', 'servers'],
			};

			await writer.configureTool(mockTool);

			expect(mockFileUtils.writeFile).toHaveBeenCalled();
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			// Verify nested structure was created
			expect(config.settings.mcp.servers.constellation).toBeDefined();
		});
	});

	describe('JSON format handling', () => {
		it('should format JSON with 2-space indentation', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			await writer.configureTool(cursor);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('\n');
			expect(written).toMatch(/^\{\n {2}/); // 2-space indentation
		});

		it('should normalize CRLF line endings to LF', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			await writer.configureTool(cursor);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;

			// Should not contain CRLF
			expect(written).not.toContain('\r\n');
			// Should contain LF
			expect(written).toContain('\n');
		});

		it('should ensure trailing newline in output', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			await writer.configureTool(cursor);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;

			expect(written.endsWith('\n')).toBe(true);
		});

		it('should handle invalid JSON in existing config', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue('invalid json');
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const cursor = AI_TOOLS.find((t) => t.id === 'cursor')!;
			const result = await writer.configureTool(cursor);

			// Should succeed by creating new config
			expect(result.success).toBe(true);
		});
	});

	describe('TOML format handling', () => {
		it('should create new TOML config file when none exists', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTomlTool = {
				id: 'mock-toml',
				displayName: 'Mock TOML Tool',
				configPath: '/test/config.toml',
				format: 'toml' as const,
				mcpServersKeyPath: ['mcp_servers'],
			};

			const result = await writer.configureTool(mockTomlTool);

			expect(result.success).toBe(true);
			expect(mockFileUtils.writeFile).toHaveBeenCalled();

			// Verify TOML output structure
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('[mcp_servers.constellation]');
			expect(written).toContain('command');
			expect(written).toContain('npx');
		});

		it('should preserve existing TOML config when adding constellation', async () => {
			const existingToml = `[mcp_servers.other_server]
command = "other"
args = ["arg1"]
`;
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(existingToml);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTomlTool = {
				id: 'mock-toml',
				displayName: 'Mock TOML Tool',
				configPath: '/test/config.toml',
				format: 'toml' as const,
				mcpServersKeyPath: ['mcp_servers'],
			};

			const result = await writer.configureTool(mockTomlTool);

			expect(result.success).toBe(true);

			// Verify both servers are in output
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('other_server');
			expect(written).toContain('constellation');
		});

		it('should not duplicate constellation if already in TOML config', async () => {
			const existingToml = `[mcp_servers.constellation]
command = "old-command"
args = ["old-arg"]
`;
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(existingToml);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTomlTool = {
				id: 'mock-toml',
				displayName: 'Mock TOML Tool',
				configPath: '/test/config.toml',
				format: 'toml' as const,
				mcpServersKeyPath: ['mcp_servers'],
			};

			const result = await writer.configureTool(mockTomlTool);

			expect(result.success).toBe(true);

			// Verify original config is preserved
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('old-command');
		});

		it('should handle invalid TOML in existing config gracefully', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue('invalid [[ toml');
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTomlTool = {
				id: 'mock-toml',
				displayName: 'Mock TOML Tool',
				configPath: '/test/config.toml',
				format: 'toml' as const,
				mcpServersKeyPath: ['mcp_servers'],
			};

			const result = await writer.configureTool(mockTomlTool);

			// Should succeed by creating new config (same as JSON behavior)
			expect(result.success).toBe(true);
		});
	});

	describe('Codex CLI configuration', () => {
		it('should have correct tool configuration', () => {
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli');

			expect(codex).toBeDefined();
			expect(codex!.format).toBe('toml');
			expect(codex!.configPath).toBe('.codex/config.toml');
			expect(codex!.mcpServersKeyPath).toEqual(['mcp_servers']);
			expect(codex!.mcpEnv).toEqual({
				CONSTELLATION_ACCESS_KEY: '$CONSTELLATION_ACCESS_KEY',
			});
			expect(codex!.mcpServerExtras).toEqual({
				enabled_tools: ['code_intel'],
			});
			// Codex CLI is now project-local (not global)
			expect(codex!.isGlobalConfig).toBeUndefined();
			// Verify envPolicyConfig is set
			expect(codex!.envPolicyConfig).toBeDefined();
			expect(codex!.envPolicyConfig!.includeOnlyKeyPath).toEqual([
				'shell_environment_policy',
				'include_only',
			]);
			expect(codex!.envPolicyConfig!.envVarsToAllow).toEqual([
				'CONSTELLATION_ACCESS_KEY',
			]);
			expect(codex!.envPolicyConfig!.globalConfigPath).toBe(
				'~/.codex/config.toml',
			);
		});

		it('should configure Codex CLI with env block and enabled_tools', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			const result = await writer.configureTool(codex);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toContain('.codex/config.toml');

			// Verify TOML output includes env block and enabled_tools
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('[mcp_servers.constellation]');
			expect(written).toContain('command');
			expect(written).toContain('npx');
			expect(written).toContain('[mcp_servers.constellation.env]');
			expect(written).toContain('CONSTELLATION_ACCESS_KEY');
			expect(written).toContain('enabled_tools');
			expect(written).toContain('code_intel');
		});
	});

	describe('JSONC format handling', () => {
		it('should read JSONC with single-line comments', async () => {
			const jsoncContent = `{
  // This is a comment
  "mcp": {
    "existingServer": {
      "command": "existing"
    }
  }
}`;
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(jsoncContent);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-jsonc',
				displayName: 'Mock JSONC',
				configPath: 'test.jsonc',
				format: 'jsonc' as const,
				mcpServersKeyPath: ['mcp'],
			};

			const result = await writer.configureTool(mockTool);

			expect(result.success).toBe(true);
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcp.existingServer).toBeDefined();
			expect(config.mcp.constellation).toBeDefined();
		});

		it('should read JSONC with multi-line comments and trailing commas', async () => {
			const jsoncContent = `{
  /* Multi-line
     comment */
  "mcp": {
    "existingServer": {
      "command": "existing",
    },
  },
}`;
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(jsoncContent);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-jsonc',
				displayName: 'Mock JSONC',
				configPath: 'test.jsonc',
				format: 'jsonc' as const,
				mcpServersKeyPath: ['mcp'],
			};

			const result = await writer.configureTool(mockTool);

			expect(result.success).toBe(true);
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcp.existingServer.command).toBe('existing');
		});

		it('should write JSONC format as standard JSON', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-jsonc',
				displayName: 'Mock JSONC',
				configPath: 'test.jsonc',
				format: 'jsonc' as const,
				mcpServersKeyPath: ['mcp'],
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			// Should be valid JSON (no comments in output)
			expect(() => JSON.parse(written)).not.toThrow();
		});
	});

	describe('mcpServerConfigOverride', () => {
		it('should use override config instead of default', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-override',
				displayName: 'Mock Override',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
				mcpServerConfigOverride: {
					command: ['npx', '-y', '@custom/mcp@latest'],
				},
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcpServers.constellation.command).toEqual([
				'npx',
				'-y',
				'@custom/mcp@latest',
			]);
			// Should NOT have the default command/args
			expect(config.mcpServers.constellation.args).toBeUndefined();
		});

		it('should fall back to default config when no override', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-default',
				displayName: 'Mock Default',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcpServers.constellation.command).toBe('npx');
			expect(config.mcpServers.constellation.args).toEqual([
				'-y',
				'@constellationdev/mcp@latest',
			]);
		});
	});

	describe('mcpEnvKey', () => {
		it('should use custom env key when specified', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-envkey',
				displayName: 'Mock EnvKey',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
				mcpEnvKey: 'environment',
				mcpEnv: { MY_KEY: 'my_value' },
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcpServers.constellation.environment).toEqual({
				MY_KEY: 'my_value',
			});
			expect(config.mcpServers.constellation.env).toBeUndefined();
		});

		it('should use default env key when not specified', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-default-env',
				displayName: 'Mock Default Env',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
				mcpEnv: { MY_KEY: 'my_value' },
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.mcpServers.constellation.env).toBeDefined();
			expect(config.mcpServers.constellation.env.MY_KEY).toBe('my_value');
		});
	});

	describe('configDefaults', () => {
		it('should apply defaults to new config files', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-defaults',
				displayName: 'Mock Defaults',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
				configDefaults: {
					$schema: 'https://example.com/schema.json',
				},
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.$schema).toBe('https://example.com/schema.json');
		});

		it('should not overwrite existing values with defaults', async () => {
			const existingConfig = {
				$schema: 'https://existing.com/schema.json',
				mcpServers: {},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const mockTool = {
				id: 'mock-defaults',
				displayName: 'Mock Defaults',
				configPath: 'test.json',
				format: 'json' as const,
				mcpServersKeyPath: ['mcpServers'],
				configDefaults: {
					$schema: 'https://new.com/schema.json',
				},
			};

			await writer.configureTool(mockTool);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);
			expect(config.$schema).toBe('https://existing.com/schema.json');
		});
	});

	describe('OpenCode integration', () => {
		it('should produce correct OpenCode plugin config output', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode')!;
			const result = await writer.configureTool(opencode);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toContain('opencode.jsonc');

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);

			// Verify root-level defaults
			expect(config.$schema).toBe('https://opencode.ai/config.json');

			// Verify plugin configuration
			expect(config.plugin).toBeDefined();
			expect(Array.isArray(config.plugin)).toBe(true);
			expect(config.plugin).toContain('@constellationdev/opencode');

			// Verify NO MCP server config (plugin handles this)
			expect(config.mcp).toBeUndefined();
		});
	});

	describe('Plugin configuration', () => {
		it('should preserve existing plugins when adding constellation', async () => {
			const existingConfig = {
				$schema: 'https://opencode.ai/config.json',
				plugin: ['some-other-plugin', '@scope/another-plugin'],
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode')!;
			const result = await writer.configureTool(opencode);

			expect(result.success).toBe(true);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);

			// Existing plugins preserved
			expect(config.plugin).toContain('some-other-plugin');
			expect(config.plugin).toContain('@scope/another-plugin');
			// Constellation added
			expect(config.plugin).toContain('@constellationdev/opencode');
			// Order preserved (appended at end)
			expect(config.plugin).toEqual([
				'some-other-plugin',
				'@scope/another-plugin',
				'@constellationdev/opencode',
			]);
		});

		it('should not duplicate plugin if already present', async () => {
			const existingConfig = {
				plugin: ['@constellationdev/opencode', 'other-plugin'],
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode')!;
			const result = await writer.configureTool(opencode);

			expect(result.success).toBe(true);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);

			// Only one instance of our plugin
			const constellationCount = config.plugin.filter(
				(p: string) => p === '@constellationdev/opencode',
			).length;
			expect(constellationCount).toBe(1);
		});

		it('should create plugin array if it does not exist', async () => {
			const existingConfig = {
				$schema: 'https://opencode.ai/config.json',
				// No plugin key
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode')!;
			const result = await writer.configureTool(opencode);

			expect(result.success).toBe(true);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);

			expect(config.plugin).toBeDefined();
			expect(Array.isArray(config.plugin)).toBe(true);
			expect(config.plugin).toContain('@constellationdev/opencode');
		});

		it('should skip MCP server config for plugin-only tools', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const opencode = AI_TOOLS.find((t) => t.id === 'opencode')!;
			await writer.configureTool(opencode);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const config = JSON.parse(writeCall[1] as string);

			// Plugin added
			expect(config.plugin).toContain('@constellationdev/opencode');
			// No MCP server config
			expect(config.mcp).toBeUndefined();
		});
	});

	describe('Environment policy configuration', () => {
		it('should not create policy section if it does not exist', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			// Only one write call (MCP config), no policy section created
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(1);
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).not.toContain('shell_environment_policy');
		});

		it('should add env var to project-level include_only if it exists', async () => {
			const existingToml = `[shell_environment_policy]
include_only = ["PATH", "HOME"]

[mcp_servers.other]
command = "other"
`;
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('.codex/config.toml')) {
					return true;
				}
				return false;
			});
			mockFileUtils.readFile.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('.codex/config.toml')) {
					return existingToml;
				}
				return '';
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			expect(mockFileUtils.writeFile).toHaveBeenCalled();
			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;
			expect(written).toContain('shell_environment_policy');
			expect(written).toContain('include_only');
			expect(written).toContain('PATH');
			expect(written).toContain('HOME');
			expect(written).toContain('CONSTELLATION_ACCESS_KEY');
		});

		it('should not duplicate env var if already in include_only', async () => {
			const existingToml = `[shell_environment_policy]
include_only = ["PATH", "CONSTELLATION_ACCESS_KEY"]

[mcp_servers]
`;
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('.codex/config.toml')) {
					return true;
				}
				return false;
			});
			mockFileUtils.readFile.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('.codex/config.toml')) {
					return existingToml;
				}
				return '';
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const written = writeCall[1] as string;

			// Count occurrences of CONSTELLATION_ACCESS_KEY
			// Should only appear once in include_only (not duplicated)
			const matches = written.match(/CONSTELLATION_ACCESS_KEY/g);
			// It appears in include_only (1), env key (1), and env value (1)
			expect(matches).toHaveLength(3);
		});

		it('should update global config include_only if it exists', async () => {
			const projectToml = `[mcp_servers]
`;
			const globalToml = `[shell_environment_policy]
include_only = ["PATH"]
`;
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string') {
					// Match project config
					if (path.includes('/test/.codex/config.toml')) {
						return true;
					}
					// Match global config (expanded from ~ to home directory)
					if (
						path.includes('/.codex/config.toml') &&
						!path.includes('/test/')
					) {
						return true;
					}
				}
				return false;
			});
			mockFileUtils.readFile.mockImplementation(async (path) => {
				if (typeof path === 'string') {
					if (path.includes('/test/.codex/config.toml')) {
						return projectToml;
					}
					// Global config path (expanded from ~)
					if (
						path.includes('/.codex/config.toml') &&
						!path.includes('/test/')
					) {
						return globalToml;
					}
				}
				return '';
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			// Should have 2 write calls: global config (during configureEnvPolicy) then project config
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(2);

			// First call is global config (written during configureEnvPolicy)
			const globalWriteCall = mockFileUtils.writeFile.mock.calls[0];
			expect(globalWriteCall[0]).toContain('/.codex/config.toml');
			expect(globalWriteCall[0]).not.toContain('/test/');
			const globalWritten = globalWriteCall[1] as string;
			expect(globalWritten).toContain('include_only');
			expect(globalWritten).toContain('PATH');
			expect(globalWritten).toContain('CONSTELLATION_ACCESS_KEY');

			// Second call is project config
			const projectWriteCall = mockFileUtils.writeFile.mock.calls[1];
			expect(projectWriteCall[0]).toContain('/test/.codex/config.toml');
		});

		it('should not write global config if policy does not exist', async () => {
			const projectToml = `[mcp_servers]
`;
			const globalToml = `[some_other_setting]
value = true
`;
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string') {
					if (path.includes('.codex/config.toml')) {
						return true;
					}
				}
				return false;
			});
			mockFileUtils.readFile.mockImplementation(async (path) => {
				if (typeof path === 'string') {
					if (path.includes('/test/.codex/config.toml')) {
						return projectToml;
					}
					if (
						path.includes('/.codex/config.toml') &&
						!path.includes('/test/')
					) {
						return globalToml;
					}
				}
				return '';
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			// Should only have 1 write call (project config)
			// because global config doesn't have shell_environment_policy
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(1);
		});

		it('should not write global config if it does not exist', async () => {
			mockFileUtils.fileIsReadable.mockImplementation(async (path) => {
				if (typeof path === 'string' && path.includes('/test/.codex/')) {
					return false; // Project config doesn't exist
				}
				return false; // Global config doesn't exist
			});
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new ConfigWriter('/test');
			const codex = AI_TOOLS.find((t) => t.id === 'codex-cli')!;
			await writer.configureTool(codex);

			// Should only have 1 write call (project config)
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(1);
			expect(mockFileUtils.writeFile.mock.calls[0][0]).toContain(
				'/test/.codex/config.toml',
			);
		});
	});
});
