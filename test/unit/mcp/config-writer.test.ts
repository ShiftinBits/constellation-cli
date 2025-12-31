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
			expect(settings.permissions.allow).toContain('mcp__constellation__*');
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
				settings.extraKnownMarketplaces['constellation-marketplace'],
			).toBeDefined();
			expect(
				settings.extraKnownMarketplaces['constellation-marketplace'].source
					.source,
			).toBe('github');
			expect(
				settings.extraKnownMarketplaces['constellation-marketplace'].source
					.repo,
			).toBe('ShiftinBits/constellation-claude');

			// Check enabled plugins
			expect(settings.enabledPlugins).toBeDefined();
			expect(
				settings.enabledPlugins['constellation@constellation-marketplace'],
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
				settings.extraKnownMarketplaces['constellation-marketplace'],
			).toBeDefined();

			// Should preserve existing enabled plugin
			expect(settings.enabledPlugins['other-plugin@other-marketplace']).toBe(
				true,
			);

			// Should add new enabled plugin
			expect(
				settings.enabledPlugins['constellation@constellation-marketplace'],
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
				'execute_code',
			);
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
			expect(settings.permissions.allow).toContain('mcp__constellation__*');
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
});
