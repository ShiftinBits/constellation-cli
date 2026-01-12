import { spawnSync } from 'child_process';
import * as os from 'os';
import pkg from 'enquirer';
const { prompt } = pkg;

import { ACCESS_KEY_ENV_VAR } from '../utils/constants';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING,
	YELLOW_WARN,
} from '../utils/unicode-chars';
import { BaseCommand } from './base.command';

/**
 * Access key format: ak: prefix followed by UUID without dashes (32 hex chars)
 * Example: ak:00000000000040008000000000000002
 */
const ACCESS_KEY_PATTERN = /^ak:[0-9a-f]{32}$/i;

/**
 * Validates the format of a Constellation access key.
 * @param key The access key to validate
 * @returns true if valid, false otherwise
 */
function isValidAccessKeyFormat(key: string): boolean {
	return ACCESS_KEY_PATTERN.test(key);
}

/**
 * Sanitizes error messages to prevent credential leakage.
 * Removes any potential access key values from error messages.
 * @param message The error message to sanitize
 * @returns Sanitized error message
 */
function sanitizeErrorMessage(message: string): string {
	// Remove any ak: prefixed strings that look like access keys (32 hex chars)
	return message.replace(/ak:[0-9a-f]{32}/gi, '[REDACTED]');
}

/**
 * Command to set or update system environment variable for Constellation authentication.
 */
export default class AuthCommand extends BaseCommand {
	/**
	 * Executes the access key storage process.
	 * Checks privileges before prompting, then stores in system environment variables.
	 * @throws Error if unable to store value in environment variables.
	 */
	public async run(): Promise<void> {
		try {
			// Verify required dependency is available
			if (!this.env) {
				throw new Error('Environment manager not initialized');
			}

			console.log(
				`${YELLOW_LIGHTNING}Configuring access key authentication...\n`,
			);

			// 1. Reject CI environments - access key must be configured manually in pipelines
			if (this.env.isCI()) {
				console.error(
					`${RED_X} Cannot configure authentication in CI/CD environments\n\n` +
						`  The ${ACCESS_KEY_ENV_VAR} environment variable must be configured\n` +
						`  directly in your pipeline settings:\n\n` +
						`    - GitHub Actions: Repository Settings -> Secrets and variables -> Actions\n` +
						`    - GitLab CI: Settings -> CI/CD -> Variables\n` +
						`    - Azure DevOps: Pipelines -> Library -> Variable groups\n` +
						`    - Jenkins: Manage Jenkins -> Credentials\n` +
						`    - CircleCI: Project Settings -> Environment Variables\n`,
				);
				return;
			}

			// 2. Check privileges before prompting for access key (don't waste user's time)
			const hasPrivileges = await this.env.hasPrivileges();

			if (!hasPrivileges) {
				if (os.platform() === 'win32') {
					// Windows: Show instructions and exit (consistent with Unix path - no error thrown)
					console.log(
						`${YELLOW_WARN} Administrator privileges required\n\n` +
							`  System environment variables require an elevated terminal.\n\n` +
							`  To run as Administrator:\n` +
							`    1. Press Win+X\n` +
							`    2. Select "Terminal (Admin)" or "PowerShell (Admin)"\n` +
							`    3. Re-run: constellation auth\n`,
					);
					return;
				} else {
					// macOS/Linux: Offer to retry with sudo
					const { retrySudo } = await prompt<{ retrySudo: boolean }>({
						type: 'confirm',
						name: 'retrySudo',
						message: 'Root privileges required. Retry with sudo?',
						initial: true,
					});

					if (retrySudo) {
						console.log(`\n${BLUE_INFO} Re-running with sudo...\n`);
						// Use 'constellation' command name - works when globally installed
						// Falls back gracefully if not in PATH (sudo will report command not found)
						const result = spawnSync('sudo', ['constellation', 'auth'], {
							stdio: 'inherit',
						});

						if (result.error) {
							// Handle case where constellation is not in PATH
							console.log(
								`\n${YELLOW_WARN} Could not execute 'constellation' command.\n` +
									`  If running in development, use:\n` +
									`    sudo npm start -- auth\n`,
							);
							return;
						}

						if (result.status !== 0) {
							console.error(
								`\n${RED_X} Elevated command failed (exit code: ${result.status ?? 1})`,
							);
							return;
						}

						// sudo succeeded, exit cleanly
						console.log(
							`\n${GREEN_CHECK} Authentication configured successfully.`,
						);
						return;
					} else {
						console.log(
							`\n${BLUE_INFO} Run manually with:\n` +
								`    sudo constellation auth\n`,
						);
						return;
					}
				}
			}

			// 3. Check for existing stored Constellation access key
			const existingAccessKey = await this.env.getKey(ACCESS_KEY_ENV_VAR);
			if (existingAccessKey) {
				const { replaceKey } = await prompt<{ replaceKey: boolean }>({
					message: 'Replace existing system-level Constellation access key?',
					name: 'replaceKey',
					type: 'confirm',
					initial: false,
				});
				if (!replaceKey) {
					console.log(
						`${GREEN_CHECK} Keeping existing Constellation access key`,
					);
					return;
				}
			}

			// 4. Prompt for access key with validation
			let accessKey: string;
			let attempts = 0;
			const maxAttempts = 3;

			while (attempts < maxAttempts) {
				const response = await prompt<{ accessKey: string }>({
					message: 'Constellation Access Key:',
					name: 'accessKey',
					type: 'password',
					required: true,
				});

				accessKey = response.accessKey.trim();

				// Validate format
				if (!accessKey) {
					console.log(`${YELLOW_WARN} Access key cannot be empty.\n`);
					attempts++;
					continue;
				}

				if (!isValidAccessKeyFormat(accessKey)) {
					attempts++;
					if (attempts < maxAttempts) {
						console.log(
							`${YELLOW_WARN} Invalid access key format. Expected format: ak:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n` +
								`  Attempts remaining: ${maxAttempts - attempts}\n`,
						);
					} else {
						console.error(
							`${RED_X} Invalid access key format after ${maxAttempts} attempts.\n` +
								`  Please verify your access key and try again.`,
						);
						return;
					}
					continue;
				}

				// Valid key format, proceed
				break;
			}

			// 5. Set system env var value
			await this.env.setKey(ACCESS_KEY_ENV_VAR, accessKey!);

			console.log(
				`${GREEN_CHECK} Stored access key in ${ACCESS_KEY_ENV_VAR} system environment variable`,
			);
			console.log(
				`${BLUE_INFO} You must restart this terminal session to properly load the new access key value.`,
			);
		} catch (error) {
			const rawMessage =
				(error as Error).message ?? 'An unexpected error occurred';
			const safeMessage = sanitizeErrorMessage(rawMessage);
			console.error(
				`${RED_X} Failed to store Constellation access key\n  ${safeMessage}`,
			);
		}
	}
}
