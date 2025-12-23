/**
 * Update module - Checks for CLI updates and prompts user to install.
 *
 * @module update
 */

export { UpdateCache } from './update-cache';
export type { UpdateState } from './update-cache';

export { PackageManager } from './package-manager';
export type { PackageManagerType } from './package-manager';

export { UpdatePrompter } from './update-prompter';

export { UpdateChecker, checkForUpdates } from './update-checker';
export type { VersionInfo } from './update-checker';
