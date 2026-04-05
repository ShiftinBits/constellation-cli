/**
 * Shared CLI constants with zero external dependencies.
 *
 * This file is imported by both main.ts (pre-ESM-graph entry point) and
 * index.ts, so it MUST NOT import any external packages.
 */

/** Commands that should bypass pre-parse checks (version check, update check). */
export const SKIP_COMMANDS = ['help', '--help', '-h', '--version', '-V', '-v'];
