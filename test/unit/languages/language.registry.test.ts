import { describe, it, expect, beforeEach } from '@jest/globals';
import { LanguageRegistry, LANGUAGE_EXTENSIONS } from '../../../src/languages/language.registry';
import { ConstellationConfig, IConstellationLanguageConfig } from '../../../src/config/config';

// Helper function to create test language configurations
function createTestLanguageConfig(languages: Partial<IConstellationLanguageConfig>): IConstellationLanguageConfig {
	return languages as IConstellationLanguageConfig;
}

describe('LanguageRegistry', () => {
	let config: ConstellationConfig;
	let registry: LanguageRegistry;

	beforeEach(() => {
		config = new ConstellationConfig(
			'https://api.test.com',
			'main',
			createTestLanguageConfig({
				javascript: {
					fileExtensions: ['.js', '.jsx'],
				},
				typescript: {
					fileExtensions: ['.ts', '.tsx'],
				},
			}),
			'test-project'
		);

		registry = new LanguageRegistry(config);
	});

	describe('constructor', () => {
		it('should create instance with valid config', () => {
			expect(registry).toBeInstanceOf(LanguageRegistry);
		});
	});

	describe('javascript', () => {
		it('should return JavaScript parser', () => {
			const jsConfig = registry['javascript'];
			expect(jsConfig).toBeDefined();
			expect(jsConfig?.language).toBeDefined();
			expect(typeof jsConfig?.language).toBe('function');

			const parser = jsConfig?.language();
			expect(parser).toBeDefined();
		});

		it('should return configured file extensions for JavaScript', () => {
			const jsConfig = registry['javascript'];
			const extensions = jsConfig?.fileExtensions();
			expect(extensions).toEqual(['.js', '.jsx']);
		});

		it('should use default extensions when not configured', () => {
			const configWithoutExtensions = new ConstellationConfig(
				'https://api.test.com',
				'main',
				createTestLanguageConfig({}),
				'test-project'
			);
			const registryWithDefaults = new LanguageRegistry(configWithoutExtensions);

			const jsConfig = registryWithDefaults['javascript'];
			const extensions = jsConfig?.fileExtensions();
			expect(extensions).toEqual(LANGUAGE_EXTENSIONS['javascript']);
		});
	});

	describe('typescript', () => {
		it('should return TypeScript parser', () => {
			const tsConfig = registry['typescript'];
			expect(tsConfig).toBeDefined();
			expect(tsConfig?.language).toBeDefined();
			expect(typeof tsConfig?.language).toBe('function');

			const parser = tsConfig?.language();
			expect(parser).toBeDefined();
		});

		it('should return configured file extensions for TypeScript', () => {
			const tsConfig = registry['typescript'];
			const extensions = tsConfig?.fileExtensions();
			expect(extensions).toEqual(['.ts', '.tsx']);
		});

		it('should use default extensions when not configured', () => {
			const configWithoutExtensions = new ConstellationConfig(
				'https://api.test.com',
				'main',
				createTestLanguageConfig({}),
				'test-project'
			);
			const registryWithDefaults = new LanguageRegistry(configWithoutExtensions);

			const tsConfig = registryWithDefaults['typescript'];
			const extensions = tsConfig?.fileExtensions();
			expect(extensions).toEqual(LANGUAGE_EXTENSIONS['typescript']);
		});
	});

	describe('unimplemented languages', () => {
		it('should return undefined for python', () => {
			expect(registry['python']).toBeUndefined();
		});

		it('should return undefined for php', () => {
			expect(registry['php']).toBeUndefined();
		});

		it('should return undefined for json', () => {
			expect(registry['json']).toBeUndefined();
		});

		it('should return undefined for java', () => {
			expect(registry['java']).toBeUndefined();
		});

		it('should return undefined for go', () => {
			expect(registry['go']).toBeUndefined();
		});

		it('should return undefined for cpp', () => {
			expect(registry['cpp']).toBeUndefined();
		});

		it('should return undefined for c-sharp', () => {
			expect(registry['c-sharp']).toBeUndefined();
		});

		it('should return undefined for c', () => {
			expect(registry['c']).toBeUndefined();
		});

		it('should return undefined for bash', () => {
			expect(registry['bash']).toBeUndefined();
		});

		it('should return undefined for ruby', () => {
			expect(registry['ruby']).toBeUndefined();
		});
	});

	describe('configuration override', () => {
		it('should use custom extensions from config over defaults', () => {
			const customConfig = new ConstellationConfig(
				'https://api.test.com',
				'main',
				createTestLanguageConfig({
					javascript: {
						fileExtensions: ['.mjs', '.cjs'],
					},
				}),
				'test-project'
			);
			const customRegistry = new LanguageRegistry(customConfig);

			const extensions = customRegistry['javascript']?.fileExtensions();
			expect(extensions).toEqual(['.mjs', '.cjs']);
		});

		it('should fallback to defaults when language not in config', () => {
			const minimalConfig = new ConstellationConfig(
				'https://api.test.com',
				'main',
				createTestLanguageConfig({
					javascript: {
						fileExtensions: ['.js'],
					},
					// TypeScript not configured
				}),
				'test-project'
			);
			const minimalRegistry = new LanguageRegistry(minimalConfig);

			const tsExtensions = minimalRegistry['typescript']?.fileExtensions();
			expect(tsExtensions).toEqual(LANGUAGE_EXTENSIONS['typescript']);
		});
	});
});

describe('LANGUAGE_EXTENSIONS', () => {
	it('should define extensions for javascript', () => {
		expect(LANGUAGE_EXTENSIONS['javascript']).toEqual(['.js', '.jsx']);
	});

	it('should define extensions for typescript', () => {
		expect(LANGUAGE_EXTENSIONS['typescript']).toEqual(['.ts', '.tsx']);
	});

	it('should define extensions for python', () => {
		expect(LANGUAGE_EXTENSIONS['python']).toEqual(['.py']);
	});

	it('should define extensions for bash', () => {
		expect(LANGUAGE_EXTENSIONS['bash']).toEqual(['.sh', '.bash']);
	});

	it('should define extensions for c', () => {
		expect(LANGUAGE_EXTENSIONS['c']).toEqual(['.c', '.h']);
	});

	it('should define extensions for c-sharp', () => {
		expect(LANGUAGE_EXTENSIONS['c-sharp']).toEqual(['.cs']);
	});

	it('should define extensions for cpp', () => {
		expect(LANGUAGE_EXTENSIONS['cpp']).toEqual(['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx']);
	});

	it('should define extensions for go', () => {
		expect(LANGUAGE_EXTENSIONS['go']).toEqual(['.go']);
	});

	it('should define extensions for java', () => {
		expect(LANGUAGE_EXTENSIONS['java']).toEqual(['.java']);
	});

	it('should define extensions for json', () => {
		expect(LANGUAGE_EXTENSIONS['json']).toEqual(['.json']);
	});

	it('should define extensions for php', () => {
		expect(LANGUAGE_EXTENSIONS['php']).toEqual(['.php']);
	});

	it('should define extensions for ruby', () => {
		expect(LANGUAGE_EXTENSIONS['ruby']).toEqual(['.rb']);
	});
});