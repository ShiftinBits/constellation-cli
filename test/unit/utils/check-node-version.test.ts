import { describe, it, expect } from '@jest/globals';
import { checkNodeVersion } from '../../../src/utils/check-node-version';

describe('checkNodeVersion', () => {
	describe('compatibility detection', () => {
		it('should return compatible when current version meets requirement', () => {
			const result = checkNodeVersion('>=24.0.0', 'v24.1.0');

			expect(result.compatible).toBe(true);
			expect(result.current).toBe('v24.1.0');
			expect(result.required).toBe('>=24.0.0');
		});

		it('should return compatible when current version exactly matches requirement', () => {
			const result = checkNodeVersion('>=24.0.0', 'v24.0.0');

			expect(result.compatible).toBe(true);
		});

		it('should return incompatible when current version is below requirement', () => {
			const result = checkNodeVersion('>=24.0.0', 'v20.11.0');

			expect(result.compatible).toBe(false);
			expect(result.current).toBe('v20.11.0');
			expect(result.required).toBe('>=24.0.0');
		});

		it('should return compatible when major version is higher even if minor is lower', () => {
			const result = checkNodeVersion('>=24.5.0', 'v25.0.0');

			expect(result.compatible).toBe(true);
		});

		it('should return incompatible when major matches but minor is below', () => {
			const result = checkNodeVersion('>=24.5.0', 'v24.4.9');

			expect(result.compatible).toBe(false);
		});

		it('should return incompatible when major and minor match but patch is below', () => {
			const result = checkNodeVersion('>=24.0.1', 'v24.0.0');

			expect(result.compatible).toBe(false);
		});
	});

	describe('version string parsing', () => {
		it('should handle version strings with v prefix', () => {
			const result = checkNodeVersion('>=24.0.0', 'v24.0.0');

			expect(result.compatible).toBe(true);
		});

		it('should handle version strings without v prefix', () => {
			const result = checkNodeVersion('>=24.0.0', '24.0.0');

			expect(result.compatible).toBe(true);
		});

		it('should parse >= prefix from engines requirement', () => {
			const result = checkNodeVersion('>=24.0.0', 'v24.0.0');

			expect(result.compatible).toBe(true);
		});
	});
});
