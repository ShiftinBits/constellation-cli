/**
 * Constellation hook definitions.
 *
 * These canonical hooks inject Constellation awareness into AI coding assistants.
 * The {MCP_TOOL_NAME} placeholder is replaced with the tool-specific MCP tool
 * name by each adapter during configuration generation.
 */

import type { CanonicalHook } from './types';

/**
 * Constellation's canonical hook definitions.
 * These are tool-agnostic and get adapted to each tool's format.
 */
export const CONSTELLATION_HOOKS: CanonicalHook[] = [
	{
		event: 'SessionStart',
		type: 'prompt',
		content: `You have Constellation access. \`{MCP_TOOL_NAME}\` is your PRIMARY tool for understanding this codebase—not an alternative, not a fallback, THE DEFAULT.

Mental model:
- "Where is X defined?" → {MCP_TOOL_NAME}
- "What uses X?" → {MCP_TOOL_NAME}
- "What would break?" → {MCP_TOOL_NAME}
- "Find the string 'ERROR_CODE_123'" → Grep

Grep is for literal text. Everything else starts with {MCP_TOOL_NAME}.`,
		matcher: '.*',
	},
	{
		event: 'SubagentStart',
		type: 'prompt',
		content: `You have access to Constellation's {MCP_TOOL_NAME} MCP tool. For structural code questions—symbol definitions, callers/callees, dependencies, dependents, impact analysis, architecture overview—use {MCP_TOOL_NAME} instead of Grep/Glob. It answers in one call what would take 3-5 text searches. Use Grep/Glob only for literal string search, config values, or when the tool is unavailable.`,
		matcher: 'Explore|Plan|explore|shell',
	},
	{
		event: 'PreCompact',
		type: 'prompt',
		content: `Preserve: (1) The instruction that {MCP_TOOL_NAME} is the PRIMARY tool for code understanding—Grep is only for literal text, (2) Any architectural insights, dependency relationships, or impact analysis results discovered via Constellation.`,
		matcher: '.*',
	},
];

/**
 * Get all canonical hooks for Constellation.
 * @returns Array of canonical hook definitions
 */
export function getConstellationHooks(): CanonicalHook[] {
	return CONSTELLATION_HOOKS;
}
