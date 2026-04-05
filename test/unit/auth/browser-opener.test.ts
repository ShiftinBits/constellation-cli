import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach,
} from '@jest/globals';

jest.mock('node:child_process');

import { execFile } from 'node:child_process';
import { openBrowser } from '../../../src/auth/browser-opener';

const mockExecFile = execFile as unknown as jest.Mock;

describe('openBrowser', () => {
	const originalPlatform = process.platform;
	const testUrl = 'https://example.com/auth';

	beforeEach(() => {
		jest.clearAllMocks();
		mockExecFile.mockImplementation((...args: unknown[]) => {
			const callback = args[args.length - 1] as (err: Error | null) => void;
			callback(null);
		});
	});

	afterEach(() => {
		Object.defineProperty(process, 'platform', { value: originalPlatform });
	});

	it('should call open on macOS and return true', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'darwin' });

		// Act
		const result = await openBrowser(testUrl);

		// Assert
		expect(result).toBe(true);
		expect(mockExecFile).toHaveBeenCalledWith(
			'open',
			[testUrl],
			expect.any(Function),
		);
	});

	it('should call xdg-open on Linux and return true', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'linux' });

		// Act
		const result = await openBrowser(testUrl);

		// Assert
		expect(result).toBe(true);
		expect(mockExecFile).toHaveBeenCalledWith(
			'xdg-open',
			[testUrl],
			expect.any(Function),
		);
	});

	it('should call cmd on Windows and return true', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'win32' });

		// Act
		const result = await openBrowser(testUrl);

		// Assert
		expect(result).toBe(true);
		expect(mockExecFile).toHaveBeenCalledWith(
			'cmd',
			['/c', 'start', '', testUrl],
			expect.any(Function),
		);
	});

	it('should return false when execFile errors', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		mockExecFile.mockImplementation((...args: unknown[]) => {
			const callback = args[args.length - 1] as (err: Error | null) => void;
			callback(new Error('spawn failed'));
		});

		// Act
		const result = await openBrowser(testUrl);

		// Assert
		expect(result).toBe(false);
	});

	it('should return false for invalid URL without http/https prefix', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'darwin' });

		// Act
		const result = await openBrowser('ftp://example.com');

		// Assert
		expect(result).toBe(false);
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it('should return false for unsupported platform', async () => {
		// Arrange
		Object.defineProperty(process, 'platform', { value: 'freebsd' });

		// Act
		const result = await openBrowser(testUrl);

		// Assert
		expect(result).toBe(false);
		expect(mockExecFile).not.toHaveBeenCalled();
	});
});
