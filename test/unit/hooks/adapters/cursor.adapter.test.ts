import { describe, expect, it } from '@jest/globals';
import { CursorHookAdapter } from '../../../../src/hooks/adapters/cursor.adapter';
import type { CanonicalHook } from '../../../../src/hooks/types';

describe('CursorHookAdapter', () => {
	const adapter = new CursorHookAdapter();

	describe('properties', () => {
		it('should have correct id', () => {
			expect(adapter.id).toBe('cursor');
		});

		it('should have correct displayName', () => {
			expect(adapter.displayName).toBe('Cursor');
		});
	});

	describe('mapEventName', () => {
		it('should map SessionStart to sessionStart', () => {
			expect(adapter.mapEventName('SessionStart')).toBe('sessionStart');
		});

		it('should map SubagentStart to subagentStart', () => {
			expect(adapter.mapEventName('SubagentStart')).toBe('subagentStart');
		});

		it('should map PreCompact to preCompact', () => {
			expect(adapter.mapEventName('PreCompact')).toBe('preCompact');
		});

		it('should map PreToolUse to preToolUse', () => {
			expect(adapter.mapEventName('PreToolUse')).toBe('preToolUse');
		});

		it('should map PostToolUse to postToolUse', () => {
			expect(adapter.mapEventName('PostToolUse')).toBe('postToolUse');
		});

		it('should map SessionEnd to sessionEnd', () => {
			expect(adapter.mapEventName('SessionEnd')).toBe('sessionEnd');
		});
	});

	describe('customizePrompt', () => {
		it('should replace {MCP_TOOL_NAME} placeholder with Cursor tool name', () => {
			const hook: CanonicalHook = {
				event: 'SessionStart',
				type: 'prompt',
				content: 'Use {MCP_TOOL_NAME} for code analysis.',
			};

			const result = adapter.customizePrompt(hook);

			expect(result).toBe(
				'Use constellation__query_code_graph for code analysis.',
			);
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
				'constellation__query_code_graph is primary. Always use constellation__query_code_graph first.',
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
		it('should generate valid Cursor hooks schema with version 1', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test prompt',
					matcher: '.*',
				},
			];

			const config = adapter.generateConfig(hooks);

			expect(config.version).toBe(1);
			expect(config.hooks).toBeDefined();
		});

		it('should map canonical events to camelCase event names', () => {
			const hooks: CanonicalHook[] = [
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
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<Record<string, unknown>>
			>;

			expect(hooksConfig.sessionStart).toBeDefined();
			expect(hooksConfig.subagentStart).toBeDefined();
			expect(hooksConfig.SessionStart).toBeUndefined();
		});

		it('should include type, prompt, and matcher in hook entries', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Test {MCP_TOOL_NAME} prompt',
					matcher: '.*',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<Record<string, unknown>>
			>;
			const hookEntry = hooksConfig.sessionStart[0];

			expect(hookEntry.type).toBe('prompt');
			expect(hookEntry.prompt).toBe(
				'Test constellation__query_code_graph prompt',
			);
			expect(hookEntry.matcher).toBe('.*');
		});

		it('should not include matcher if not provided', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'No matcher hook',
				},
			];

			const config = adapter.generateConfig(hooks);
			const hooksConfig = config.hooks as Record<
				string,
				Array<Record<string, unknown>>
			>;
			const hookEntry = hooksConfig.sessionStart[0];

			expect(hookEntry.matcher).toBeUndefined();
		});

		it('should handle multiple hooks for the same event', () => {
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
				Array<Record<string, unknown>>
			>;

			expect(hooksConfig.sessionStart).toHaveLength(2);
			expect(hooksConfig.sessionStart[0].prompt).toBe('First hook');
			expect(hooksConfig.sessionStart[1].prompt).toBe('Second hook');
		});

		it('should return empty hooks object for empty input', () => {
			const config = adapter.generateConfig([]);

			expect(config.version).toBe(1);
			expect(config.hooks).toEqual({});
		});

		it('should generate config matching expected Cursor format', () => {
			const hooks: CanonicalHook[] = [
				{
					event: 'SessionStart',
					type: 'prompt',
					content: 'Use {MCP_TOOL_NAME} as primary tool.',
					matcher: '.*',
				},
				{
					event: 'PreCompact',
					type: 'prompt',
					content: 'Preserve {MCP_TOOL_NAME} guidance.',
					matcher: '.*',
				},
			];

			const config = adapter.generateConfig(hooks);

			// Verify structure matches Cursor's expected format
			expect(config).toEqual({
				version: 1,
				hooks: {
					sessionStart: [
						{
							type: 'prompt',
							prompt: 'Use constellation__query_code_graph as primary tool.',
							matcher: '.*',
						},
					],
					preCompact: [
						{
							type: 'prompt',
							prompt: 'Preserve constellation__query_code_graph guidance.',
							matcher: '.*',
						},
					],
				},
			});
		});
	});
});
