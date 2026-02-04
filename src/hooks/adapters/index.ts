/**
 * Hook adapter registry.
 *
 * Adapters transform canonical hook definitions into tool-specific formats.
 * New tools can be supported by implementing the HookAdapter interface and
 * registering the adapter here.
 */

import type { HookAdapter } from '../types';
import { CursorHookAdapter } from './cursor.adapter';

/**
 * Registry of available hook adapters.
 */
const ADAPTERS: Map<string, HookAdapter> = new Map([
	['cursor', new CursorHookAdapter()],
]);

/**
 * Get an adapter by its ID.
 * @param adapterId The adapter identifier
 * @returns The adapter instance, or undefined if not found
 */
export function getAdapter(adapterId: string): HookAdapter | undefined {
	return ADAPTERS.get(adapterId);
}

/**
 * Get all registered adapter IDs.
 * @returns Array of adapter IDs
 */
export function getAdapterIds(): string[] {
	return Array.from(ADAPTERS.keys());
}

// Re-export adapters for direct use
export { CursorHookAdapter } from './cursor.adapter';
