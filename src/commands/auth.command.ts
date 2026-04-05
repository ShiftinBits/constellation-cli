import { randomBytes } from 'node:crypto';

import pkg from 'enquirer';
const { prompt } = pkg;

import { startCallbackServer } from '../auth/callback-server';
import { openBrowser } from '../auth/browser-opener';
import {
	ACCESS_KEY_ENV_VAR,
	CONSTELLATION_WEB_URL_ENV_VAR,
} from '../utils/constants';
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
 * Command to set or update user environment variable for Constellation authentication.
 */
export default class AuthCommand extends BaseCommand {
	/**
	 * Executes the access key storage process.
	 * When manual is true or omitted with --manual flag, uses the paste-based flow.
	 * Otherwise uses the browser-based OAuth-style flow.
	 * @param manual If true, uses the manual paste-based flow instead of browser flow
	 * @throws Error if unable to store value in environment variables.
	 */
	public async run(manual?: boolean): Promise<void> {
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

			// 2. Check for existing stored Constellation access key
			const existingAccessKey = await this.env.getKey(ACCESS_KEY_ENV_VAR);
			if (existingAccessKey) {
				const { replaceKey } = await prompt<{ replaceKey: boolean }>({
					message: 'Replace existing Constellation access key?',
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

			// 3. Route to the appropriate auth flow
			if (manual) {
				await this.manualAuthFlow();
			} else {
				await this.browserAuthFlow();
			}
		} catch (error) {
			const rawMessage =
				(error as Error).message ?? 'An unexpected error occurred';
			const safeMessage = sanitizeErrorMessage(rawMessage);
			console.error(
				`${RED_X} Failed to store Constellation access key\n  ${safeMessage}`,
			);
		}
	}

	/**
	 * Manual paste-based auth flow (original behavior).
	 * Prompts the user to paste their access key with format validation and retries.
	 */
	private async manualAuthFlow(): Promise<void> {
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

		await this.storeKey(accessKey!);
	}

	/**
	 * Browser-based OAuth-style auth flow.
	 * Opens a browser to the Constellation web app for authentication,
	 * then receives the access key via a localhost callback.
	 */
	private async browserAuthFlow(): Promise<void> {
		const state = randomBytes(16).toString('hex');
		const { port, waitForCallback } = await startCallbackServer();

		const webUrl =
			process.env[CONSTELLATION_WEB_URL_ENV_VAR] || 'http://localhost:4200';
		const authUrl = `${webUrl}/auth/cli?callback_port=${port}&state=${state}`;

		console.log(`${BLUE_INFO} Opening browser for authentication...`);

		const opened = await openBrowser(authUrl);
		if (!opened) {
			console.log(
				`${YELLOW_WARN} Could not open browser automatically.\n` +
					`  Please open this URL manually:\n\n` +
					`    ${authUrl}\n`,
			);
		}

		console.log(
			`${BLUE_INFO} Waiting for authentication... (press Ctrl+C to cancel)\n`,
		);

		try {
			const accessKey = await waitForCallback(state);
			await this.storeKey(accessKey);
		} catch {
			console.error(
				`${RED_X} Authentication timed out.\n` +
					`  Try again or use ${YELLOW_WARN}constellation auth --manual${RED_X} to paste your key directly.`,
			);
		}
	}

	/**
	 * Stores the access key and prints success messaging.
	 * Shared between manual and browser auth flows.
	 */
	private async storeKey(accessKey: string): Promise<void> {
		await this.env!.setKey(ACCESS_KEY_ENV_VAR, accessKey);

		console.log(
			`${GREEN_CHECK} Stored access key in ${ACCESS_KEY_ENV_VAR} user environment variable`,
		);

		const sourceFile = this.env!.getSourceFile();
		if (sourceFile) {
			console.log(
				`${BLUE_INFO} To activate in this session, run:\n\n` +
					`    source ${sourceFile}\n\n` +
					`  New terminal sessions will load it automatically.`,
			);
		}
	}
}
