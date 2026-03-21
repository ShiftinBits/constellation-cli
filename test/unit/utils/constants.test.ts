import {
	describe,
	it,
	expect,
	jest,
	beforeEach,
	afterEach,
} from '@jest/globals';
import {
	printBanner,
	CONSTELLATION_BANNER,
	ASCII_LOGO,
	SupportedLanguages,
	ACCESS_KEY_ENV_VAR,
} from '../../../src/utils/constants';

describe('constants', () => {
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

	beforeEach(() => {
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	describe('printBanner', () => {
		it('should print banner without command name', () => {
			printBanner();

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain(
				'╭──────────────────────────────────────────────────────────────────────────────╮',
			);
			expect(output).toContain('constellationdev.io');
		});

		it('should print banner with command name', () => {
			printBanner('index');

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain('constellation › index');
		});

		it('should print banner with empty command name', () => {
			printBanner('');

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain(
				'╰──────────────────────────────────────────────────────────────────────────────╯',
			);
		});

		it('should print banner with long command name', () => {
			printBanner('very-long-command-name');

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain('constellation › very-long-command-name');
		});

		it('should print banner with short command name', () => {
			printBanner('cmd');

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain('constellation › cmd');
		});

		it('should handle undefined command name', () => {
			printBanner(undefined);

			expect(consoleLogSpy).toHaveBeenCalled();
			const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
			expect(output).toContain(
				'╰──────────────────────────────────────────────────────────────────────────────╯',
			);
		});
	});

	describe('CONSTELLATION_BANNER', () => {
		it('should be defined as a string', () => {
			expect(typeof CONSTELLATION_BANNER).toBe('string');
		});

		it('should contain ASCII art borders', () => {
			expect(CONSTELLATION_BANNER).toContain(
				'╭──────────────────────────────────────────────────────────────────────────────╮',
			);
			expect(CONSTELLATION_BANNER).toContain(
				'╰──────────────────────────────────────────────────────────────────────────────╯',
			);
		});

		it('should contain constellation branding', () => {
			expect(CONSTELLATION_BANNER).toContain('constellationdev.io');
		});

		it('should be a multiline string', () => {
			expect(CONSTELLATION_BANNER.split('\n').length).toBeGreaterThan(5);
		});
	});

	describe('ASCII_LOGO', () => {
		it('should be defined as a string', () => {
			expect(typeof ASCII_LOGO).toBe('string');
		});

		it('should contain visual elements', () => {
			expect(ASCII_LOGO).toContain('o');
		});

		it('should be a multiline string', () => {
			expect(ASCII_LOGO.split('\n').length).toBeGreaterThan(3);
		});

		it('should be compact', () => {
			// ASCII_LOGO should be shorter than full banner
			expect(ASCII_LOGO.length).toBeLessThan(CONSTELLATION_BANNER.length);
		});
	});

	describe('SupportedLanguages', () => {
		it('should define C language', () => {
			expect(SupportedLanguages.c).toBe('c');
		});

		it('should define C# language', () => {
			expect(SupportedLanguages.csharp).toBe('c-sharp');
		});

		it('should define C++ language', () => {
			expect(SupportedLanguages.cpp).toBe('cpp');
		});

		it('should define Go language', () => {
			expect(SupportedLanguages.gp).toBe('go');
		});

		it('should define JSON format', () => {
			expect(SupportedLanguages.json).toBe('json');
		});

		it('should define Java language', () => {
			expect(SupportedLanguages.java).toBe('java');
		});

		it('should define JavaScript language', () => {
			expect(SupportedLanguages.js).toBe('javascript');
		});

		it('should define PHP language', () => {
			expect(SupportedLanguages.php).toBe('php');
		});

		it('should define Python language', () => {
			expect(SupportedLanguages.python).toBe('python');
		});

		it('should define Ruby language', () => {
			expect(SupportedLanguages.ruby).toBe('ruby');
		});

		it('should define Bash language', () => {
			expect(SupportedLanguages.bash).toBe('bash');
		});

		it('should define TypeScript language', () => {
			expect(SupportedLanguages.ts).toBe('typescript');
		});

		it('should have all expected language entries', () => {
			const languages = Object.values(SupportedLanguages);
			expect(languages).toContain('c');
			expect(languages).toContain('c-sharp');
			expect(languages).toContain('cpp');
			expect(languages).toContain('go');
			expect(languages).toContain('json');
			expect(languages).toContain('java');
			expect(languages).toContain('javascript');
			expect(languages).toContain('php');
			expect(languages).toContain('python');
			expect(languages).toContain('ruby');
			expect(languages).toContain('bash');
			expect(languages).toContain('typescript');
		});
	});

	describe('ACCESS_KEY_ENV_VAR', () => {
		it('should be defined', () => {
			expect(ACCESS_KEY_ENV_VAR).toBeDefined();
		});

		it('should have correct value', () => {
			expect(ACCESS_KEY_ENV_VAR).toBe('CONSTELLATION_ACCESS_KEY');
		});

		it('should be a string', () => {
			expect(typeof ACCESS_KEY_ENV_VAR).toBe('string');
		});

		it('should be uppercase', () => {
			expect(ACCESS_KEY_ENV_VAR).toBe(ACCESS_KEY_ENV_VAR.toUpperCase());
		});

		it('should contain underscores', () => {
			expect(ACCESS_KEY_ENV_VAR).toContain('_');
		});
	});
});
