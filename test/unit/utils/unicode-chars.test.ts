import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from '@jest/globals';

// Store original environment
const originalEnv = { ...process.env };

describe('unicode-chars', () => {
	beforeEach(() => {
		// Reset module cache to force re-evaluation of supportsUnicode()
		jest.resetModules();
		// Clear relevant environment variables
		delete process.env.CONSTELLATION_ASCII_MODE;
		delete process.env.CI;
		delete process.env.WT_SESSION;
		delete process.env.TERM_PROGRAM;
		delete process.env.TERM;
	});

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv };
		jest.restoreAllMocks();
	});

	describe('supportsUnicode detection', () => {
		it('should use ASCII fallback when CONSTELLATION_ASCII_MODE=1', async () => {
			process.env.CONSTELLATION_ASCII_MODE = '1';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			// ASCII fallbacks don't contain Unicode characters
			expect(GREEN_CHECK).toContain('[OK]');
			expect(RED_X).toContain('[ERR]');
		});

		it('should use Unicode in CI environment', async () => {
			process.env.CI = 'true';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			// Unicode characters should be present
			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});

		it('should use Unicode on non-Windows platforms', async () => {
			// On macOS/Linux (the test environment), Unicode is supported by default
			// This test verifies the default behavior

			const { GREEN_CHECK, RED_X, YELLOW_WARN, BLUE_INFO, YELLOW_LIGHTNING } =
				await import('../../../src/utils/unicode-chars');

			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
			expect(YELLOW_WARN).toContain('⚠');
			expect(BLUE_INFO).toContain('ℹ');
			expect(YELLOW_LIGHTNING).toContain('⚡');
		});

		it('should use Unicode on Windows Terminal (WT_SESSION)', async () => {
			// Simulate Windows Terminal by setting WT_SESSION
			// The actual platform check won't trigger on macOS, but WT_SESSION still works
			process.env.WT_SESSION = 'some-session-id';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});

		it('should use Unicode on VS Code terminal', async () => {
			process.env.TERM_PROGRAM = 'vscode';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});

		it('should use Unicode on Hyper terminal', async () => {
			process.env.TERM_PROGRAM = 'Hyper';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});

		it('should use Unicode when TERM is set to modern terminal', async () => {
			process.env.TERM = 'xterm-256color';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});
	});

	describe('CONSTELLATION_ASCII_MODE override', () => {
		it('should force ASCII mode regardless of other settings', async () => {
			// Even with CI=true, ASCII mode should override
			process.env.CI = 'true';
			process.env.CONSTELLATION_ASCII_MODE = '1';

			const { GREEN_CHECK, RED_X, YELLOW_WARN, BLUE_INFO, YELLOW_LIGHTNING } =
				await import('../../../src/utils/unicode-chars');

			expect(GREEN_CHECK).toContain('[OK]');
			expect(RED_X).toContain('[ERR]');
			expect(YELLOW_WARN).toContain('[WARN]');
			expect(BLUE_INFO).toContain('[INFO]');
			expect(YELLOW_LIGHTNING).toContain('[>>]');
		});

		it('should not enable ASCII mode for other values', async () => {
			process.env.CONSTELLATION_ASCII_MODE = '0';

			const { GREEN_CHECK, RED_X } = await import(
				'../../../src/utils/unicode-chars'
			);

			// Should use Unicode since the value is not '1'
			expect(GREEN_CHECK).toContain('✔');
			expect(RED_X).toContain('✗');
		});
	});

	describe('exported constants', () => {
		it('should export all required symbol constants', async () => {
			const mod = await import('../../../src/utils/unicode-chars');

			expect(mod).toHaveProperty('GREEN_CHECK');
			expect(mod).toHaveProperty('RED_X');
			expect(mod).toHaveProperty('YELLOW_WARN');
			expect(mod).toHaveProperty('BLUE_INFO');
			expect(mod).toHaveProperty('YELLOW_LIGHTNING');
		});

		it('should apply ANSI colors to symbols', async () => {
			const { GREEN_CHECK, RED_X, YELLOW_WARN, BLUE_INFO } = await import(
				'../../../src/utils/unicode-chars'
			);

			// ANSI escape codes start with \x1b[
			expect(GREEN_CHECK).toMatch(/\x1b\[/);
			expect(RED_X).toMatch(/\x1b\[/);
			expect(YELLOW_WARN).toMatch(/\x1b\[/);
			expect(BLUE_INFO).toMatch(/\x1b\[/);
		});
	});

	describe('ASCII fallback characters', () => {
		it('should provide readable ASCII alternatives', async () => {
			process.env.CONSTELLATION_ASCII_MODE = '1';

			const { GREEN_CHECK, RED_X, YELLOW_WARN, BLUE_INFO, YELLOW_LIGHTNING } =
				await import('../../../src/utils/unicode-chars');

			// Verify the ASCII alternatives are user-friendly
			expect(GREEN_CHECK).toContain('[OK]');
			expect(RED_X).toContain('[ERR]');
			expect(YELLOW_WARN).toContain('[WARN]');
			expect(BLUE_INFO).toContain('[INFO]');
			expect(YELLOW_LIGHTNING).toContain('[>>]');
		});
	});
});
