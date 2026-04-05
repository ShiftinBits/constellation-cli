import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach,
} from '@jest/globals';
import AuthCommand from '../../../src/commands/auth.command';
import { CrossPlatformEnvironment } from '../../../src/env/env-manager';
import { ACCESS_KEY_ENV_VAR } from '../../../src/utils/constants';

// Mock dependencies
jest.mock('enquirer', () => ({
	__esModule: true,
	default: {
		prompt: jest.fn(),
	},
}));
jest.mock('../../../src/env/env-manager');
jest.mock('../../../src/auth/callback-server');
jest.mock('../../../src/auth/browser-opener');

// Import mocked modules
import pkg from 'enquirer';
const { prompt } = pkg;

import { startCallbackServer } from '../../../src/auth/callback-server';
import { openBrowser } from '../../../src/auth/browser-opener';

// Valid access key format for tests (ak: prefix + 32 hex chars, no dashes)
const VALID_ACCESS_KEY = 'ak:00000000000040008000000000000002';
const INVALID_ACCESS_KEY = 'invalid-key-format';

describe('AuthCommand', () => {
	let authCommand: AuthCommand;
	let mockEnv: jest.Mocked<CrossPlatformEnvironment>;
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
	let mockWaitForCallback: jest.Mock<() => Promise<string>>;
	let mockClose: jest.Mock;

	beforeEach(() => {
		// Create mock environment manager with all required methods
		mockEnv = {
			getKey: jest.fn<() => Promise<string | undefined>>(),
			setKey: jest.fn<() => Promise<void>>(),
			isCI: jest.fn<() => boolean>().mockReturnValue(false),
			getSourceFile: jest.fn<() => string | undefined>(),
		} as unknown as jest.Mocked<CrossPlatformEnvironment>;

		// Create mock callback server
		mockWaitForCallback = jest.fn();
		mockClose = jest.fn();
		(
			startCallbackServer as jest.MockedFunction<typeof startCallbackServer>
		).mockResolvedValue({
			port: 12345,
			waitForCallback: mockWaitForCallback,
			close: mockClose,
		});

		// Mock browser opener
		(openBrowser as jest.MockedFunction<typeof openBrowser>).mockResolvedValue(
			true,
		);

		// Spy on console methods
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		// Create command with mocked dependencies
		authCommand = new AuthCommand({
			Environment: mockEnv,
		});

		// Clear all mocks before each test
		jest.clearAllMocks();
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe('run (manual flow)', () => {
		it('should prompt for access key when --manual flag is set', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(mockEnv.getKey).toHaveBeenCalledWith(ACCESS_KEY_ENV_VAR);
			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Constellation Access Key:',
					name: 'accessKey',
					type: 'password',
					required: true,
				}),
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Stored access key'),
			);
		});

		it('should prompt to replace existing key', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue('existing-key');
			mockEnv.setKey.mockResolvedValue(undefined);

			(prompt as jest.Mock)
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ replaceKey: true })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Replace existing Constellation access key?',
					type: 'confirm',
				}),
			);
			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Constellation Access Key:',
				}),
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should keep existing key when user declines replacement', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue('existing-key');
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ replaceKey: false });

			await authCommand.run(true);

			expect(mockEnv.setKey).not.toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Keeping existing'),
			);
		});

		it('should display starting message', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Configuring access key authentication'),
			);
		});

		it('should handle error when getting existing key fails', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockRejectedValue(new Error('Failed to read env'));

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to read env'),
			);
		});

		it('should handle error when setting key fails', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockRejectedValue(new Error('Failed to write env'));
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to write env'),
			);
		});

		it('should handle error when prompt fails', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockRejectedValue(new Error('User cancelled'));

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key'),
			);
			expect(mockEnv.setKey).not.toHaveBeenCalled();
		});

		it('should use correct environment variable name', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(ACCESS_KEY_ENV_VAR),
			);
		});

		it('should handle non-Error objects in catch block', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockRejectedValue('String error');

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('An unexpected error occurred'),
			);
		});
	});

	describe('access key validation (manual flow)', () => {
		it('should accept valid access key format', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should reject invalid access key format and allow retry', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);

			(prompt as jest.Mock)
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: INVALID_ACCESS_KEY })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Invalid access key format'),
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should fail after max invalid attempts', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);

			(prompt as jest.Mock)
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: INVALID_ACCESS_KEY })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: INVALID_ACCESS_KEY })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: INVALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Invalid access key format after 3 attempts'),
			);
			expect(mockEnv.setKey).not.toHaveBeenCalled();
		});

		it('should reject empty access key', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);

			(prompt as jest.Mock)
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: '' })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: '   ' })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Access key cannot be empty'),
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should trim whitespace from access key', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({
				accessKey: `  ${VALID_ACCESS_KEY}  `,
			});

			await authCommand.run(true);

			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});
	});

	describe('error message sanitization', () => {
		it('should redact access keys from error messages', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockRejectedValue(
				new Error(`Failed to set key: ${VALID_ACCESS_KEY}`),
			);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run(true);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('[REDACTED]'),
			);
			expect(consoleErrorSpy).not.toHaveBeenCalledWith(
				expect.stringContaining(VALID_ACCESS_KEY),
			);
		});
	});

	describe('environment dependency check', () => {
		it('should throw error when environment manager not initialized', async () => {
			const commandWithoutEnv = new AuthCommand({});

			await commandWithoutEnv.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Environment manager not initialized'),
			);
		});
	});

	describe('CI environment rejection', () => {
		it('should reject when running in CI environment', async () => {
			mockEnv.isCI.mockReturnValue(true);

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'Cannot configure authentication in CI/CD environments',
				),
			);
			expect(mockEnv.getKey).not.toHaveBeenCalled();
			expect(mockEnv.setKey).not.toHaveBeenCalled();
		});

		it('should show pipeline configuration instructions in CI', async () => {
			mockEnv.isCI.mockReturnValue(true);

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('GitHub Actions'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('GitLab CI'),
			);
		});
	});

	describe('browser auth flow', () => {
		it('should use browser flow by default (no manual flag)', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(startCallbackServer).toHaveBeenCalled();
			expect(openBrowser).toHaveBeenCalledWith(
				expect.stringContaining('/auth/cli?callback_port=12345&state='),
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should use browser flow when manual is false', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run(false);

			expect(startCallbackServer).toHaveBeenCalled();
			expect(openBrowser).toHaveBeenCalled();
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should print URL when browser fails to open', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			(
				openBrowser as jest.MockedFunction<typeof openBrowser>
			).mockResolvedValue(false);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Could not open browser automatically'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('/auth/cli?callback_port=12345&state='),
			);
			// Should still wait and succeed
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});

		it('should suggest --manual on timeout', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockRejectedValue(
				new Error('Authentication timed out'),
			);

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Authentication timed out'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('--manual'),
			);
		});

		it('should use CONSTELLATION_WEB_URL env var when set', async () => {
			const originalEnv = process.env.CONSTELLATION_WEB_URL;
			process.env.CONSTELLATION_WEB_URL = 'https://app.constellation.io';

			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(openBrowser).toHaveBeenCalledWith(
				expect.stringContaining('https://app.constellation.io/auth/cli'),
			);

			// Restore
			if (originalEnv === undefined) {
				delete process.env.CONSTELLATION_WEB_URL;
			} else {
				process.env.CONSTELLATION_WEB_URL = originalEnv;
			}
		});

		it('should fall back to production URL when CONSTELLATION_WEB_URL is not set', async () => {
			const originalEnv = process.env.CONSTELLATION_WEB_URL;
			delete process.env.CONSTELLATION_WEB_URL;

			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(openBrowser).toHaveBeenCalledWith(
				expect.stringContaining('https://app.constellationdev.io/auth/cli'),
			);

			// Restore
			if (originalEnv !== undefined) {
				process.env.CONSTELLATION_WEB_URL = originalEnv;
			}
		});

		it('should print success message after browser flow completes', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Stored access key'),
			);
		});

		it('should handle existing key replacement with browser flow', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue('existing-key');
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ replaceKey: true });
			mockWaitForCallback.mockResolvedValue(VALID_ACCESS_KEY);

			await authCommand.run();

			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Replace existing Constellation access key?',
				}),
			);
			expect(startCallbackServer).toHaveBeenCalled();
			expect(mockEnv.setKey).toHaveBeenCalledWith(
				ACCESS_KEY_ENV_VAR,
				VALID_ACCESS_KEY,
			);
		});
	});
});
