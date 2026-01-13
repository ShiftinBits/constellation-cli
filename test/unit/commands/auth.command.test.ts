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

// Import mocked modules
import pkg from 'enquirer';
const { prompt } = pkg;

// Valid access key format for tests (ak: prefix + 32 hex chars, no dashes)
const VALID_ACCESS_KEY = 'ak:00000000000040008000000000000002';
const INVALID_ACCESS_KEY = 'invalid-key-format';

describe('AuthCommand', () => {
	let authCommand: AuthCommand;
	let mockEnv: jest.Mocked<CrossPlatformEnvironment>;
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

	beforeEach(() => {
		// Create mock environment manager with all required methods
		mockEnv = {
			getKey: jest.fn<() => Promise<string | undefined>>(),
			setKey: jest.fn<() => Promise<void>>(),
			isCI: jest.fn<() => boolean>().mockReturnValue(false),
		} as unknown as jest.Mocked<CrossPlatformEnvironment>;

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

	describe('run', () => {
		it('should prompt for access key when no existing key', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Configuring access key authentication'),
			);
		});

		it('should handle error when getting existing key fails', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockRejectedValue(new Error('Failed to read env'));

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(ACCESS_KEY_ENV_VAR),
			);
		});

		it('should handle non-Error objects in catch block', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockRejectedValue('String error');

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('An unexpected error occurred'),
			);
		});
	});

	describe('access key validation', () => {
		it('should accept valid access key format', async () => {
			mockEnv.isCI.mockReturnValue(false);
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: VALID_ACCESS_KEY });

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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

			await authCommand.run();

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
});
