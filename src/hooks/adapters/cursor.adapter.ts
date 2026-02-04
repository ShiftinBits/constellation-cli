/**
 * Cursor hook adapter for generating .cursor/hooks.json format.
 *
 * Cursor supports hooks via project-level configuration files with a specific
 * JSON schema (version 1). Event names use camelCase.
 *
 * @see https://cursor.com/docs/agent/hooks
 */

import type { CanonicalHook, CanonicalHookEvent, HookAdapter } from '../types';

/**
 * Event name mapping from canonical (PascalCase) to Cursor-specific (camelCase).
 */
const CURSOR_EVENT_MAP: Record<CanonicalHookEvent, string | undefined> = {
	SessionStart: 'sessionStart',
	SubagentStart: 'subagentStart',
	PreCompact: 'preCompact',
	PreToolUse: 'preToolUse',
	PostToolUse: 'postToolUse',
	SessionEnd: 'sessionEnd',
};

/**
 * Cursor MCP tool name for Constellation.
 * Cursor uses the format: serverName__toolName
 */
const CURSOR_MCP_TOOL_NAME = 'constellation__query_code_graph';

/**
 * Adapter for generating Cursor hooks.json format.
 *
 * Cursor hooks schema (version 1):
 * ```json
 * {
 *   "version": 1,
 *   "hooks": {
 *     "eventName": [{ "type": "prompt", "prompt": "...", "matcher": "..." }]
 *   }
 * }
 * ```
 */
export class CursorHookAdapter implements HookAdapter {
	readonly id = 'cursor';
	readonly displayName = 'Cursor';

	mapEventName(event: CanonicalHookEvent): string | undefined {
		return CURSOR_EVENT_MAP[event];
	}

	generateConfig(hooks: CanonicalHook[]): Record<string, unknown> {
		const hooksConfig: Record<string, Array<Record<string, unknown>>> = {};

		for (const hook of hooks) {
			const eventName = this.mapEventName(hook.event);
			if (!eventName) continue;

			if (!hooksConfig[eventName]) {
				hooksConfig[eventName] = [];
			}

			const hookEntry: Record<string, unknown> = {
				type: hook.type,
			};

			if (hook.type === 'prompt') {
				hookEntry.prompt = this.customizePrompt(hook);
			}

			if (hook.matcher) {
				hookEntry.matcher = hook.matcher;
			}

			hooksConfig[eventName].push(hookEntry);
		}

		return {
			version: 1,
			hooks: hooksConfig,
		};
	}

	customizePrompt(hook: CanonicalHook): string {
		// Replace MCP tool name placeholder with Cursor-specific name
		return hook.content.replace(/\{MCP_TOOL_NAME\}/g, CURSOR_MCP_TOOL_NAME);
	}
}
