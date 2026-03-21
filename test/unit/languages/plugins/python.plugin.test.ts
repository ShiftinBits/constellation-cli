import { describe, it, expect } from '@jest/globals';
import { PythonPlugin } from '../../../../src/languages/plugins/python.plugin';
import { PythonImportResolver } from '../../../../src/languages/plugins/resolvers/python-import-resolver';

describe('PythonPlugin', () => {
	const plugin = new PythonPlugin();

	it('should have correct language', () => {
		expect(plugin.language).toBe('python');
	});

	it('should include .py, .pyi, and .pyw extensions', () => {
		expect(plugin.extensions).toContain('.py');
		expect(plugin.extensions).toContain('.pyi');
		expect(plugin.extensions).toContain('.pyw');
	});

	it('should return null for build config manager', () => {
		expect(plugin.getBuildConfigManager?.('/', {})).toBeNull();
	});

	it('should return a PythonImportResolver for import resolver', () => {
		const resolver = plugin.getImportResolver?.('test.py');
		expect(resolver).toBeInstanceOf(PythonImportResolver);
	});
});
