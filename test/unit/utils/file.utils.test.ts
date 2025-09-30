import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs/promises';
import { Stats } from 'node:fs';
import { FileUtils } from '../../../src/utils/file.utils';
import { createTempDir, cleanupTempDir, createTestFile } from '../../helpers/test-utils';

jest.mock('node:fs/promises');

describe('FileUtils', () => {
	let tempDir: string;
	const mockFs = fs as jest.Mocked<typeof fs>;

	beforeEach(async () => {
		jest.clearAllMocks();
		// Create actual temp dir for integration-style tests
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		// Clean up temp dir
		await cleanupTempDir(tempDir);
		jest.restoreAllMocks();
	});

	describe('directoryExists', () => {
		it('should return true for existing directory', async () => {
			const mockStats = {
				isDirectory: jest.fn().mockReturnValue(true),
			} as unknown as Stats;

			mockFs.stat.mockResolvedValue(mockStats);

			const result = await FileUtils.directoryExists('/test/dir');

			expect(result).toBe(true);
			expect(mockFs.stat).toHaveBeenCalledWith('/test/dir');
			expect(mockStats.isDirectory).toHaveBeenCalled();
		});

		it('should return false for non-existing directory', async () => {
			mockFs.stat.mockRejectedValue(new Error('ENOENT'));

			const result = await FileUtils.directoryExists('/non/existent');

			expect(result).toBe(false);
			expect(mockFs.stat).toHaveBeenCalledWith('/non/existent');
		});

		it('should return false for file (not directory)', async () => {
			const mockStats = {
				isDirectory: jest.fn().mockReturnValue(false),
			} as unknown as Stats;

			mockFs.stat.mockResolvedValue(mockStats);

			const result = await FileUtils.directoryExists('/test/file.txt');

			expect(result).toBe(false);
			expect(mockFs.stat).toHaveBeenCalledWith('/test/file.txt');
			expect(mockStats.isDirectory).toHaveBeenCalled();
		});
	});

	describe('fileIsReadable', () => {
		it('should return true for readable file', async () => {
			mockFs.access.mockResolvedValue(undefined);

			const result = await FileUtils.fileIsReadable('/test/file.txt');

			expect(result).toBe(true);
			expect(mockFs.access).toHaveBeenCalledWith('/test/file.txt', fs.constants.R_OK);
		});

		it('should return false for non-readable file', async () => {
			mockFs.access.mockRejectedValue(new Error('EACCES'));

			const result = await FileUtils.fileIsReadable('/test/protected.txt');

			expect(result).toBe(false);
			expect(mockFs.access).toHaveBeenCalledWith('/test/protected.txt', fs.constants.R_OK);
		});

		it('should return false for non-existent file', async () => {
			mockFs.access.mockRejectedValue(new Error('ENOENT'));

			const result = await FileUtils.fileIsReadable('/non/existent.txt');

			expect(result).toBe(false);
			expect(mockFs.access).toHaveBeenCalledWith('/non/existent.txt', fs.constants.R_OK);
		});
	});

	describe('readFile', () => {
		it('should read file contents with default UTF-8 encoding', async () => {
			const expectedContent = 'Hello, World!';
			mockFs.readFile.mockResolvedValue(expectedContent);

			const result = await FileUtils.readFile('/test/file.txt');

			expect(result).toBe(expectedContent);
			expect(mockFs.readFile).toHaveBeenCalledWith('/test/file.txt', {
				encoding: 'utf-8',
				flag: fs.constants.O_RDONLY,
			});
		});

		it('should read file with custom encoding', async () => {
			const expectedContent = 'Hello, ASCII!';
			mockFs.readFile.mockResolvedValue(expectedContent);

			const result = await FileUtils.readFile('/test/file.txt', 'ascii');

			expect(result).toBe(expectedContent);
			expect(mockFs.readFile).toHaveBeenCalledWith('/test/file.txt', {
				encoding: 'ascii',
				flag: fs.constants.O_RDONLY,
			});
		});

		it('should throw error for non-existent file', async () => {
			const error = new Error('ENOENT: no such file or directory');
			mockFs.readFile.mockRejectedValue(error);

			await expect(FileUtils.readFile('/non/existent.txt')).rejects.toThrow('ENOENT');
		});

		it('should handle large files', async () => {
			const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
			mockFs.readFile.mockResolvedValue(largeContent);

			const result = await FileUtils.readFile('/test/large.txt');

			expect(result).toBe(largeContent);
			expect(result.length).toBe(10 * 1024 * 1024);
		});
	});

	describe('writeFile', () => {
		it('should write file contents with default UTF-8 encoding', async () => {
			const content = 'Hello, World!';
			mockFs.writeFile.mockResolvedValue(undefined);

			await FileUtils.writeFile('/test/file.txt', content);

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/file.txt',
				Buffer.from(content, 'utf-8'),
				{
					encoding: 'utf-8',
					flag: fs.constants.O_WRONLY | fs.constants.O_CREAT,
				}
			);
		});

		it('should write file with custom encoding', async () => {
			const content = 'Hello, ASCII!';
			mockFs.writeFile.mockResolvedValue(undefined);

			await FileUtils.writeFile('/test/file.txt', content, 'ascii');

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/file.txt',
				Buffer.from(content, 'ascii'),
				{
					encoding: 'ascii',
					flag: fs.constants.O_WRONLY | fs.constants.O_CREAT,
				}
			);
		});

		it('should handle empty content', async () => {
			mockFs.writeFile.mockResolvedValue(undefined);

			await FileUtils.writeFile('/test/empty.txt', '');

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/empty.txt',
				Buffer.from('', 'utf-8'),
				{
					encoding: 'utf-8',
					flag: fs.constants.O_WRONLY | fs.constants.O_CREAT,
				}
			);
		});

		it('should throw error on write failure', async () => {
			const error = new Error('EACCES: permission denied');
			mockFs.writeFile.mockRejectedValue(error);

			await expect(FileUtils.writeFile('/protected/file.txt', 'content')).rejects.toThrow(
				'EACCES'
			);
		});

		it('should handle special characters', async () => {
			const content = '🚀 Unicode €£¥ \n\t Special chars';
			mockFs.writeFile.mockResolvedValue(undefined);

			await FileUtils.writeFile('/test/special.txt', content);

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/special.txt',
				Buffer.from(content, 'utf-8'),
				{
					encoding: 'utf-8',
					flag: fs.constants.O_WRONLY | fs.constants.O_CREAT,
				}
			);
		});
	});

	describe('getFileStats', () => {
		it('should return file stats for existing file', async () => {
			const mockStats = {
				size: 1024,
				isFile: jest.fn().mockReturnValue(true),
				isDirectory: jest.fn().mockReturnValue(false),
				mtime: new Date('2024-01-01'),
			} as unknown as Stats;

			mockFs.stat.mockResolvedValue(mockStats);

			const result = await FileUtils.getFileStats('/test/file.txt');

			expect(result).toBe(mockStats);
			expect(result.size).toBe(1024);
			expect(mockFs.stat).toHaveBeenCalledWith('/test/file.txt');
		});

		it('should throw error for non-existent file', async () => {
			const error = new Error('ENOENT: no such file or directory');
			mockFs.stat.mockRejectedValue(error);

			await expect(FileUtils.getFileStats('/non/existent.txt')).rejects.toThrow('ENOENT');
		});

		it('should work for directories', async () => {
			const mockStats = {
				size: 4096,
				isFile: jest.fn().mockReturnValue(false),
				isDirectory: jest.fn().mockReturnValue(true),
				mtime: new Date('2024-01-01'),
			} as unknown as Stats;

			mockFs.stat.mockResolvedValue(mockStats);

			const result = await FileUtils.getFileStats('/test/directory');

			expect(result).toBe(mockStats);
			expect(result.isDirectory()).toBe(true);
			expect(result.isFile()).toBe(false);
		});
	});

	describe('getFileHandle', () => {
		it('should open file and return handle', async () => {
			const mockHandle = {
				close: jest.fn(),
				read: jest.fn(),
				write: jest.fn(),
			} as unknown as fs.FileHandle;

			mockFs.open.mockResolvedValue(mockHandle);

			const result = await FileUtils.getFileHandle('/test/file.txt', 'r');

			expect(result).toBe(mockHandle);
			expect(mockFs.open).toHaveBeenCalledWith('/test/file.txt', 'r', undefined);
		});

		it('should open file with flags and mode', async () => {
			const mockHandle = {
				close: jest.fn(),
			} as unknown as fs.FileHandle;

			mockFs.open.mockResolvedValue(mockHandle);

			const result = await FileUtils.getFileHandle(
				'/test/file.txt',
				fs.constants.O_RDWR | fs.constants.O_CREAT,
				0o644
			);

			expect(result).toBe(mockHandle);
			expect(mockFs.open).toHaveBeenCalledWith(
				'/test/file.txt',
				fs.constants.O_RDWR | fs.constants.O_CREAT,
				0o644
			);
		});

		it('should throw error if file cannot be opened', async () => {
			const error = new Error('EACCES: permission denied');
			mockFs.open.mockRejectedValue(error);

			await expect(FileUtils.getFileHandle('/protected/file.txt', 'r')).rejects.toThrow(
				'EACCES'
			);
		});
	});
});