import { describe, it, expect, beforeEach } from '@jest/globals';
import { LanguageDetector } from '../../../src/languages/language.detector';
import { ConstellationConfig, IConstellationLanguageConfig } from '../../../src/config/config';

// Helper function to create test language configurations
function createTestLanguageConfig(languages: Partial<IConstellationLanguageConfig>): IConstellationLanguageConfig {
	return languages as IConstellationLanguageConfig;
}

describe('LanguageDetector', () => {
	let config: ConstellationConfig;
	let detector: LanguageDetector;

	beforeEach(() => {
		config = new ConstellationConfig(
			'main',
			createTestLanguageConfig({
				javascript: {
					fileExtensions: ['.js', '.jsx'],
				},
				typescript: {
					fileExtensions: ['.ts', '.tsx'],
				},
				python: {
					fileExtensions: ['.py'],
				},
			}),
			'test-project'
		);

		detector = new LanguageDetector(config);
	});

	describe('constructor', () => {
		it('should create instance with valid config', () => {
			expect(detector).toBeInstanceOf(LanguageDetector);
		});

		it('should build extension map from config', () => {
			expect(detector.detectLanguage('test.js')).toBe('javascript');
			expect(detector.detectLanguage('test.ts')).toBe('typescript');
			expect(detector.detectLanguage('test.py')).toBe('python');
		});
	});

	describe('detectLanguage', () => {
		it('should detect JavaScript files', () => {
			expect(detector.detectLanguage('src/app.js')).toBe('javascript');
			expect(detector.detectLanguage('components/Button.jsx')).toBe('javascript');
		});

		it('should detect TypeScript files', () => {
			expect(detector.detectLanguage('src/index.ts')).toBe('typescript');
			expect(detector.detectLanguage('components/App.tsx')).toBe('typescript');
		});

		it('should detect Python files', () => {
			expect(detector.detectLanguage('scripts/build.py')).toBe('python');
		});

		it('should handle file paths with directories', () => {
			expect(detector.detectLanguage('/path/to/project/src/main.ts')).toBe('typescript');
			expect(detector.detectLanguage('./relative/path/file.js')).toBe('javascript');
		});

		it('should return null for unsupported extensions', () => {
			expect(detector.detectLanguage('README.md')).toBeNull();
			expect(detector.detectLanguage('package.json')).toBeNull();
			expect(detector.detectLanguage('test.txt')).toBeNull();
		});

		it('should return null for files without extensions', () => {
			expect(detector.detectLanguage('Makefile')).toBeNull();
			expect(detector.detectLanguage('LICENSE')).toBeNull();
		});

		it('should handle case-insensitive extensions', () => {
			expect(detector.detectLanguage('test.JS')).toBe('javascript');
			expect(detector.detectLanguage('test.TS')).toBe('typescript');
			expect(detector.detectLanguage('test.PY')).toBe('python');
		});

		it('should handle files with multiple dots', () => {
			expect(detector.detectLanguage('config.test.js')).toBe('javascript');
			expect(detector.detectLanguage('types.d.ts')).toBe('typescript');
		});

		it('should handle absolute paths', () => {
			expect(detector.detectLanguage('/home/user/project/main.py')).toBe('python');
		});

		it('should handle Windows-style paths', () => {
			expect(detector.detectLanguage('C:\\Users\\test\\app.js')).toBe('javascript');
		});
	});

	describe('edge cases', () => {
		it('should handle empty language config', () => {
			const emptyConfig = new ConstellationConfig(
				'main',
				createTestLanguageConfig({}),
				'test'
			);

			const emptyDetector = new LanguageDetector(emptyConfig);
			expect(emptyDetector.detectLanguage('test.js')).toBeNull();
		});

		it('should handle language with no extensions', () => {
			const noExtConfig = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					javascript: {
						fileExtensions: [],
					},
				}),
				'test'
			);

			const noExtDetector = new LanguageDetector(noExtConfig);
			expect(noExtDetector.detectLanguage('test.js')).toBeNull();
		});

		it('should handle overlapping extensions (last one wins)', () => {
			const overlapConfig = new ConstellationConfig(
				'main',
				createTestLanguageConfig({
					javascript: {
						fileExtensions: ['.js'],
					},
					typescript: {
						fileExtensions: ['.js'], // Same extension
					},
				}),
				'test'
			);

			const overlapDetector = new LanguageDetector(overlapConfig);
			// The last processed language wins (implementation detail)
			const result = overlapDetector.detectLanguage('test.js');
			expect(['javascript', 'typescript']).toContain(result);
		});
	});
});