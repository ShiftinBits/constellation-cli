import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import { HooksWriter } from '../../../src/hooks/hooks-writer';
import type { CanonicalHook } from '../../../src/hooks/types';
import type { AITool } from '../../../src/mcp/types';
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

describe('HooksWriter', () => {
	const testHooks: CanonicalHook[] = [
		{
			event: 'SessionStart',
			type: 'prompt',
			content: 'Test {MCP_TOOL_NAME} prompt',
			matcher: '.*',
		},
	];

	const cursorTool: AITool = {
		id: 'cursor',
		displayName: 'Cursor',
		configPath: '.cursor/mcp.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		hooksConfig: {
			filePath: '.cursor/hooks.json',
			schemaVersion: 1,
			adapterId: 'cursor',
		},
	};

	const toolWithoutHooks: AITool = {
		id: 'no-hooks-tool',
		displayName: 'No Hooks Tool',
		configPath: '.tool/config.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
	};

	const toolWithUnknownAdapter: AITool = {
		id: 'unknown-adapter-tool',
		displayName: 'Unknown Adapter Tool',
		configPath: '.tool/config.json',
		format: 'json',
		mcpServersKeyPath: ['mcpServers'],
		hooksConfig: {
			filePath: '.tool/hooks.json',
			schemaVersion: 1,
			adapterId: 'nonexistent-adapter',
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockFs.mkdir.mockResolvedValue(undefined);
	});

	describe('constructor', () => {
		it('should use provided cwd', () => {
			const writer = new HooksWriter('/custom/path');
			expect(writer).toBeDefined();
		});

		it('should use process.cwd when no path provided', () => {
			const writer = new HooksWriter();
			expect(writer).toBeDefined();
		});
	});

	describe('configureHooks', () => {
		it('should return error for tool without hooksConfig', async () => {
			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(toolWithoutHooks, testHooks);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Tool does not support hooks configuration');
			expect(result.toolId).toBe('no-hooks-tool');
			expect(result.toolDisplayName).toBe('No Hooks Tool');
		});

		it('should return error for unknown adapter', async () => {
			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(
				toolWithUnknownAdapter,
				testHooks,
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Unknown adapter: nonexistent-adapter');
		});

		it('should create new hooks file when none exists', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(cursorTool, testHooks);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toContain('.cursor/hooks.json');
			expect(mockFs.mkdir).toHaveBeenCalled();
			expect(mockFileUtils.writeFile).toHaveBeenCalled();
		});

		it('should write valid JSON with correct formatting', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			// Should use tabs for indentation
			expect(writtenContent).toContain('\t');
			// Should end with newline
			expect(writtenContent.endsWith('\n')).toBe(true);
			// Should be valid JSON
			expect(() => JSON.parse(writtenContent)).not.toThrow();
		});

		it('should generate config with version and hooks', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);

			expect(writtenConfig.version).toBe(1);
			expect(writtenConfig.hooks).toBeDefined();
			expect(writtenConfig.hooks.sessionStart).toBeDefined();
		});

		it('should preserve existing user hooks when merging', async () => {
			const existingConfig = {
				version: 1,
				hooks: {
					customEvent: [
						{
							type: 'command',
							command: './user-script.sh',
						},
					],
				},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);

			// User's custom event should be preserved
			expect(writtenConfig.hooks.customEvent).toBeDefined();
			expect(writtenConfig.hooks.customEvent[0].command).toBe(
				'./user-script.sh',
			);
			// Constellation hooks should be added
			expect(writtenConfig.hooks.sessionStart).toBeDefined();
		});

		it('should replace existing Constellation hooks on re-run', async () => {
			const existingConfig = {
				version: 1,
				hooks: {
					sessionStart: [
						{
							type: 'prompt',
							prompt: 'Old Constellation prompt',
							matcher: '.*',
						},
					],
				},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);

			// Should have new prompt, not old one
			expect(writtenConfig.hooks.sessionStart[0].prompt).toContain(
				'constellation__query_code_graph',
			);
			expect(writtenConfig.hooks.sessionStart[0].prompt).not.toContain(
				'Old Constellation prompt',
			);
		});

		it('should handle invalid JSON in existing file gracefully', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue('not valid json');
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(cursorTool, testHooks);

			// Should still succeed by treating as empty config
			expect(result.success).toBe(true);
		});

		it('should handle file write errors', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockRejectedValue(new Error('Write failed'));

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(cursorTool, testHooks);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Write failed');
		});

		it('should handle directory creation errors', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(cursorTool, testHooks);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Permission denied');
		});

		it('should use version from new config when merging', async () => {
			const existingConfig = {
				version: 1,
				hooks: {},
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);

			expect(writtenConfig.version).toBe(1);
		});

		it('should return correct result structure on success', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(cursorTool, testHooks);

			expect(result).toEqual({
				toolId: 'cursor',
				toolDisplayName: 'Cursor',
				success: true,
				configuredPath: expect.stringContaining('.cursor/hooks.json'),
			});
		});
	});
});
