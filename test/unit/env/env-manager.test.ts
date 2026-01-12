import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from '@jest/globals';
import { EventEmitter } from 'events';
import * as os from 'os';
import { CrossPlatformEnvironment } from '../../../src/env/env-manager';
import { FileUtils } from '../../../src/utils/file.utils';

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
	delete process.env.TF_BUILD;
	delete process.env.BITBUCKET_BUILD_NUMBER;
	delete process.env.TEAMCITY_VERSION;
	delete process.env.CODEBUILD_BUILD_ID;
}

// Helper to mock root privileges for Unix systems
function mockRootPrivileges() {
	// @ts-expect-error - Mocking getuid
	process.getuid = jest.fn().mockReturnValue(0);
}

// Helper to mock non-root user for Unix systems
function mockNonRootUser() {
	// @ts-expect-error - Mocking getuid
	process.getuid = jest.fn().mockReturnValue(1000);
}

describe('CrossPlatformEnvironment', () => {
	let env: CrossPlatformEnvironment;
	let originalEnv: NodeJS.ProcessEnv;
	let originalPlatform: string;
	let originalGetuid: typeof process.getuid;

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env };
		originalPlatform = process.platform;
		originalGetuid = process.getuid;

		// Clear mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
		Object.defineProperty(process, 'platform', {
			value: originalPlatform,
		});
		process.getuid = originalGetuid;
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

	describe('isCI', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			clearCIEnvironment();
		});

		it('should return false when not in CI environment', () => {
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(false);
		});

		it('should detect CI=true', () => {
			process.env.CI = 'true';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect GitHub Actions', () => {
			process.env.GITHUB_ACTIONS = 'true';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect GitLab CI', () => {
			process.env.GITLAB_CI = 'true';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect Jenkins', () => {
			process.env.JENKINS_URL = 'https://jenkins.example.com';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect CircleCI', () => {
			process.env.CIRCLECI = 'true';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect Azure Pipelines', () => {
			process.env.TF_BUILD = 'True';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect Bitbucket Pipelines', () => {
			process.env.BITBUCKET_BUILD_NUMBER = '123';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect TeamCity', () => {
			process.env.TEAMCITY_VERSION = '2023.05';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});

		it('should detect AWS CodeBuild', () => {
			process.env.CODEBUILD_BUILD_ID = 'build-123';
			env = new CrossPlatformEnvironment();
			expect(env.isCI()).toBe(true);
		});
	});

	describe('hasPrivileges - Unix', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			clearCIEnvironment();
		});

		it('should return true when running as root', async () => {
			mockRootPrivileges();
			env = new CrossPlatformEnvironment();
			expect(await env.hasPrivileges()).toBe(true);
		});

		it('should return false when running as non-root user', async () => {
			mockNonRootUser();
			env = new CrossPlatformEnvironment();
			expect(await env.hasPrivileges()).toBe(false);
		});
	});

	describe('hasPrivileges - Windows', () => {
		let mockSpawn: jest.Mock;

		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('win32');
			clearCIEnvironment();

			const childProcess = require('child_process');
			mockSpawn = jest.fn();
			childProcess.spawn = mockSpawn;
		});

		it('should return true when running as administrator', async () => {
			const mockProcess = new MockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			env = new CrossPlatformEnvironment();
			const promise = env.hasPrivileges();

			// Simulate successful net session (admin)
			setImmediate(() => {
				mockProcess.emit('close', 0);
			});

			expect(await promise).toBe(true);
			expect(mockSpawn).toHaveBeenCalledWith('net', ['session'], {
				shell: false,
				windowsHide: true,
			});
		});

		it('should return false when not running as administrator', async () => {
			const mockProcess = new MockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			env = new CrossPlatformEnvironment();
			const promise = env.hasPrivileges();

			// Simulate failed net session (not admin)
			setImmediate(() => {
				mockProcess.emit('close', 1);
			});

			expect(await promise).toBe(false);
		});

		it('should return false on spawn error', async () => {
			const mockProcess = new MockChildProcess();
			mockSpawn.mockReturnValue(mockProcess);

			env = new CrossPlatformEnvironment();
			const promise = env.hasPrivileges();

			// Simulate spawn error
			setImmediate(() => {
				mockProcess.emit('error', new Error('Command not found'));
			});

			expect(await promise).toBe(false);
		});
	});

	describe('setKey - Unix (darwin)', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			clearCIEnvironment();
			mockRootPrivileges();
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

		it('should write to both /etc/zshenv and /etc/profile on macOS', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'test-value');

			// Should write to both files for cross-shell compatibility
			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/etc/zshenv',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/etc/profile',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
			expect(FileUtils.writeFile).toHaveBeenCalledTimes(2);
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

		it('should create config files if they do not exist', async () => {
			(FileUtils.readFile as jest.Mock).mockRejectedValue(
				// @ts-expect-error - Jest mock typing
				new Error('File not found'),
			);
			// @ts-expect-error - Jest mock typing
			(FileUtils.writeFile as jest.Mock).mockResolvedValue(undefined);

			await env.setKey('test_key', 'test-value');

			// Should write to both /etc/zshenv and /etc/profile on macOS
			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/etc/zshenv',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/etc/profile',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
		});

		it('should throw error when in CI environment', async () => {
			process.env.CI = 'true';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should throw error when not running as root', async () => {
			mockNonRootUser();
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Root privileges required to set system environment variables',
			);
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should throw error on file write failure', async () => {
			// @ts-expect-error - Jest mock typing
			(FileUtils.readFile as jest.Mock).mockResolvedValue('');
			(FileUtils.writeFile as jest.Mock).mockRejectedValue(
				// @ts-expect-error - Jest mock typing
				new Error('Write failed'),
			);

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});
	});

	describe('setKey - Unix (linux)', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('linux');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			clearCIEnvironment();
			mockRootPrivileges();
			env = new CrossPlatformEnvironment();
		});

		it('should write to /etc/profile.d/constellation.sh on Linux', async () => {
			setupFileMocks();

			await env.setKey('test_key', 'test-value');

			expect(FileUtils.writeFile).toHaveBeenCalledWith(
				'/etc/profile.d/constellation.sh',
				expect.stringContaining('export TEST_KEY="test-value"'),
			);
		});

		it('should add shebang header when creating new file on Linux', async () => {
			(FileUtils.readFile as jest.Mock).mockRejectedValue(
				// @ts-expect-error - Jest mock typing
				new Error('File not found'),
			);
			// @ts-expect-error - Jest mock typing
			(FileUtils.writeFile as jest.Mock).mockResolvedValue(undefined);

			await env.setKey('test_key', 'test-value');

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			expect(writeCall[1]).toContain('#!/bin/sh');
			expect(writeCall[1]).toContain(
				'# Constellation CLI environment variables',
			);
		});
	});

	describe('setKey - validation', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			clearCIEnvironment();
			mockRootPrivileges();
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

		it('should reject value with newline characters', async () => {
			await expect(env.setKey('key', 'value\nmalicious')).rejects.toThrow(
				'Value cannot contain newline characters',
			);
		});

		it('should reject value with carriage return characters', async () => {
			await expect(env.setKey('key', 'value\rmalicious')).rejects.toThrow(
				'Value cannot contain newline characters',
			);
		});

		it('should accept valid alphanumeric key with underscores', async () => {
			await expect(env.setKey('VALID_KEY_123', 'value')).resolves.not.toThrow();
		});
	});

	describe('CI environment rejection', () => {
		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('darwin');
			(os.homedir as jest.Mock).mockReturnValue('/home/testuser');
			mockRootPrivileges();
		});

		it('should throw error with GitHub Actions', async () => {
			clearCIEnvironment();
			process.env.GITHUB_ACTIONS = 'true';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
		});

		it('should throw error with GitLab CI', async () => {
			clearCIEnvironment();
			process.env.GITLAB_CI = 'true';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
		});

		it('should throw error with Jenkins', async () => {
			clearCIEnvironment();
			process.env.JENKINS_URL = 'https://jenkins.example.com';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
		});

		it('should throw error with CircleCI', async () => {
			clearCIEnvironment();
			process.env.CIRCLECI = 'true';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
		});
	});

	describe('setKey - Windows (win32)', () => {
		let mockSpawn: jest.Mock;
		let mockProcess: MockChildProcess;
		let adminCheckProcess: MockChildProcess;

		beforeEach(() => {
			(os.platform as jest.Mock).mockReturnValue('win32');
			clearCIEnvironment();

			// Create separate mock processes for admin check and setx
			adminCheckProcess = new MockChildProcess();
			mockProcess = new MockChildProcess();

			mockSpawn = jest.fn().mockImplementation((cmd) => {
				if (cmd === 'net') {
					return adminCheckProcess;
				}
				return mockProcess;
			});

			const childProcess = require('child_process');
			childProcess.spawn = mockSpawn;

			env = new CrossPlatformEnvironment();
		});

		it('should set environment variable using setx command with /M flag', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate successful admin check
			setImmediate(() => {
				adminCheckProcess.emit('close', 0);
				// Then simulate successful setx execution
				setImmediate(() => {
					mockProcess.emit('close', 0);
				});
			});

			await promise;

			expect(mockSpawn).toHaveBeenCalledWith('net', ['session'], {
				shell: false,
				windowsHide: true,
			});
			expect(mockSpawn).toHaveBeenCalledWith(
				'setx',
				['TEST_KEY', 'test-value', '/M'],
				{
					shell: false,
					windowsHide: true,
				},
			);
			expect(process.env.TEST_KEY).toBe('test-value');
		});

		it('should throw error when not running as administrator', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate failed admin check
			setImmediate(() => {
				adminCheckProcess.emit('close', 1);
			});

			await expect(promise).rejects.toThrow(
				'Administrator privileges required to set system environment variables',
			);
		});

		it('should handle setx command failure', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate successful admin check
			setImmediate(() => {
				adminCheckProcess.emit('close', 0);
				// Then simulate setx failure
				setImmediate(() => {
					if (mockProcess.stderr) {
						mockProcess.stderr.emit('data', Buffer.from('Access denied'));
					}
					mockProcess.emit('close', 1);
				});
			});

			await expect(promise).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});

		it('should handle spawn error', async () => {
			const promise = env.setKey('test_key', 'test-value');

			// Simulate successful admin check
			setImmediate(() => {
				adminCheckProcess.emit('close', 0);
				// Then simulate spawn error
				setImmediate(() => {
					mockProcess.emit('error', new Error('Command not found'));
				});
			});

			await expect(promise).rejects.toThrow(
				'Failed to set environment variable TEST_KEY',
			);
		});

		it('should throw error when in CI environment', async () => {
			process.env.CI = 'true';
			env = new CrossPlatformEnvironment();

			await expect(env.setKey('test_key', 'test-value')).rejects.toThrow(
				'Cannot set environment variables in CI/CD environments',
			);
			// Should not even check for admin privileges
			expect(mockSpawn).not.toHaveBeenCalledWith(
				'setx',
				expect.anything(),
				expect.anything(),
			);
		});

		it('should escape special characters properly', async () => {
			const promise = env.setKey('test_key', 'value with spaces');

			// Simulate successful admin check and setx
			setImmediate(() => {
				adminCheckProcess.emit('close', 0);
				setImmediate(() => {
					mockProcess.emit('close', 0);
				});
			});

			await promise;

			expect(mockSpawn).toHaveBeenCalledWith(
				'setx',
				['TEST_KEY', 'value with spaces', '/M'],
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
