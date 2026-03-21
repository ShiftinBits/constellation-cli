import { BLUE_INFO, GREEN_CHECK, YELLOW_WARN } from '../utils/unicode-chars';
import { UpdateCache } from './update-cache';
import { PackageManager } from './package-manager';
import { UpdatePrompter } from './update-prompter';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const PACKAGE_NAME = '@constellationdev/cli';
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Information about version comparison.
 */
export interface VersionInfo {
	/** Currently installed version */
	current: string;
	/** Latest version available on NPM */
	latest: string;
	/** True if latest is newer than current */
	hasUpdate: boolean;
}

/**
 * Orchestrates the update checking flow.
 *
 * Responsible for:
 * - Checking rate limits before hitting NPM
 * - Fetching latest version from NPM registry
 * - Comparing versions
 * - Prompting user if update available
 * - Executing update if user accepts
 *
 * All failures are silent - we never block the user's intended command.
 */
export class UpdateChecker {
	private cache: UpdateCache;
	private packageManager: PackageManager;
	private prompter: UpdatePrompter;

	constructor() {
		this.cache = new UpdateCache();
		this.packageManager = new PackageManager();
		this.prompter = new UpdatePrompter();
	}

	/**
	 * Main entry point - checks for updates if appropriate.
	 *
	 * @param currentVersion - The currently installed version
	 * @returns Promise resolving to true if CLI should exit (update was performed)
	 */
	async check(currentVersion: string): Promise<boolean> {
		// Rate limiting - only check once per day
		if (!(await this.cache.shouldCheck())) {
			return false;
		}

		try {
			const versionInfo = await this.fetchLatestVersion(currentVersion);
			await this.cache.recordCheck();

			if (!versionInfo.hasUpdate) {
				return false;
			}

			// Skip if user already declined this specific version
			if (await this.cache.wasVersionDeclined(versionInfo.latest)) {
				return false;
			}

			// Prompt user
			const shouldUpdate = await this.prompter.promptForUpdate(
				versionInfo.current,
				versionInfo.latest,
				this.packageManager.detect(),
			);

			if (shouldUpdate) {
				return await this.performUpdate();
			} else {
				await this.cache.recordDecline(versionInfo.latest);
				return false;
			}
		} catch {
			// Silent fail - don't interrupt user's workflow
			// Network issues, registry problems, etc. should not block the CLI
			return false;
		}
	}

	/**
	 * Fetches the latest version from NPM registry.
	 */
	private async fetchLatestVersion(
		currentVersion: string,
	): Promise<VersionInfo> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

		try {
			const response = await fetch(
				`${NPM_REGISTRY_URL}/${PACKAGE_NAME}/latest`,
				{
					signal: controller.signal,
					headers: { Accept: 'application/json' },
				},
			);

			if (!response.ok) {
				throw new Error(`Registry returned ${response.status}`);
			}

			const data = (await response.json()) as { version: string };
			const latest = data.version;

			return {
				current: currentVersion,
				latest,
				hasUpdate: this.isNewerVersion(latest, currentVersion),
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * Compares semver versions.
	 * Returns true if `latest` is newer than `current`.
	 *
	 * Only handles standard semver (major.minor.patch).
	 * Pre-release tags are ignored for simplicity.
	 */
	private isNewerVersion(latest: string, current: string): boolean {
		// Strip any pre-release suffix for comparison
		const stripPreRelease = (v: string) => v.split('-')[0];

		const latestParts = stripPreRelease(latest).split('.').map(Number);
		const currentParts = stripPreRelease(current).split('.').map(Number);

		for (let i = 0; i < 3; i++) {
			const l = latestParts[i] || 0;
			const c = currentParts[i] || 0;
			if (l > c) return true;
			if (l < c) return false;
		}
		return false;
	}

	/**
	 * Executes the update and displays result.
	 */
	private async performUpdate(): Promise<boolean> {
		console.log(`\n${BLUE_INFO} Updating ${PACKAGE_NAME}...\n`);

		const success = await this.packageManager.executeUpdate(PACKAGE_NAME);

		if (success) {
			console.log(
				`\n${GREEN_CHECK} Update complete! Please re-run your command.\n`,
			);
			return true; // Signal CLI to exit
		} else {
			console.log(
				`\n${YELLOW_WARN} Update failed. You can try updating manually:`,
			);
			console.log(
				`  ${this.packageManager.getUpdateCommandString(PACKAGE_NAME)}\n`,
			);
			return false; // Continue with original command
		}
	}
}

/**
 * Convenience function to check for updates.
 *
 * @param currentVersion - The currently installed version
 * @returns Promise resolving to true if CLI should exit
 */
export async function checkForUpdates(
	currentVersion: string,
): Promise<boolean> {
	const checker = new UpdateChecker();
	return checker.check(currentVersion);
}
