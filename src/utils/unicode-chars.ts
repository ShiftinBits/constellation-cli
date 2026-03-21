import ansiColors from 'ansi-colors';
import * as os from 'node:os';

/**
 * Detects whether the terminal supports Unicode characters.
 * Returns false for Windows CMD (which typically doesn't support Unicode well)
 * unless the user has explicitly configured their terminal for UTF-8.
 *
 * Can be overridden with CONSTELLATION_ASCII_MODE=1 environment variable.
 */
function supportsUnicode(): boolean {
	// Allow explicit override via environment variable
	if (process.env.CONSTELLATION_ASCII_MODE === '1') {
		return false;
	}

	// Check for CI environments that typically support Unicode
	if (process.env.CI) {
		return true;
	}

	// Windows detection
	if (os.platform() === 'win32') {
		// Windows Terminal, VS Code terminal, and PowerShell Core support Unicode
		// Check for these through environment variables
		const isModernTerminal =
			process.env.WT_SESSION || // Windows Terminal
			process.env.TERM_PROGRAM === 'vscode' || // VS Code integrated terminal
			process.env.TERM_PROGRAM === 'Hyper' || // Hyper terminal
			(process.env.TERM &&
				process.env.TERM !== 'cygwin' &&
				process.env.TERM !== 'dumb');

		return Boolean(isModernTerminal);
	}

	// macOS and Linux generally support Unicode
	return true;
}

// Unicode characters for terminals that support them
const UNICODE_CHECK = '✔';
const UNICODE_X = '✗';
const UNICODE_WARN = '⚠';
const UNICODE_INFO = 'ℹ';
const UNICODE_LIGHTNING = '⚡';

// ASCII fallbacks for Windows CMD and other limited terminals
const ASCII_CHECK = '[OK]';
const ASCII_X = '[ERR]';
const ASCII_WARN = '[WARN]';
const ASCII_INFO = '[INFO]';
const ASCII_LIGHTNING = '[>>]';

// Determine which character set to use
const useUnicode = supportsUnicode();

/** Green checkmark for success messages */
export const GREEN_CHECK = ansiColors.green(
	useUnicode ? UNICODE_CHECK : ASCII_CHECK,
);
/** Red X for error messages */
export const RED_X = ansiColors.red(useUnicode ? UNICODE_X : ASCII_X);
/** Yellow warning triangle for warning messages */
export const YELLOW_WARN = ansiColors.yellow(
	useUnicode ? UNICODE_WARN : ASCII_WARN,
);
/** Blue info symbol for informational messages */
export const BLUE_INFO = ansiColors.blue(
	useUnicode ? UNICODE_INFO : ASCII_INFO,
);
/** Yellow lightning bolt for action or initialization indicators */
export const YELLOW_LIGHTNING = ansiColors.yellow(
	useUnicode ? UNICODE_LIGHTNING : ASCII_LIGHTNING,
);
