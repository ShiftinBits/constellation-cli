import { describe, it, expect } from '@jest/globals';
import {
	toPosixPath,
	toPosixPaths,
	joinPosix,
	normalizeGraphPath,
	relativePosix,
} from '../../../src/utils/path.utils';

describe('path.utils', () => {
	describe('toPosixPath', () => {
		it('should convert Windows backslashes to forward slashes', () => {
			expect(toPosixPath('libs\\database\\src\\index.ts')).toBe(
				'libs/database/src/index.ts',
			);
		});

		it('should leave forward slashes unchanged', () => {
			expect(toPosixPath('libs/database/src/index.ts')).toBe(
				'libs/database/src/index.ts',
			);
		});

		it('should handle mixed slashes', () => {
			expect(toPosixPath('libs\\database/src\\index.ts')).toBe(
				'libs/database/src/index.ts',
			);
		});

		it('should handle empty string', () => {
			expect(toPosixPath('')).toBe('');
		});

		it('should handle path with only backslashes', () => {
			expect(toPosixPath('\\')).toBe('/');
			expect(toPosixPath('\\\\')).toBe('//');
		});

		it('should handle Windows UNC paths', () => {
			expect(toPosixPath('\\\\server\\share\\file.ts')).toBe(
				'//server/share/file.ts',
			);
		});
	});

	describe('toPosixPaths', () => {
		it('should convert array of paths', () => {
			const input = ['libs\\a\\index.ts', 'libs\\b\\index.ts'];
			const expected = ['libs/a/index.ts', 'libs/b/index.ts'];
			expect(toPosixPaths(input)).toEqual(expected);
		});

		it('should handle empty array', () => {
			expect(toPosixPaths([])).toEqual([]);
		});

		it('should handle mixed path formats', () => {
			const input = ['libs/a/index.ts', 'libs\\b\\index.ts'];
			const expected = ['libs/a/index.ts', 'libs/b/index.ts'];
			expect(toPosixPaths(input)).toEqual(expected);
		});
	});

	describe('joinPosix', () => {
		it('should join path segments with forward slashes', () => {
			// Even on Windows, result should use forward slashes
			const result = joinPosix('libs', 'database', 'src', 'index.ts');
			expect(result).toBe('libs/database/src/index.ts');
			expect(result).not.toContain('\\');
		});

		it('should handle single segment', () => {
			expect(joinPosix('libs')).toBe('libs');
		});

		it('should handle segments with existing slashes', () => {
			// path.join normalizes these, and we convert to posix
			const result = joinPosix('libs/', 'database', '/src', 'index.ts');
			expect(result).not.toContain('\\');
		});

		it('should handle relative paths', () => {
			const result = joinPosix('..', 'libs', 'database');
			expect(result).toBe('../libs/database');
		});
	});

	describe('normalizeGraphPath', () => {
		it('should remove leading ./', () => {
			expect(normalizeGraphPath('./libs/indexer/src/index.ts')).toBe(
				'libs/indexer/src/index.ts',
			);
		});

		it('should remove leading /', () => {
			expect(normalizeGraphPath('/libs/indexer/src/index.ts')).toBe(
				'libs/indexer/src/index.ts',
			);
		});

		it('should convert backslashes to forward slashes', () => {
			expect(normalizeGraphPath('libs\\database\\src\\index.ts')).toBe(
				'libs/database/src/index.ts',
			);
		});

		it('should handle both leading ./ and backslashes', () => {
			expect(normalizeGraphPath('.\\libs\\database\\src\\index.ts')).toBe(
				'libs/database/src/index.ts',
			);
		});

		it('should leave already normalized paths unchanged', () => {
			expect(normalizeGraphPath('libs/indexer/src/index.ts')).toBe(
				'libs/indexer/src/index.ts',
			);
		});

		it('should handle empty string', () => {
			expect(normalizeGraphPath('')).toBe('');
		});

		it('should handle just ./', () => {
			expect(normalizeGraphPath('./')).toBe('');
		});

		it('should handle just /', () => {
			expect(normalizeGraphPath('/')).toBe('');
		});

		it('should not remove ./ from middle of path', () => {
			expect(normalizeGraphPath('libs/./database')).toBe('libs/./database');
		});
	});

	describe('relativePosix', () => {
		it('should compute relative path with forward slashes', () => {
			const from = '/project/root';
			const to = '/project/root/libs/database/src/index.ts';
			const result = relativePosix(from, to);
			expect(result).toBe('libs/database/src/index.ts');
			expect(result).not.toContain('\\');
		});

		it('should handle same path', () => {
			const path = '/project/root';
			expect(relativePosix(path, path)).toBe('');
		});

		it('should handle parent directories', () => {
			const from = '/project/root/src';
			const to = '/project/root/libs/database';
			const result = relativePosix(from, to);
			expect(result).toBe('../libs/database');
			expect(result).not.toContain('\\');
		});
	});

	describe('integration scenarios', () => {
		it('should handle typical Windows relative path scenario', () => {
			// Simulate what path.relative returns on Windows
			const windowsRelativePath = 'libs\\database\\src\\index.ts';
			const normalized = normalizeGraphPath(windowsRelativePath);
			expect(normalized).toBe('libs/database/src/index.ts');
		});

		it('should handle typical graph storage scenario', () => {
			// File relative path from scanner
			const relativePath = './src\\utils\\helper.ts';
			const canonical = normalizeGraphPath(relativePath);
			expect(canonical).toBe('src/utils/helper.ts');
		});
	});
});
