import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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

// Import mocked module to access prompt
import pkg from 'enquirer';
const { prompt } = pkg;

describe('AuthCommand', () => {
	let authCommand: AuthCommand;
	let mockEnv: jest.Mocked<CrossPlatformEnvironment>;
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

	beforeEach(() => {
		// Create mock environment manager
		mockEnv = {
			getKey: jest.fn(),
			setKey: jest.fn(),
		} as any;

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
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: 'new-access-key-123' });

			await authCommand.run();

			expect(mockEnv.getKey).toHaveBeenCalledWith(ACCESS_KEY_ENV_VAR);
			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Constellation Access Key:',
					name: 'accessKey',
					type: 'password',
					required: true,
				})
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(ACCESS_KEY_ENV_VAR, 'new-access-key-123');
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Stored access key')
			);
		});

		it('should prompt to replace existing key', async () => {
			mockEnv.getKey.mockResolvedValue('existing-key');
			mockEnv.setKey.mockResolvedValue(undefined);

			(prompt as jest.Mock)
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ replaceKey: true })
				// @ts-expect-error - Jest mock typing
				.mockResolvedValueOnce({ accessKey: 'new-key-456' });

			await authCommand.run();

			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Replace existing stored Constellation access key?',
					type: 'confirm',
				})
			);
			expect(prompt).toHaveBeenCalledWith(
				expect.objectContaining({
					message: 'Constellation Access Key:',
				})
			);
			expect(mockEnv.setKey).toHaveBeenCalledWith(ACCESS_KEY_ENV_VAR, 'new-key-456');
		});

		it('should keep existing key when user declines replacement', async () => {
			mockEnv.getKey.mockResolvedValue('existing-key');
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ replaceKey: false });

			await authCommand.run();

			expect(mockEnv.setKey).not.toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Keeping existing')
			);
		});

		it('should display starting message', async () => {
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: 'test-key' });

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Configuring access key authentication')
			);
		});

		it('should handle error when getting existing key fails', async () => {
			mockEnv.getKey.mockRejectedValue(new Error('Failed to read env'));

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key')
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to read env')
			);
		});

		it('should handle error when setting key fails', async () => {
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockRejectedValue(new Error('Failed to write env'));
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: 'test-key' });

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key')
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to write env')
			);
		});

		it('should handle error when prompt fails', async () => {
			mockEnv.getKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockRejectedValue(new Error('User cancelled'));

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key')
			);
			expect(mockEnv.setKey).not.toHaveBeenCalled();
		});

		it('should use correct environment variable name', async () => {
			mockEnv.getKey.mockResolvedValue(undefined);
			mockEnv.setKey.mockResolvedValue(undefined);
			// @ts-expect-error - Jest mock typing
			(prompt as jest.Mock).mockResolvedValue({ accessKey: 'test-key' });

			await authCommand.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(ACCESS_KEY_ENV_VAR)
			);
		});

		it('should handle non-Error objects in catch block', async () => {
			mockEnv.getKey.mockRejectedValue('String error');

			await authCommand.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to store Constellation access key')
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('An unexpected error occurred')
			);
		});
	});
});