import { describe, it, expect } from '@jest/globals';
import { PythonPlugin } from '../../../../src/languages/plugins/python.plugin';

describe('PythonPlugin', () => {
	const plugin = new PythonPlugin();

	it('should have correct language', () => {
		expect(plugin.language).toBe('python');
	});

	it('should include .py and .pyi extensions', () => {
		expect(plugin.extensions).toContain('.py');
		expect(plugin.extensions).toContain('.pyi');
	});

	it('should return null for build config manager', () => {
		expect(plugin.getBuildConfigManager?.('/', {})).toBeNull();
	});

	it('should return null for import resolver', () => {
		expect(plugin.getImportResolver?.('test.py')).toBeNull();
	});
});
