import pkg from 'enquirer';
const { prompt } = pkg;

import { ACCESS_KEY_ENV_VAR } from '../utils/constants';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING
} from '../utils/unicode-chars';
import { BaseCommand } from './base.command';

/**
 * Command to set or update environment variable for Constellation authentication.
 */
export default class AuthCommand extends BaseCommand {

	/**
	 * Executes the access key storage process.
	 * Prompts user for Constellation access key, then stores in environment variables.
	 * @throws Error if unable to store value in environment variables.
	 */
	public async run(): Promise<void> {
		try {
			console.log(`${YELLOW_LIGHTNING}Configuring access key authentication...\n`)

			// Check for existing stored Constellation access key
			const existingAccessKey = await this.env!.getKey(ACCESS_KEY_ENV_VAR);
			if (existingAccessKey) {
				const { replaceKey } = await prompt<{ replaceKey: boolean }>({
					message: 'Replace existing stored Constellation access key?',
					name: 'replaceKey',
					type: 'confirm',
					initial: false
				});
				if (!replaceKey) {
					console.log(`${GREEN_CHECK} Keeping existing Constellation access key`)
					return;
				}
			}

			const { accessKey } = await prompt<{ accessKey: string; }>({
				message: 'Constellation Access Key:',
				name: 'accessKey',
				type: 'password',
				required: true,
			});

			// Set env var value
			await this.env!.setKey(ACCESS_KEY_ENV_VAR, accessKey);

			console.log(
				`${GREEN_CHECK} Stored access key in ${ACCESS_KEY_ENV_VAR} environment variable`,
			);
			console.log(
				`${BLUE_INFO} You must restart this terminal session to properly load the new access key value.`,
			);
		} catch (error) {
			const errorMessage =
				(error as Error).message ?? 'An unexpected error occurred';
			console.error(
				`${RED_X} Failed to store Constellation access key\n  ${errorMessage}`,
			);
		}
	}
}
