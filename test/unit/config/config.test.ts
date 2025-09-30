import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConstellationConfig, IConstellationConfig, IConstellationLanguageConfig } from '../../../src/config/config';
import { FileUtils } from '../../../src/utils/file.utils';
import { createTempDir, cleanupTempDir, createTestFile } from '../../helpers/test-utils';

// Helper function to create test language configurations
function createTestLanguageConfig(languages: Partial<IConstellationLanguageConfig>): IConstellationLanguageConfig {
	return languages as IConstellationLanguageConfig;
}

// Mock FileUtils
jest.mock('../../../src/utils/file.utils');

describe('ConstellationConfig', () => {
	let tempDir: string;
	const mockFileUtils = FileUtils as jest.Mocked<typeof FileUtils>;

	beforeEach(async () => {
		jest.clearAllMocks();
		tempDir = await createTempDir();
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		jest.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should create instance with all required properties', () => {
			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts', '.tsx'] },
				javascript: { fileExtensions: ['.js', '.jsx'] },
			});

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				languages,
				'test-project',
				['node_modules', '.git']
			);

			expect(config.apiUrl).toBe('http://localhost:3000');
			expect(config.branch).toBe('main');
			expect(config.languages).toBe(languages);
			expect(config.namespace).toBe('test-project');
			expect(config.exclude).toEqual(['node_modules', '.git']);
		});

		it('should create instance without optional exclude property', () => {
			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			const config = new ConstellationConfig(
				'https://api.constellation.dev',
				'develop',
				languages,
				'my-project'
			);

			expect(config.apiUrl).toBe('https://api.constellation.dev');
			expect(config.branch).toBe('develop');
			expect(config.languages).toBe(languages);
			expect(config.namespace).toBe('my-project');
			expect(config.exclude).toBeUndefined();
		});
	});

	describe('loadFromFile', () => {
		it('should load valid configuration from file', async () => {
			const configData: IConstellationConfig = {
				apiUrl: 'http://localhost:3000',
				branch: 'main',
				languages: createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts', '.tsx'] },
					javascript: { fileExtensions: ['.js', '.jsx'] },
				}),
				namespace: 'test-project',
				exclude: ['node_modules', 'dist'],
			};

			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(configData));

			const config = await ConstellationConfig.loadFromFile('/path/to/config.json');

			expect(config.apiUrl).toBe(configData.apiUrl);
			expect(config.branch).toBe(configData.branch);
			expect(config.languages).toEqual(configData.languages);
			expect(config.namespace).toBe(configData.namespace);
			expect(config.exclude).toEqual(configData.exclude);

			expect(mockFileUtils.fileIsReadable).toHaveBeenCalledWith('/path/to/config.json');
			expect(mockFileUtils.readFile).toHaveBeenCalledWith('/path/to/config.json');
		});

		it('should throw error if file is not readable', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(false);

			await expect(ConstellationConfig.loadFromFile('/missing/config.json')).rejects.toThrow(
				'Unable to find constellation config at /missing/config.json'
			);

			expect(mockFileUtils.fileIsReadable).toHaveBeenCalledWith('/missing/config.json');
			expect(mockFileUtils.readFile).not.toHaveBeenCalled();
		});

		it('should throw error if file contains invalid JSON', async () => {
			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue('{ invalid json }');

			await expect(ConstellationConfig.loadFromFile('/path/to/config.json')).rejects.toThrow();

			expect(mockFileUtils.fileIsReadable).toHaveBeenCalledWith('/path/to/config.json');
			expect(mockFileUtils.readFile).toHaveBeenCalledWith('/path/to/config.json');
		});

		it('should validate configuration after loading', async () => {
			const invalidConfigData = {
				apiUrl: 'http://localhost:3000',
				branch: 'main',
				languages: {},  // Empty languages should fail validation
				namespace: 'test-project',
			};

			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(invalidConfigData));

			await expect(ConstellationConfig.loadFromFile('/path/to/config.json')).rejects.toThrow(
				'Invalid configuration: no languages configured'
			);
		});

		it('should load configuration without optional exclude field', async () => {
			const configData = {
				apiUrl: 'http://localhost:3000',
				branch: 'main',
				languages: createTestLanguageConfig({
					typescript: { fileExtensions: ['.ts'] },
				}),
				namespace: 'test-project',
			};

			mockFileUtils.fileIsReadable.mockResolvedValue(true);
			mockFileUtils.readFile.mockResolvedValue(JSON.stringify(configData));

			const config = await ConstellationConfig.loadFromFile('/path/to/config.json');

			expect(config.exclude).toBeUndefined();
		});
	});

	describe('validate', () => {
		let validLanguages: IConstellationLanguageConfig;

		beforeEach(() => {
			validLanguages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts', '.tsx'] },
				javascript: { fileExtensions: ['.js', '.jsx'] },
			});
		});

		it('should pass validation for valid configuration', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				'test-project',
				['node_modules']
			);

			expect(() => config.validate()).not.toThrow();
		});

		it('should throw error if apiUrl is missing', () => {
			const config = new ConstellationConfig(
				'',
				'main',
				validLanguages,
				'test-project'
			);

			expect(() => config.validate()).toThrow('Invalid configuration: apiUrl is missing');
		});

		it('should throw error if branch is missing', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'',
				validLanguages,
				'test-project'
			);

			expect(() => config.validate()).toThrow('Invalid configuration: branch is missing');
		});

		it('should throw error if namespace is missing', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				''
			);

			expect(() => config.validate()).toThrow('Invalid configuration: namespace is missing');
		});

		it('should throw error if languages is empty', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				{} as IConstellationLanguageConfig,
				'test-project'
			);

			expect(() => config.validate()).toThrow('Invalid configuration: no languages configured');
		});

		it('should throw error if apiUrl is not a valid URL', () => {
			const config = new ConstellationConfig(
				'not-a-valid-url',
				'main',
				validLanguages,
				'test-project'
			);

			expect(() => config.validate()).toThrow(
				'Invalid configuration: apiUrl "not-a-valid-url" is not a valid URL'
			);
		});

		it('should throw error if language has no file extensions', () => {
			const invalidLanguages = createTestLanguageConfig({
				typescript: { fileExtensions: [] },
			});

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				invalidLanguages,
				'test-project'
			);

			expect(() => config.validate()).toThrow(
				'Invalid configuration: language "typescript" has no file extensions'
			);
		});

		it('should throw error if file extension does not start with dot', () => {
			const invalidLanguages = createTestLanguageConfig({
				typescript: { fileExtensions: ['ts', '.tsx'] },
			});

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				invalidLanguages,
				'test-project'
			);

			expect(() => config.validate()).toThrow(
				'Invalid configuration: file extension "ts" for language "typescript" must start with a dot'
			);
		});

		it('should throw error if exclude is not an array', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				'test-project',
				'not-an-array' as any
			);

			expect(() => config.validate()).toThrow(
				'Invalid configuration: exclude must be an array of strings'
			);
		});

		it('should throw error if exclude contains non-string values', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				'test-project',
				['node_modules', 123, 'dist'] as any
			);

			expect(() => config.validate()).toThrow(
				'Invalid configuration: exclude patterns must be strings'
			);
		});

		it('should pass validation with valid URL variations', () => {
			const urls = [
				'http://localhost:3000',
				'https://api.constellation.dev',
				'https://api.constellation.dev:8080',
				'https://api.constellation.dev/api/v1',
			];

			urls.forEach(url => {
				const config = new ConstellationConfig(
					url,
					'main',
					validLanguages,
					'test-project'
				);

				expect(() => config.validate()).not.toThrow();
			});
		});

		it('should handle multiple languages with different extensions', () => {
			const multiLanguages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts', '.tsx'] },
				javascript: { fileExtensions: ['.js', '.jsx', '.mjs'] },
			});

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				multiLanguages,
				'test-project'
			);

			expect(() => config.validate()).not.toThrow();
		});

		it('should validate configuration without exclude field', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				'test-project'
			);

			expect(() => config.validate()).not.toThrow();
		});

		it('should validate configuration with empty exclude array', () => {
			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				validLanguages,
				'test-project',
				[]
			);

			expect(() => config.validate()).not.toThrow();
		});
	});

	describe('validateBranch', () => {
		let config: ConstellationConfig;

		beforeEach(() => {
			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				languages,
				'test-project'
			);
		});

		it('should pass validation when branches match', () => {
			expect(() => config.validateBranch('main')).not.toThrow();
		});

		it('should throw error when current branch is null', () => {
			expect(() => config.validateBranch(null)).toThrow(
				'Not on a Git branch (detached HEAD state)'
			);
		});

		it('should throw error when branches do not match', () => {
			expect(() => config.validateBranch('develop')).toThrow(
				'Current branch "develop" does not match configured branch "main". ' +
				'Update constellation.json or switch to "main" branch.'
			);
		});

		it('should handle different branch names', () => {
			const developConfig = new ConstellationConfig(
				'http://localhost:3000',
				'develop',
				createTestLanguageConfig({ typescript: { fileExtensions: ['.ts'] } }),
				'test-project'
			);

			expect(() => developConfig.validateBranch('develop')).not.toThrow();
			expect(() => developConfig.validateBranch('main')).toThrow(
				'Current branch "main" does not match configured branch "develop"'
			);
		});

		it('should handle feature branch names', () => {
			const featureConfig = new ConstellationConfig(
				'http://localhost:3000',
				'feature/new-parser',
				createTestLanguageConfig({ typescript: { fileExtensions: ['.ts'] } }),
				'test-project'
			);

			expect(() => featureConfig.validateBranch('feature/new-parser')).not.toThrow();
			expect(() => featureConfig.validateBranch('feature/other-feature')).toThrow(
				'Current branch "feature/other-feature" does not match configured branch "feature/new-parser"'
			);
		});
	});

	describe('edge cases', () => {
		it('should handle special characters in namespace', () => {
			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				languages,
				'test-project@2024'
			);

			expect(() => config.validate()).not.toThrow();
			expect(config.namespace).toBe('test-project@2024');
		});

		it('should handle complex exclude patterns', () => {
			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			const complexExclude = [
				'node_modules',
				'dist',
				'**/*.test.ts',
				'**/test/**',
				'.git',
				'coverage',
			];

			const config = new ConstellationConfig(
				'http://localhost:3000',
				'main',
				languages,
				'test-project',
				complexExclude
			);

			expect(() => config.validate()).not.toThrow();
			expect(config.exclude).toEqual(complexExclude);
		});

		it('should validate URLs with various protocols', () => {
			const validUrls = [
				'http://localhost:3000',
				'https://api.example.com',
				'http://127.0.0.1:8080',
				'https://subdomain.domain.com:443/path',
			];

			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			validUrls.forEach(url => {
				const config = new ConstellationConfig(
					url,
					'main',
					languages,
					'test-project'
				);

				expect(() => config.validate()).not.toThrow();
			});
		});

		it('should reject invalid URL formats', () => {
			const invalidUrls = [
				'not-a-url',
				'',
				'//example.com',
				'ht/tp://invalid',
				'http://',
				'://missing-scheme',
			];

			const languages = createTestLanguageConfig({
				typescript: { fileExtensions: ['.ts'] },
			});

			invalidUrls.forEach(url => {
				const config = new ConstellationConfig(
					url,
					'main',
					languages,
					'test-project'
				);

				expect(() => config.validate()).toThrow(/Invalid configuration: apiUrl/);
			});
		});
	});
});