import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from '@jest/globals';
import { UpdateChecker } from '../../../src/update/update-checker';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock console.log to suppress output during tests
const originalConsoleLog = console.log;

describe('UpdateChecker', () => {
	let checker: UpdateChecker;

	beforeEach(() => {
		checker = new UpdateChecker();
		mockFetch.mockReset();
		console.log = jest.fn();
	});

	afterEach(() => {
		console.log = originalConsoleLog;
	});

	describe('version comparison', () => {
		// We need to test the private isNewerVersion method via the public API
		// by mocking the fetch response with different versions

		it('should detect newer major version', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '2.0.0' }),
			} as Response);

			// We can't easily test isNewerVersion directly, but we can verify
			// the behavior through integration
			const result = await checker['fetchLatestVersion']('1.0.0');
			expect(result.hasUpdate).toBe(true);
		});

		it('should detect newer minor version', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.1.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0');
			expect(result.hasUpdate).toBe(true);
		});

		it('should detect newer patch version', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.1' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0');
			expect(result.hasUpdate).toBe(true);
		});

		it('should not detect update when on same version', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0');
			expect(result.hasUpdate).toBe(false);
		});

		it('should not detect update when on newer version', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('2.0.0');
			expect(result.hasUpdate).toBe(false);
		});

		it('should handle pre-release versions', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.1.0-beta.1' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0');
			// Pre-release suffix is stripped, so 1.1.0 > 1.0.0
			expect(result.hasUpdate).toBe(true);
		});

		it('should handle current version with pre-release suffix', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0-alpha.1');
			// 1.0.0 is NOT newer than 1.0.0-alpha.1 (stripped to 1.0.0 vs 1.0.0)
			expect(result.hasUpdate).toBe(false);
		});

		it('should handle versions with only major.minor', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.1' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0');
			expect(result.hasUpdate).toBe(true);
		});

		it('should handle missing patch version in current', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.1' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0');
			expect(result.hasUpdate).toBe(true);
		});

		it('should treat missing segments as zero', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1');
			expect(result.hasUpdate).toBe(false);
		});

		it('should handle equal versions with different segment counts', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '2.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('2.0');
			expect(result.hasUpdate).toBe(false);
		});
	});

	describe('fetchLatestVersion()', () => {
		it('should fetch from npm registry', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			await checker['fetchLatestVersion']('1.0.0');

			expect(mockFetch).toHaveBeenCalledWith(
				'https://registry.npmjs.org/@constellationdev/cli/latest',
				expect.objectContaining({
					headers: { Accept: 'application/json' },
				}),
			);
		});

		it('should throw on non-ok response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
			} as Response);

			await expect(checker['fetchLatestVersion']('1.0.0')).rejects.toThrow(
				'Registry returned 404',
			);
		});

		it('should return version info structure', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '2.0.0' }),
			} as Response);

			const result = await checker['fetchLatestVersion']('1.0.0');

			expect(result).toEqual({
				current: '1.0.0',
				latest: '2.0.0',
				hasUpdate: true,
			});
		});
	});

	describe('check()', () => {
		it('should return false on network error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await checker.check('1.0.0');
			expect(result).toBe(false);
		});

		it('should return false when already on latest', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ version: '1.0.0' }),
			} as Response);

			const result = await checker.check('1.0.0');
			expect(result).toBe(false);
		});

		it('should handle registry timeout gracefully', async () => {
			mockFetch.mockImplementationOnce(
				() =>
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error('Timeout')), 10),
					),
			);

			const result = await checker.check('1.0.0');
			expect(result).toBe(false);
		});
	});
});
