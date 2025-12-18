import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach,
} from '@jest/globals';
import { CrossPlatformEnvironment } from '../../../src/env/env-manager';
import { FileUtils } from '../../../src/utils/file.utils';
import * as os from 'os';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../../../src/utils/file.utils');
jest.mock('os');
jest.mock('child_process');

// Create a mock ChildProcess
class MockChildProcess extends EventEmitter {
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	stdin = new EventEmitter();
}

// Helper to setup mocks
function setupFileMocks() {
	// @ts-expect-error - Jest mock typing
	(FileUtils.readFile as jest.Mock).mockResolvedValue('');
	// @ts-expect-error - Jest mock typing
	(FileUtils.writeFile as jest.Mock).mockResolvedValue(undefined);
}

// Helper to clear all CI environment variables
function clearCIEnvironment() {
	delete process.env.CI;
	delete process.env.GITHUB_ACTIONS;
	delete process.env.GITLAB_CI;
	delete process.env.JENKINS_URL;
	delete process.env.CIRCLECI;
	delete process.env.TRAVIS;
	delete process.env.BUILDKITE;
	delete process.env.DRONE;
}

describe('CrossPlatformEnvironment', () => {
	let env: CrossPlatformEnvironment;
	let originalEnv: NodeJS.ProcessEnv;
	let originalPlatform: string;

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env };
		originalPlatform = process.platform;

		// Clear mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
		});
	});

	describe('constructor', () => {
		it('should create instance for darwin platform', () => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			env = new CrossPlatformEnvironment();
			expect(env).toBeInstanceOf(CrossPlatformEnvironment);
		});

		it('should create instance for linux platform', () => {
			(os.platform as jest.Mock).mockReturnValue('linux');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			env = new CrossPlatformEnvironment();
			expect(env).toBeInstanceOf(CrossPlatformEnvironment);
		});

		it('should create instance for win32 platform', () => {
			(os.platform as jest.Mock).mockReturnValue('win32');
			env = new CrossPlatformEnvironment();
			expect(env).toBeInstanceOf(CrossPlatformEnvironment);
		});

		it('should throw error for unsupported platform', () => {
			(os.platform as jest.Mock).mockReturnValue('aix');
			expect(() => new CrossPlatformEnvironment()).toThrow(
				'Unsupported platform: aix',
			);
		});
	});

	describe('getKey', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			env = new CrossPlatformEnvironment();
		});

		it('should return value from process.env when key exists', async () => {
			process.env.TEST_KEY = 'test-value';
			const value = await env.getKey('TEST_KEY');
			expect(value).toBe('test-value');
		});

		it('should return undefined when key does not exist', async () => {
			delete process.env.TEST_KEY;
			const value = await env.getKey('TEST_KEY');
			expect(value).toBeUndefined();
		});

		it('should handle case-insensitive key lookup', async () => {
			process.env.TEST_KEY = 'test-value';
			const value = await env.getKey('test_key');
			expect(value).toBe('test-value');
		});
	});

	describe('setKey - Unix (darwin/linux)', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			process.env.SHELL = '/bin/zsh';
			clearCIEnvironment();
			env = new CrossPlatformEnvironment();
		});

		it('should set key in process.env immediately', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'test-value');
			expect(process.env.TEST_KEY).toBe('test-value');
		});

		it('should convert key to uppercase', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'test-value');
			expect(FileUtils.writeFile).toHaveBeenCalled();
			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			expect(writeCall[1]).toContain('export TEST_KEY=');
		});

		it('should write to shell config file', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/home/testuser/.zshrc',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
		});

		it('should escape special characters in value', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'value with "quotes" and $vars');

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			expect(writeCall[1]).toContain('value with \\"quotes\\" and \\$vars');
		});

		it('should update existing variable in config file', async () => {
			const existingContent =
				'export TEST_KEY="old-value"\nexport OTHER="value"';
			// @ts-expect-error - Jest mock typing
			(FileUtils.readFile as jest.Mock).mockResolvedValue(existingContent);
			// @ts-expect-error - Jest mock typing
			(FileUtils.writeFile as jest.Mock).mockResolvedValue(undefined);

			await env.setKey('test_key', 'new-value');

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			expect(writeCall[1]).toContain('export TEST_KEY="new-value"');
			expect(writeCall[1]).toContain('export OTHER="value"');
		});

		it('should create config file if it does not exist', async () => {
			// @ts-expect-error - Jest mock typing
			(FileUtils.readFile as jest.Mock).mockRejectedValue(
				new Error('File not found'),
			);
			// @ts-expect-error - Jest mock typing
			(FileUtils.writeFile as jest.Mock).mockResolvedValue(undefined);

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/home/testuser/.zshrc',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
		});

		it('should use .bash_profile for bash shell when .bashrc does not exist', async () => {
			process.env.SHELL = '/bin/bash';
			setupFileMocks();

			// Need to create new instance after changing SHELL
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			// Default behavior when .bashrc doesn't exist is to use .bash_profile
			expect(writeCall[0]).toContain('.bash_profile');
		});

		it('should only set in process.env when in CI environment', async () => {
			process.env.CI = 'true';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(process.env.TEST_KEY).toBe('test-value');
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should throw error on file write failure', async () => {
			// @ts-expect-error - Jest mock typing
			(FileUtils.readFile as jest.Mock).mockResolvedValue('');
			// @ts-expect-error - Jest mock typing
			(FileUtils.writeFile as jest.Mock).mockRejectedValue(
				new Error('Write failed'),
			);

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});
	});

	describe('setKey - validation', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			process.env.SHELL = '/bin/zsh';
			env = new CrossPlatformEnvironment();
			setupFileMocks();
		});

		it('should reject invalid key with special characters', async () => {
			await expect(env.setKey('invalid-key!', 'value')).rejects.toThrow(
				'Environment variable name must contain only letters, numbers, and underscores',
			);
		});

		it('should reject empty key', async () => {
			await expect(env.setKey('', 'value')).rejects.toThrow(
				'Invalid key provided',
			);
		});

		it('should reject null value', async () => {
			// @ts-expect-error - Testing invalid input
			await expect(env.setKey('key', null)).rejects.toThrow(
				'Invalid value provided',
			);
		});

		it('should reject undefined value', async () => {
			// @ts-expect-error - Testing invalid input
			await expect(env.setKey('key', undefined)).rejects.toThrow(
				'Invalid value provided',
			);
		});

		it('should reject value with null bytes', async () => {
			await expect(env.setKey('key', 'value\0malicious')).rejects.toThrow(
				'Value contains invalid characters',
			);
		});

		it('should accept valid alphanumeric key with underscores', async () => {
			await expect(env.setKey('VALID_KEY_123', 'value')).resolves.not.toThrow();
		});
	});

	describe('platform detection', () => {
		it('should detect zsh shell', async () => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			process.env.SHELL = '/usr/local/bin/zsh';
			setupFileMocks();

			env = new CrossPlatformEnvironment();
			await env.setKey('test', 'value');

			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				expect.stringContaining('.zshrc'),
				expect.any(String),
			);
		});

		it('should default to .profile when shell is unknown', async () => {
			(os.platform as jest.Mock).mockReturnValue('linux');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			delete process.env.SHELL;
			setupFileMocks();

			env = new CrossPlatformEnvironment();
			await env.setKey('test', 'value');

			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				expect.stringContaining('.profile'),
				expect.any(String),
			);
		});
	});

	describe('CI environment detection', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
		});

		it('should detect GitHub Actions', async () => {
			process.env.GITHUB_ACTIONS = 'true';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(process.env.TEST_KEY).toBe('test-value');
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should detect GitLab CI', async () => {
			process.env.GITLAB_CI = 'true';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should detect Jenkins', async () => {
			process.env.JENKINS_URL = 'https://jenkins.example.com';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should detect CircleCI', async () => {
			process.env.CIRCLECI = 'true';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});
	});

	describe('setKey - Windows (win32)', () => {
		let mockSpawn: jest.Mock;
		let mockProcess: MockChildProcess;

		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('win32');
			clearCIEnvironment();

			// Mock child_process.spawn
			mockProcess = new MockChildProcess();
			mockSpawn = jest.fn().mockReturnValue(mockProcess);

			// Mock the spawn function
			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;

			env = new CrossPlatformEnvironment();
		});

		it('should set environment variable using setx command', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate successful setx execution
			setImmediate(() => {
				mockProcess.emit('close', 0);
			});

			await promise;

			expect(mockSpawn).toHaveBeenCalledWith(
				'setx',
				['TEST_KEY', 'test-value'],
				{
					shell: false,
					windowsHide: true,
				},
			);
			expect(process.env.TEST_KEY).toBe('test-value');
		});

		it('should handle setx command failure', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate setx failure
			setImmediate(() => {
				if (mockProcess.stderr) {
					mockProcess.stderr.emit('data', Buffer.from('Access denied'));
				}
				mockProcess.emit('close', 1);
			});

			await expect(promise).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});

		it('should handle spawn error', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate spawn error
			setImmediate(() => {
				mockProcess.emit('error', new Error('Command not found'));
			});

			await expect(promise).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});

		it('should only set in process.env when in CI environment', async () => {
			process.env.CI = 'true';
			env = new CrossPlatformEnvironment();

			await env.setKey('test_key', 'test-value');

			expect(process.env.TEST_KEY).toBe('test-value');
			expect(mockSpawn).not.toHaveBeenCalled();
		});

		it('should escape special characters properly', async () => {
			const promise = env.setKey('test_key', 'value with spaces');

			setImmediate(() => {
				mockProcess.emit('close', 0);
			});

			await promise;

			expect(mockSpawn).toHaveBeenCalledWith(
				'setx',
				['TEST_KEY', 'value with spaces'],
				expect.any(Object),
			);
		});
	});

	describe('getKey - Windows registry', () => {
		let mockSpawn: jest.Mock;
		let mockProcess: MockChildProcess;

		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('win32');

			mockProcess = new MockChildProcess();
			mockSpawn = jest.fn().mockReturnValue(mockProcess);

			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;

			env = new CrossPlatformEnvironment();
		});

		it('should retrieve value from user registry', async () => {
			const promise = env.getKey('TEST_KEY');

			// Simulate successful registry query
			setImmediate(() => {
				if (mockProcess.stdout) {
					mockProcess.stdout.emit(
						'data',
						Buffer.from('TEST_KEY    REG_SZ    test-value\r\n'),
					);
				}
				mockProcess.emit('close', 0);
			});

			const result = await promise;
			expect(result).toBe('test-value');
			expect(mockSpawn).toHaveBeenCalledWith(
				'reg',
				['query', 'HKCU\\Environment', '/v', 'TEST_KEY'],
				{
					shell: false,
					windowsHide: true,
				},
			);
		});

		it('should fallback to system registry if not in user registry', async () => {
			let callCount = 0;
			mockSpawn = jest.fn().mockImplementation(() => {
				callCount++;
				const proc = new MockChildProcess();

				if (callCount === 1) {
					// First call (user registry) - not found
					setImmediate(() => {
						proc.emit('close', 1);
					});
				} else if (callCount === 2) {
					// Second call (system registry) - found
					setImmediate(() => {
						if (proc.stdout) {
							proc.stdout.emit(
								'data',
								Buffer.from('TEST_KEY    REG_SZ    system-value\r\n'),
							);
						}
						proc.emit('close', 0);
					});
				}

				return proc;
			});

			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;
			env = new CrossPlatformEnvironment();

			const result = await env.getKey('TEST_KEY');

			expect(result).toBe('system-value');
			expect(mockSpawn).toHaveBeenCalledTimes(2);
			expect(mockSpawn).toHaveBeenNthCalledWith(
				2,
				'reg',
				[
					'query',
					'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
					'/v',
					'TEST_KEY',
				],
				expect.any(Object),
			);
		});

		it('should return undefined when key not found in either registry', async () => {
			mockSpawn = jest.fn().mockImplementation(() => {
				const proc = new MockChildProcess();
				setImmediate(() => {
					proc.emit('close', 1);
				});
				return proc;
			});

			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;
			env = new CrossPlatformEnvironment();

			const result = await env.getKey('NONEXISTENT_KEY');

			expect(result).toBeUndefined();
			expect(process.env.NONEXISTENT_KEY).toBeUndefined();
		});

		it('should handle REG_EXPAND_SZ type', async () => {
			const promise = env.getKey('PATH');

			setImmediate(() => {
				if (mockProcess.stdout) {
					mockProcess.stdout.emit(
						'data',
						Buffer.from('PATH    REG_EXPAND_SZ    C:\\Windows\\System32\r\n'),
					);
				}
				mockProcess.emit('close', 0);
			});

			const result = await promise;
			expect(result).toBe('C:\\Windows\\System32');
		});

		it('should handle registry query errors', async () => {
			mockSpawn = jest.fn().mockImplementation(() => {
				const proc = new MockChildProcess();
				setImmediate(() => {
					proc.emit('error', new Error('Registry access denied'));
				});
				return proc;
			});

			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;
			env = new CrossPlatformEnvironment();

			const result = await env.getKey('TEST_KEY');
			expect(result).toBeUndefined();
		});
	});
});
