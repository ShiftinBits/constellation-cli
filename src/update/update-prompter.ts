import pkg from 'enquirer';
const { prompt } = pkg;

import ansiColors from 'ansi-colors';
import { YELLOW_LIGHTNING } from '../utils/unicode-chars';
import type { PackageManagerType } from './package-manager';

/**
 * Handles user-facing update notifications and prompts.
 *
 * Uses enquirer for interactive prompts and ansi-colors for styling,
 * matching the patterns used elsewhere in the codebase.
 */
export class UpdatePrompter {
	/**
	 * Displays update availability and prompts user to update.
	 *
	 * @param currentVersion - Currently installed version
	 * @param latestVersion - Latest version available on NPM
	 * @param packageManager - Detected package manager for display
	 * @returns Promise resolving to true if user wants to update, false otherwise
	 */
	async promptForUpdate(
		currentVersion: string,
		latestVersion: string,
		packageManager: PackageManagerType,
	): Promise<boolean> {
		// Visual separator
		console.log('');
		console.log(ansiColors.cyan('\u2501'.repeat(60)));
		console.log(`${YELLOW_LIGHTNING} ${ansiColors.bold('Update Available!')}`);
		console.log('');
		console.log(`  Current version: ${ansiColors.dim(currentVersion)}`);
		console.log(`  Latest version:  ${ansiColors.green.bold(latestVersion)}`);
		console.log('');
		console.log(`  ${ansiColors.dim(`Package manager: ${packageManager}`)}`);
		console.log(ansiColors.cyan('\u2501'.repeat(60)));
		console.log('');

		try {
			const { shouldUpdate } = await prompt<{ shouldUpdate: boolean }>({
				type: 'confirm',
				name: 'shouldUpdate',
				message: 'Would you like to update now?',
				initial: true, // Default to Yes
			});

			return shouldUpdate;
		} catch {
			// User cancelled with Ctrl+C or other interruption
			// Treat as decline, don't block their command
			return false;
		}
	}
}
