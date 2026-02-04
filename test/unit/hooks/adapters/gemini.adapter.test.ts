import { describe, expect, it } from '@jest/globals';
import { GeminiHookAdapter } from '../../../../src/hooks/adapters/gemini.adapter';
import type { CanonicalHook } from '../../../../src/hooks/types';

describe('GeminiHookAdapter', () => {
	const adapter = new GeminiHookAdapter();

	describe('properties', () => {
		it('should have correct id', () => {
			expect(adapter.id).toBe('gemini');
		});

		it('should have correct displayName', () => {
			expect(adapter.displayName).toBe('Gemini CLI');
		});
	});

	describe('mapEventName', () => {
		it('should map SessionStart to SessionStart', () => {
			expect(adapter.mapEventName('SessionStart')).toBe('SessionStart');
		});

		it('should map SubagentStart to BeforeAgent', () => {
			expect(adapter.mapEventName('SubagentStart')).toBe('BeforeAgent');
		});

		it('should map PreCompact to PreCompress', () => {
			expect(adapter.mapEventName('PreCompact')).toBe('PreCompress');
		});

		it('should map PreToolUse to BeforeTool', () => {
			expect(adapter.mapEventName('PreToolUse')).toBe('BeforeTool');
		});

		it('should map PostToolUse to AfterTool', () => {
			expect(adapter.mapEventName('PostToolUse')).toBe('AfterTool');
		});

		it('should map SessionEnd to SessionEnd', () => {
			expect(adapter.mapEventName('SessionEnd')).toBe('SessionEnd');
		});
	});

	describe('customizePrompt', () => {
		it('should replace {MCP_TOOL_NAME} placeholder with Gemini tool name', () => {
			const hook: CanonicalHook = {
				event: 'SessionStart',
				type: 'prompt',
				content: 'Use {MCP_TOOL_NAME} for code analysis.',
			};

			const result = adapter.customizePrompt(hook);

			expect(result).toBe('Use query_code_graph for code analysis.');
		});

		it('should replace multiple {MCP_TOOL_NAME} occurrences', () => {
			const hook: CanonicalHook = {
				event: 'SessionStart',
				type: 'prompt',
				content:
					'{MCP_TOOL_NAME} is primary. Always use {MCP_TOOL_NAME} first.',
			};

			const result = adapter.customizePrompt(hook);

			expect(result).toBe(
				'query_code_graph is primary. Always use query_code_graph first.',
			);
		});

		it('should return content unchanged if no placeholder present', () => {
			const hook: CanonicalHook = {
				event: 'SessionStart',
				type: 'prompt',
				content: 'No placeholder here.',
			};

			const result = adapter.customizePrompt(hook);

			expect(result).toBe('No placeholder here.');
		});
	});

	describe('generateConfig', () => {
		it('should generate valid Gemini hooks schema without version', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test prompt',
					matcher: '.*',
				},
			];

			const config = adapter.generateConfig(hooks);

			expect(config.version).toBeUndefined();
			expect(config.hooks).toBeDefined();
		});

		it('should use PascalCase event names for Gemini', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Session start prompt',
				},
				{
					event: 'SubagentStart',
					type: 'prompt',
					content: 'Subagent prompt',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<string, unknown>;

			expect(hooksConfig.SessionStart).toBeDefined();
			expect(hooksConfig.BeforeAgent).toBeDefined();
			expect(hooksConfig.sessionStart).toBeUndefined();
		});

		it('should use nested matcher/hooks structure', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test prompt',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>
			>;
			const sessionStartHooks = hooksConfig.SessionStart;

			expect(sessionStartHooks).toHaveLength(1);
			expect(sessionStartHooks[0].matcher).toBe('startup');
			expect(sessionStartHooks[0].hooks).toHaveLength(1);
			expect(sessionStartHooks[0].hooks[0].type).toBe('command');
		});

		it('should include name, type, command, timeout, description in hook entries', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test prompt',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>
			>;
			const hookEntry = hooksConfig.SessionStart[0].hooks[0];

			expect(hookEntry.name).toBe('constellation-sessionstart');
			expect(hookEntry.type).toBe('command');
			expect(hookEntry.command).toBe(
				'$GEMINI_PROJECT_DIR/.gemini/hooks/constellation-session-start.sh',
			);
			expect(hookEntry.timeout).toBe(5000);
			expect(hookEntry.description).toContain('Constellation:');
		});

		it('should return empty hooks object for empty input', () => {
			const config = adapter.generateConfig([]);

			expect(config.hooks).toEqual({});
		});

		it('should group multiple hooks with same event into single matcher group', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'First hook',
				},
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Second hook',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<{ matcher: string; hooks: Array<Record<string, unknown>> }>
			>;

			// Should have one matcher group with two hooks
			expect(hooksConfig.SessionStart).toHaveLength(1);
			expect(hooksConfig.SessionStart[0].hooks).toHaveLength(2);
			expect(hooksConfig.SessionStart[0].matcher).toBe('startup');
		});
	});

	describe('generateAuxiliaryFiles', () => {
		it('should generate shell scripts for each hook', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Use {MCP_TOOL_NAME} as primary tool.',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);

			expect(files).toBeDefined();
			expect(files!.size).toBe(1);
			expect(files!.has('.gemini/hooks/constellation-session-start.sh')).toBe(
				true,
			);
		});

		it('should generate scripts with proper shebang and header', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test content',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);
			const script = files!.get('.gemini/hooks/constellation-session-start.sh');

			expect(script).toContain('#!/bin/bash');
			expect(script).toContain('Constellation SessionStart Hook');
			expect(script).toContain('Generated by constellation-cli');
		});

		it('should use additionalContext for context-injecting events', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test content',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);
			const script = files!.get('.gemini/hooks/constellation-session-start.sh');

			expect(script).toContain('"hookSpecificOutput"');
			expect(script).toContain('"additionalContext"');
		});

		it('should use systemMessage for PreCompress (advisory-only)', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'PreCompact',
					type: 'prompt',
					content: 'Preserve context',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);
			const script = files!.get('.gemini/hooks/constellation-pre-compress.sh');

			expect(script).toContain('"systemMessage"');
			expect(script).not.toContain('"additionalContext"');
			expect(script).toContain('advisory-only');
		});

		it('should replace {MCP_TOOL_NAME} in script content', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Use {MCP_TOOL_NAME} for analysis.',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);
			const script = files!.get('.gemini/hooks/constellation-session-start.sh');

			expect(script).toContain('query_code_graph');
			expect(script).not.toContain('{MCP_TOOL_NAME}');
		});

		it('should return undefined for empty hooks array', () => {
			const files = adapter.generateAuxiliaryFiles([]);

			expect(files).toBeUndefined();
		});

		it('should escape special characters in prompt content', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Line 1\nLine 2\n"quoted"',
				},
			];

			const files = adapter.generateAuxiliaryFiles(hooks);
			const script = files!.get('.gemini/hooks/constellation-session-start.sh');

			// Should have escaped newlines and quotes for JSON
			expect(script).toContain('\\n');
			expect(script).toContain('\\"quoted\\"');
		});
	});
});
