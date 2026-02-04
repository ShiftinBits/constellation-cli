/**
 * Type definitions for AI tool hook configuration.
 *
 * Hooks allow injecting instructions into AI coding assistants at specific
 * lifecycle events (session start, subagent spawn, context compaction, etc.).
 *
 * The system uses canonical event names internally, which adapters map to
 * tool-specific event names during configuration generation.
 */

/**
 * Canonical hook event names (tool-agnostic).
 * These map to tool-specific event names during generation.
 */
export type CanonicalHookEvent =
	| 'SessionStart' // Session initialization
	| 'SubagentStart' // Subagent/agent spawning
	| 'PreCompact' // Context compaction (preserve insights)
	| 'PreToolUse' // Before tool execution
	| 'PostToolUse' // After tool execution
	| 'SessionEnd'; // Session termination

/**
 * Hook type determines how the hook is evaluated.
 */
export type HookType = 'prompt' | 'command';

/**
 * A canonical hook definition (tool-agnostic).
 */
export interface CanonicalHook {
	/** The canonical event this hook responds to */
	event: CanonicalHookEvent;
	/** Hook type: 'prompt' for LLM-evaluated, 'command' for shell script */
	type: HookType;
	/** The prompt or command content (may contain {MCP_TOOL_NAME} placeholder) */
	content: string;
	/** Regex pattern to filter when hook fires (e.g., "Explore|Plan" for subagents) */
	matcher?: string;
}

/**
 * Configuration for how a tool handles hooks.
 */
export interface ToolHooksConfig {
	/** Path to hooks config file (relative to project root) */
	filePath: string;
	/** Schema version for the hooks file */
	schemaVersion: number;
	/** The adapter ID to use for this tool */
	adapterId: string;
}

/**
 * Result from configuring hooks for a tool.
 */
export interface HooksConfigResult {
	/** The tool ID that was configured */
	toolId: string;
	/** Display name of the tool */
	toolDisplayName: string;
	/** Whether configuration was successful */
	success: boolean;
	/** Path where hooks were written */
	configuredPath?: string;
	/** Error message if configuration failed */
	error?: string;
}

/**
 * Adapter interface for tool-specific hook format generation.
 */
export interface HookAdapter {
	/** Unique adapter identifier */
	readonly id: string;
	/** Display name for logging */
	readonly displayName: string;

	/**
	 * Maps a canonical event name to the tool-specific event name.
	 * Returns undefined if the event is not supported by this tool.
	 */
	mapEventName(event: CanonicalHookEvent): string | undefined;

	/**
	 * Generates the complete hooks configuration object for this tool.
	 * @param hooks Array of canonical hooks to include
	 * @returns Tool-specific configuration object ready for serialization
	 */
	generateConfig(hooks: CanonicalHook[]): Record<string, unknown>;

	/**
	 * Customizes prompt content for this tool (e.g., MCP tool name substitution).
	 * @param hook The canonical hook
	 * @returns Customized prompt content
	 */
	customizePrompt(hook: CanonicalHook): string;
}
