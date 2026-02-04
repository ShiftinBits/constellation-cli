/**
 * Hooks module for configuring AI tool hooks.
 *
 * This module provides the infrastructure for generating tool-specific hook
 * configurations from canonical Constellation hook definitions.
 */

// Types
export type {
	CanonicalHook,
	CanonicalHookEvent,
	HookAdapter,
	HooksConfigResult,
	HookType,
	ToolHooksConfig,
} from './types';

// Registry
export { CONSTELLATION_HOOKS, getConstellationHooks } from './hooks-registry';

// Writer
export { HooksWriter } from './hooks-writer';

// Adapters
export { getAdapter, getAdapterIds, CursorHookAdapter } from './adapters';
