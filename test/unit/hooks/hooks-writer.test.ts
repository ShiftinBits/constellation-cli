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
	chmod: jest.fn(),
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

		it('should preserve non-hook top-level keys like mcpServers (Gemini bug fix)', async () => {
			// Gemini uses the same file for MCP servers and hooks
			// HooksWriter must preserve mcpServers when writing hooks
			const existingConfig = {
				mcpServers: {
					constellation: { command: 'npx', args: ['mcp-constellation'] },
				},
				hooks: {
					existingHook: [{ type: 'command', command: 'echo existing' }],
				},
				customSetting: 'should-be-preserved',
			};
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(existingConfig));
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			const writeCall = mockFileUtils.writeFile.mock.calls[0];
			const writtenConfig = JSON.parse(writeCall[1] as string);

			// mcpServers must be preserved (this was the Gemini bug)
			expect(writtenConfig.mcpServers).toEqual(existingConfig.mcpServers);
			// Other custom keys must be preserved
			expect(writtenConfig.customSetting).toBe('should-be-preserved');
			// Hooks should still be merged correctly
			expect(writtenConfig.hooks.sessionStart).toBeDefined();
			expect(writtenConfig.hooks.existingHook).toBeDefined();
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

	describe('auxiliary file generation', () => {
		const geminiTool: AITool = {
			id: 'gemini-cli',
			displayName: 'Gemini CLI',
			configPath: '.gemini/settings.json',
			format: 'json',
			mcpServersKeyPath: ['mcpServers'],
			hooksConfig: {
				filePath: '.gemini/settings.json',
				schemaVersion: 1,
				adapterId: 'gemini',
			},
		};

		it('should write auxiliary files from adapter', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(geminiTool, testHooks);

			expect(result.success).toBe(true);

			// Should have written config file AND auxiliary script
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			expect(writeCalls.length).toBeGreaterThan(1);

			// Find the script write call
			const scriptWrite = writeCalls.find((call) =>
				(call[0] as string).includes('.sh'),
			);
			expect(scriptWrite).toBeDefined();
			expect(scriptWrite![0]).toContain('.gemini/hooks/constellation-');
		});

		it('should make shell scripts executable', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(geminiTool, testHooks);

			// Should have called chmod with executable permissions
			expect(mockFs.chmod).toHaveBeenCalled();
			const chmodCall = mockFs.chmod.mock.calls[0];
			expect(chmodCall[0]).toContain('.sh');
			expect(chmodCall[1]).toBe(0o755);
		});

		it('should generate scripts with proper content', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(geminiTool, testHooks);

			// Find the script write call
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			const scriptWrite = writeCalls.find((call) =>
				(call[0] as string).includes('.sh'),
			);

			const scriptContent = scriptWrite![1] as string;
			expect(scriptContent).toContain('#!/bin/bash');
			expect(scriptContent).toContain('hookSpecificOutput');
			expect(scriptContent).toContain('additionalContext');
		});

		it('should not call generateAuxiliaryFiles for adapters that do not implement it', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(cursorTool, testHooks);

			// Cursor adapter does not implement generateAuxiliaryFiles
			// Should only have one write call (the config file)
			expect(mockFileUtils.writeFile).toHaveBeenCalledTimes(1);
			expect(mockFs.chmod).not.toHaveBeenCalled();
		});

		it('should not include version in config for Gemini (no version in schema)', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(geminiTool, testHooks);

			// Find the config write call (not the .sh file)
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			const configWrite = writeCalls.find(
				(call) => !(call[0] as string).includes('.sh'),
			);

			const writtenConfig = JSON.parse(configWrite![1] as string);
			expect(writtenConfig.version).toBeUndefined();
			expect(writtenConfig.hooks).toBeDefined();
		});

		it('should return auxiliaryPaths for adapters with auxiliary files', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(geminiTool, testHooks);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toBeDefined();
			expect(result.auxiliaryPaths).toBeDefined();
			expect(result.auxiliaryPaths!.length).toBeGreaterThan(0);
			expect(result.auxiliaryPaths![0]).toContain('.gemini/hooks/');
		});
	});

	describe('Cline hooks (scripts only)', () => {
		const clineTool: AITool = {
			id: 'cline',
			displayName: 'Cline',
			configPath: 'cline_mcp_settings.json',
			format: 'json',
			mcpServersKeyPath: ['mcpServers'],
			hooksConfig: {
				filePath: '.clinerules/hooks/placeholder',
				schemaVersion: 1,
				adapterId: 'cline',
			},
		};

		it('should generate TaskStart script for Cline', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(clineTool, testHooks);

			expect(result.success).toBe(true);

			// Check that TaskStart script was written
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			const scriptWrite = writeCalls.find((call) =>
				(call[0] as string).includes('TaskStart'),
			);
			expect(scriptWrite).toBeDefined();
			expect(scriptWrite![0]).toContain('.clinerules/hooks/TaskStart');
		});

		it('should make Cline hook scripts executable (no .sh extension)', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(clineTool, testHooks);

			// Should have called chmod with executable permissions for TaskStart
			expect(mockFs.chmod).toHaveBeenCalled();
			const chmodCall = mockFs.chmod.mock.calls[0];
			expect(chmodCall[0]).toContain('TaskStart');
			expect(chmodCall[1]).toBe(0o755);
		});

		it('should not create config file for Cline (scripts only)', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(clineTool, testHooks);

			expect(result.success).toBe(true);
			// configuredPath should be undefined since no config file was written
			expect(result.configuredPath).toBeUndefined();

			// Should only write the TaskStart script, not a config file
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			expect(writeCalls.length).toBe(1);
			expect(writeCalls[0][0]).toContain('TaskStart');
		});

		it('should return auxiliaryPaths for Cline hooks', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			const result = await writer.configureHooks(clineTool, testHooks);

			expect(result.success).toBe(true);
			expect(result.configuredPath).toBeUndefined();
			expect(result.auxiliaryPaths).toBeDefined();
			expect(result.auxiliaryPaths).toHaveLength(1);
			expect(result.auxiliaryPaths![0]).toBe('.clinerules/hooks/TaskStart');
		});

		it('should use contextModification in Cline scripts', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			const writer = new HooksWriter('/test');
			await writer.configureHooks(clineTool, testHooks);

			const writeCalls = mockFileUtils.writeFile.mock.calls;
			const scriptWrite = writeCalls.find((call) =>
				(call[0] as string).includes('TaskStart'),
			);

			const scriptContent = scriptWrite![1] as string;
			expect(scriptContent).toContain('#!/bin/bash');
			expect(scriptContent).toContain('"cancel": false');
			expect(scriptContent).toContain('"contextModification"');
			// Should NOT contain Gemini's format
			expect(scriptContent).not.toContain('hookSpecificOutput');
			expect(scriptContent).not.toContain('additionalContext');
		});

		it('should only create TaskStart from Constellation hooks (skip unsupported)', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);
			mockFileUtils.writeFile.mockResolvedValue(undefined);
			mockFs.chmod.mockResolvedValue(undefined);

			// Use multiple hooks including unsupported ones
			const multipleHooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Session start prompt',
					matcher: '.*',
				},
				{
					event: 'SubagentStart',
					type: 'prompt',
					content: 'Subagent prompt',
					matcher: 'Explore|Plan',
				},
				{
					event: 'PreCompact',
					type: 'prompt',
					content: 'Preserve context',
					matcher: '.*',
				},
			];

			const writer = new HooksWriter('/test');
			await writer.configureHooks(clineTool, multipleHooks);

			// Should only write TaskStart, not SubagentStart or PreCompact
			const writeCalls = mockFileUtils.writeFile.mock.calls;
			expect(writeCalls.length).toBe(1);
			expect(writeCalls[0][0]).toContain('TaskStart');
		});
	});
});
