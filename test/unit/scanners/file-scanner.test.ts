import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach,
} from '@jest/globals';
import { FileScanner, FileInfo } from '../../../src/scanners/file-scanner';
import {
	ConstellationConfig,
	IConstellationLanguageConfig,
} from '../../../src/config/config';
import { FileUtils } from '../../../src/utils/file.utils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir } from '../../helpers/test-utils';

// Mock dependencies
jest.mock('../../../src/utils/file.utils');
jest.mock('node:fs/promises');

// Helper function to create test language configurations
function createTestLanguageConfig(
	languages: Partial<IConstellationLanguageConfig>,
): IConstellationLanguageConfig {
	return languages as IConstellationLanguageConfig;
}

describe('FileScanner', () => {
	let tempDir: string;
	let fileScanner: FileScanner;
	let mockConfig: ConstellationConfig;
	const mockFs = fs as jest.Mocked<typeof fs>;
	const mockFileUtils = FileUtils as jest.Mocked<typeof FileUtils>;

	// Helper function to setup common mocks for scanSpecificFiles tests
	const setupScanSpecificFilesMocks = (rootPath?: string) => {
		// Mock realpath for project root
		mockFs.realpath.mockResolvedValue(rootPath || tempDir);

		// Default lstat mock - returns regular files
		mockFs.lstat.mockResolvedValue({
			size: 1024,
			isFile: () => true,
			isSymbolicLink: () => false,
			isDirectory: () => false,
		} as any);
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		tempDir = await createTempDir();
		fileScanner = new FileScanner(tempDir);

		// Create a basic test configuration
		mockConfig = new ConstellationConfig(
			'main',
			createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts', '.tsx'] },
				javascript: { fileExtensions: ['.js', '.jsx'] },
			}),
			'test-project',
			['node_modules', '.git', 'dist'],
		);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		jest.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should use provided root path', () => {
			const scanner = new FileScanner('/custom/path');
			expect(scanner['rootPath']).toBe('/custom/path');
		});

		it('should use current working directory when no path provided', () => {
			const originalCwd = process.cwd();
			const scanner = new FileScanner();
			expect(scanner['rootPath']).toBe(originalCwd);
		});
	});

	describe('scanFiles', () => {
		beforeEach(() => {
			// Mock FileUtils methods
			mockFileUtils.fileIsReadable.mockResolvedValue(false); // No .gitignore by default
			mockFileUtils.readFile.mockResolvedValue('');
		});

		it('should scan and filter files based on language configuration', async () => {
			// Mock directory structure
			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
				mockDirent('package.json', true),
				mockDirent('README.md', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('index.ts', true),
				mockDirent('utils.js', true),
				mockDirent('styles.css', true),
			] as any);

			// Mock file stats
			mockFs.stat.mockImplementation(
				async (filePath: any) =>
					({
						size: 1024,
						isFile: () => true,
						isDirectory: () => false,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(2); // Only .ts and .js files
			expect(result[0].language).toBe('typescript');
			expect(result[1].language).toBe('javascript');
			expect(result[0].path).toContain('index.ts');
			expect(result[1].path).toContain('utils.js');
		});

		it('should respect .gitignore rules', async () => {
			// Mock .gitignore exists and contains rules
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue('*.log\ndist/\nnode_modules/');

			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
				mockDirent('dist', false, true),
				mockDirent('app.log', true),
				mockDirent('index.ts', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('component.tsx', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('bundle.js', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			// Should exclude app.log (gitignore) and dist/bundle.js (gitignore)
			// Should include index.ts and src/component.tsx
			expect(result).toHaveLength(2);
			expect(result.every((f) => !f.relativePath.includes('app.log'))).toBe(
				true,
			);
			expect(result.every((f) => !f.relativePath.includes('dist/'))).toBe(true);
		});

		it('should apply custom exclude patterns from config', async () => {
			const configWithExcludes = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts'] },
				}),
				'test-project',
				['**/*.test.ts', 'coverage/**'],
			);

			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
				mockDirent('coverage', false, true),
				mockDirent('app.test.ts', true),
				mockDirent('index.ts', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('component.ts', true),
				mockDirent('component.test.ts', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('report.ts', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(configWithExcludes);

			// Should exclude test files and coverage directory
			expect(result).toHaveLength(2); // index.ts and src/component.ts
			expect(result.every((f) => !f.relativePath.includes('.test.ts'))).toBe(
				true,
			);
			expect(result.every((f) => !f.relativePath.includes('coverage/'))).toBe(
				true,
			);
		});

		it('should handle nested directory structures', async () => {
			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			// Root level
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
			] as any);

			// src level
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('components', false, true),
				mockDirent('utils', false, true),
				mockDirent('index.ts', true),
			] as any);

			// src/components level
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('Button.tsx', true),
				mockDirent('Modal.tsx', true),
			] as any);

			// src/utils level
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('helpers.js', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(4);
			expect(result.some((f) => f.relativePath.includes('src/index.ts'))).toBe(
				true,
			);
			expect(
				result.some((f) =>
					f.relativePath.includes('src/components/Button.tsx'),
				),
			).toBe(true);
			expect(
				result.some((f) => f.relativePath.includes('src/components/Modal.tsx')),
			).toBe(true);
			expect(
				result.some((f) => f.relativePath.includes('src/utils/helpers.js')),
			).toBe(true);
		});

		it('should skip hidden directories', async () => {
			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('.hidden', false, true),
				mockDirent('.git', false, true),
				mockDirent('src', false, true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('index.ts', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0].relativePath).toBe('src/index.ts');
		});

		it('should handle directories with read errors gracefully', async () => {
			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
				mockDirent('protected', false, true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('index.ts', true),
			] as any);

			// Simulate permission error for protected directory
			mockFs.readdir.mockRejectedValueOnce(
				new Error('EACCES: permission denied'),
			);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0].relativePath).toBe('src/index.ts');
		});

		it('should return files with correct metadata', async () => {
			const testRootPath = '/test/root';
			const testScanner = new FileScanner(testRootPath);

			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('index.ts', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 2048,
						isFile: () => true,
					}) as any,
			);

			const result = await testScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				path: path.join(testRootPath, 'index.ts'),
				relativePath: 'index.ts',
				language: 'typescript',
				size: 2048,
			});
		});
	});

	describe('scanSpecificFiles', () => {
		it('should scan only specified files that exist', async () => {
			const filePaths = [
				'src/index.ts',
				'src/missing.ts',
				'src/component.tsx',
				'README.md',
			];

			// Mock realpath for project root
			mockFs.realpath.mockResolvedValue(tempDir);

			// Mock lstat to check file type without following symlinks
			mockFs.lstat.mockImplementation(async (filePath: any) => {
				if (filePath.includes('missing.ts')) {
					throw new Error('ENOENT: no such file or directory');
				}
				if (filePath.includes('README.md')) {
					return {
						size: 1024,
						isFile: () => false,
						isSymbolicLink: () => false,
					} as any;
				}
				return {
					size: 1024,
					isFile: () => true,
					isSymbolicLink: () => false,
				} as any;
			});

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(2); // Only existing TypeScript files
			expect(result[0].relativePath).toBe('src/index.ts');
			expect(result[1].relativePath).toBe('src/component.tsx');
		});

		it('should handle absolute file paths', async () => {
			const testRootPath = '/test/root';
			const testScanner = new FileScanner(testRootPath);
			const absolutePath = path.join(testRootPath, 'src/index.ts');
			const filePaths = [absolutePath];

			setupScanSpecificFilesMocks(testRootPath);

			const result = await testScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0].path).toBe(absolutePath);
			expect(result[0].relativePath).toBe('src/index.ts');
		});

		it('should apply exclude patterns to specific files', async () => {
			const configWithExcludes = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts'] },
				}),
				'test-project',
				['**/*.test.ts'],
			);

			const filePaths = [
				'src/index.ts',
				'src/component.test.ts',
				'src/utils.ts',
			];

			setupScanSpecificFilesMocks();

			const result = await fileScanner.scanSpecificFiles(
				filePaths,
				configWithExcludes,
			);

			expect(result).toHaveLength(2); // Excludes .test.ts files
			expect(result.every((f) => !f.relativePath.includes('.test.ts'))).toBe(
				true,
			);
		});

		it('should filter files by language configuration', async () => {
			const filePaths = [
				'src/index.ts',
				'src/styles.css',
				'src/component.js',
				'src/data.json',
			];

			setupScanSpecificFilesMocks();

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(2); // Only .ts and .js files
			expect(result.some((f) => f.language === 'typescript')).toBe(true);
			expect(result.some((f) => f.language === 'javascript')).toBe(true);
		});

		it('should handle inaccessible files gracefully', async () => {
			const filePaths = ['src/index.ts', 'src/protected.ts'];

			mockFs.realpath.mockResolvedValue(tempDir);
			mockFs.lstat.mockImplementation(async (filePath: any) => {
				if (filePath.includes('protected.ts')) {
					throw new Error('EACCES: permission denied');
				}
				return {
					size: 1024,
					isFile: () => true,
					isSymbolicLink: () => false,
				} as any;
			});

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0].relativePath).toBe('src/index.ts');
		});

		it('should work when no exclude patterns are configured', async () => {
			const configNoExcludes = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts'] },
				}),
				'test-project',
				// No exclude patterns
			);

			const filePaths = ['src/index.ts'];

			setupScanSpecificFilesMocks();

			const result = await fileScanner.scanSpecificFiles(
				filePaths,
				configNoExcludes,
			);

			expect(result).toHaveLength(1);
			expect(result[0].relativePath).toBe('src/index.ts');
		});
	});

	describe('private methods (via public interface)', () => {
		it('should properly detect language from file extensions', async () => {
			const filePaths = [
				'app.ts',
				'component.tsx',
				'script.js',
				'module.jsx',
				'unknown.py',
			];

			setupScanSpecificFilesMocks();

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(4); // Excludes .py file
			expect(result.find((f) => f.path.includes('app.ts'))?.language).toBe(
				'typescript',
			);
			expect(
				result.find((f) => f.path.includes('component.tsx'))?.language,
			).toBe('typescript');
			expect(result.find((f) => f.path.includes('script.js'))?.language).toBe(
				'javascript',
			);
			expect(result.find((f) => f.path.includes('module.jsx'))?.language).toBe(
				'javascript',
			);
		});

		it('should handle multiple .gitignore files in hierarchy', async () => {
			// Mock .gitignore at root level
			mockFileUtils.fileIsReadable.mockImplementation(
				async (filePath: string) => {
					return filePath.includes('.gitignore');
				},
			);

			mockFileUtils.readFile.mockImplementation(async (filePath: string) => {
				if (filePath.includes('.gitignore')) {
					return '*.log\nnode_modules/';
				}
				return '';
			});

			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('src', false, true),
				mockDirent('app.log', true),
				mockDirent('index.ts', true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('component.ts', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			// Should exclude app.log but include TypeScript files
			expect(result).toHaveLength(2);
			expect(result.every((f) => !f.relativePath.includes('app.log'))).toBe(
				true,
			);
		});
	});

	describe('edge cases', () => {
		it('should handle empty directory', async () => {
			mockFs.readdir.mockResolvedValue([]);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(0);
		});

		it('should handle configuration with no languages', async () => {
			const emptyConfig = new ConstellationConfig(
				'main',
				createTestLanguageConfig({}),
				'test-project',
			);

			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('index.ts', true),
				mockDirent('script.js', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(emptyConfig);

			expect(result).toHaveLength(0); // No languages configured
		});

		it('should handle very deep directory structures', async () => {
			const mockDirent = (name: string, isFile = true, isDir = false) => ({
				name,
				isFile: () => isFile,
				isDirectory: () => isDir,
			});

			// Create a deep nested structure: level1/level2/level3/file.ts
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('level1', false, true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('level2', false, true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('level3', false, true),
			] as any);

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('deep.ts', true),
			] as any);

			mockFs.stat.mockImplementation(
				async () =>
					({
						size: 1024,
						isFile: () => true,
					}) as any,
			);

			const result = await fileScanner.scanFiles(mockConfig);

			expect(result).toHaveLength(1);
			expect(result[0].relativePath).toBe('level1/level2/level3/deep.ts');
		});

		it('should handle files with unusual extensions', async () => {
			const configWithCustomExts = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts', '.mts', '.cts'] },
				}),
				'test-project',
			);

			const filePaths = [
				'module.mts',
				'common.cts',
				'regular.ts',
				'unknown.xyz',
			];

			setupScanSpecificFilesMocks();

			const result = await fileScanner.scanSpecificFiles(
				filePaths,
				configWithCustomExts,
			);

			expect(result).toHaveLength(3); // All TypeScript variants, not .xyz
			expect(result.every((f) => f.language === 'typescript')).toBe(true);
		});
	});

	describe('security - path traversal protection', () => {
		it('should reject symlinks pointing outside project in scanSpecificFiles', async () => {
			const filePaths = ['malicious-link.ts'];
			const consoleWarnSpy = jest
				.spyOn(console, 'warn')
				.mockImplementation(() => {});

			// Mock realpath - first for project root, then for symlink target
			let realpathCallCount = 0;
			(mockFs.realpath as jest.Mock).mockImplementation(
				async (filePath: any) => {
					realpathCallCount++;
					if (realpathCallCount === 1 || filePath === tempDir) {
						return tempDir;
					}
					// Symlink points to /etc/passwd (outside project)
					return '/etc/passwd';
				},
			);

			// Mock lstat to indicate it's a symlink
			mockFs.lstat.mockResolvedValue({
				size: 1024,
				isFile: () => false,
				isSymbolicLink: () => true,
				isDirectory: () => false,
			} as any);

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(0); // Symlink should be rejected
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Skipping symlink pointing outside project'),
			);

			consoleWarnSpy.mockRestore();
		});

		it('should allow symlinks pointing within project in scanSpecificFiles', async () => {
			const filePaths = ['internal-link.ts'];

			// Mock realpath for project root
			(mockFs.realpath as jest.Mock).mockImplementation(
				async (filePath: any) => {
					if (filePath === tempDir) {
						return '/project/root';
					}
					// Symlink points to file within project
					return '/project/root/src/actual-file.ts';
				},
			);

			// Mock lstat to indicate it's a symlink
			mockFs.lstat.mockResolvedValue({
				size: 1024,
				isFile: () => false,
				isSymbolicLink: () => true,
				isDirectory: () => false,
			} as any);

			// Mock stat to return file info after symlink resolution
			mockFs.stat.mockResolvedValue({
				size: 2048,
				isFile: () => true,
				isDirectory: () => false,
			} as any);

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(1); // Symlink should be accepted
			expect(result[0].language).toBe('typescript');
		});

		it('should reject symlinks pointing outside project in walkDirectory', async () => {
			const consoleWarnSpy = jest
				.spyOn(console, 'warn')
				.mockImplementation(() => {});

			// Mock directory with a symlink
			const mockDirent = (name: string, opts: any = {}) => ({
				name,
				isFile: () => opts.isFile || false,
				isDirectory: () => opts.isDirectory || false,
				isSymbolicLink: () => opts.isSymbolicLink || false,
			});

			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('normal-file.ts', { isFile: true }),
				mockDirent('evil-link', { isSymbolicLink: true }),
			] as any);

			mockFs.stat.mockImplementation(async (filePath: any) => {
				if (filePath.includes('normal-file.ts')) {
					return { size: 1024, isFile: () => true } as any;
				}
				// Symlink target
				return { size: 2048, isFile: () => true } as any;
			});

			// Mock realpath for security check - first call is for project root
			let realpathCallCount = 0;
			(mockFs.realpath as jest.Mock).mockImplementation(
				async (filePath: any) => {
					realpathCallCount++;
					if (
						realpathCallCount === 1 ||
						filePath === tempDir ||
						filePath.includes('normal-file')
					) {
						return tempDir;
					}
					// Evil symlink points outside
					return '/etc/passwd';
				},
			);

			mockFileUtils.fileIsReadable.mockResolvedValue(false);

			const result = await fileScanner.scanFiles(mockConfig);

			// Should only include normal file, not the evil symlink
			expect(result.length).toBeGreaterThan(0);
			expect(result.every((f) => !f.path.includes('evil-link'))).toBe(true);
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Skipping symlink pointing outside project'),
			);

			consoleWarnSpy.mockRestore();
		});

		it('should handle broken symlinks gracefully', async () => {
			const filePaths = ['broken-link.ts'];
			const consoleWarnSpy = jest
				.spyOn(console, 'warn')
				.mockImplementation(() => {});

			// Mock lstat to indicate it's a symlink
			mockFs.lstat.mockResolvedValue({
				size: 0,
				isFile: () => false,
				isSymbolicLink: () => true,
				isDirectory: () => false,
			} as any);

			// Mock realpath - first call for project root succeeds, second for broken symlink fails
			let realpathCallCount = 0;
			(mockFs.realpath as jest.Mock).mockImplementation(
				async (filePath: any) => {
					realpathCallCount++;
					if (realpathCallCount === 1 || filePath === tempDir) {
						return tempDir;
					}
					// Broken symlink
					throw new Error('ENOENT: no such file or directory');
				},
			);

			const result = await fileScanner.scanSpecificFiles(filePaths, mockConfig);

			expect(result).toHaveLength(0);
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Skipping inaccessible file'),
			);

			consoleWarnSpy.mockRestore();
		});

		it('should handle symlinked directories pointing within project', async () => {
			const mockDirent = (name: string, opts: any = {}) => ({
				name,
				isFile: () => opts.isFile || false,
				isDirectory: () => opts.isDirectory || false,
				isSymbolicLink: () => opts.isSymbolicLink || false,
			});

			// Root dir has a symlinked directory
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('linked-src', { isSymbolicLink: true }),
			] as any);

			// Symlinked directory contains files
			mockFs.readdir.mockResolvedValueOnce([
				mockDirent('file.ts', { isFile: true }),
			] as any);

			// Mock realpath - first call is for project root (walkDirectory), subsequent calls for symlink checking
			let realpathCallCount = 0;
			(mockFs.realpath as jest.Mock).mockImplementation(
				async (filePath: any) => {
					realpathCallCount++;
					if (realpathCallCount === 1 || filePath === tempDir) {
						return tempDir;
					}
					if (filePath.includes('linked-src')) {
						// Points to internal directory
						return tempDir + '/actual-src';
					}
					return tempDir + '/' + filePath;
				},
			);

			mockFs.stat.mockImplementation(async (filePath: any) => {
				if (filePath.includes('linked-src') && !filePath.includes('file.ts')) {
					return { isDirectory: () => true, isFile: () => false } as any;
				}
				return { size: 1024, isFile: () => true } as any;
			});

			mockFileUtils.fileIsReadable.mockResolvedValue(false);

			const result = await fileScanner.scanFiles(mockConfig);

			// Should include files from symlinked directory
			expect(result.some((f) => f.path.includes('file.ts'))).toBe(true);
		});
	});
});
