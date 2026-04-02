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
 * Command to set or update user environment variable for Constellation authentication.
 */
export default class AuthCommand extends BaseCommand {
	/**
	 * Executes the access key storage process.
	 * Stores access key in user-level environment variables.
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

			// 3. Prompt for access key with validation
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

			// 4. Set user env var value
			await this.env.setKey(ACCESS_KEY_ENV_VAR, accessKey!);

			console.log(
				`${GREEN_CHECK} Stored access key in ${ACCESS_KEY_ENV_VAR} user environment variable`,
			);

			const sourceFile = this.env.getSourceFile();
			if (sourceFile) {
				console.log(
					`${BLUE_INFO} To activate in this session, run:\n\n` +
						`    source ${sourceFile}\n\n` +
						`  New terminal sessions will load it automatically.`,
				);
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
}
