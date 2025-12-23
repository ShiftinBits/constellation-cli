import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from '@jest/globals';

// Type for enquirer's prompt function
type PromptConfig = {
	type: string;
	name: string;
	message: string;
	initial?: boolean;
};
type PromptResult = { shouldUpdate: boolean };
type PromptFn = (config: PromptConfig) => Promise<PromptResult>;

// Create a container object that will hold our mock - works around Jest hoisting
const mocks = {
	prompt: jest.fn() as jest.MockedFunction<PromptFn>,
};

// Mock enquirer before importing the module under test
jest.mock('enquirer', () => ({
	__esModule: true,
	// Reference mocks.prompt which will be populated by the time tests run
	default: { prompt: (config: PromptConfig) => mocks.prompt(config) },
}));

// Convenient alias for tests
const mockPrompt = mocks.prompt;

import { UpdatePrompter } from '../../../src/update/update-prompter';

// Mock console.log to capture output and suppress during tests
const originalConsoleLog = console.log;
let consoleOutput: string[];

describe('UpdatePrompter', () => {
	let prompter: UpdatePrompter;

	beforeEach(() => {
		prompter = new UpdatePrompter();
		mockPrompt.mockReset();
		consoleOutput = [];
		console.log = jest.fn((...args: unknown[]) => {
			consoleOutput.push(args.map(String).join(' '));
		});
	});

	afterEach(() => {
		console.log = originalConsoleLog;
	});

	describe('promptForUpdate()', () => {
		it('should return true when user accepts update', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: true });

			const result = await prompter.promptForUpdate('1.0.0', '2.0.0', 'npm');

			expect(result).toBe(true);
		});

		it('should return false when user declines update', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: false });

			const result = await prompter.promptForUpdate('1.0.0', '2.0.0', 'npm');

			expect(result).toBe(false);
		});

		it('should return false when user cancels (Ctrl+C)', async () => {
			mockPrompt.mockRejectedValueOnce(new Error('User cancelled'));

			const result = await prompter.promptForUpdate('1.0.0', '2.0.0', 'npm');

			expect(result).toBe(false);
		});

		it('should display current version', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: false });

			await prompter.promptForUpdate('1.2.3', '2.0.0', 'npm');

			const output = consoleOutput.join('\n');
			expect(output).toContain('1.2.3');
		});

		it('should display latest version', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: false });

			await prompter.promptForUpdate('1.0.0', '2.5.0', 'npm');

			const output = consoleOutput.join('\n');
			expect(output).toContain('2.5.0');
		});

		it('should display detected package manager', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: false });

			await prompter.promptForUpdate('1.0.0', '2.0.0', 'yarn');

			const output = consoleOutput.join('\n');
			expect(output).toContain('yarn');
		});

		it('should display Update Available header', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: false });

			await prompter.promptForUpdate('1.0.0', '2.0.0', 'npm');

			const output = consoleOutput.join('\n');
			expect(output).toContain('Update Available');
		});

		it('should call prompt with correct configuration', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: true });

			await prompter.promptForUpdate('1.0.0', '2.0.0', 'npm');

			expect(mockPrompt).toHaveBeenCalledWith({
				type: 'confirm',
				name: 'shouldUpdate',
				message: 'Would you like to update now?',
				initial: true,
			});
		});

		it('should work with pnpm package manager', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: true });

			await prompter.promptForUpdate('0.1.0', '0.2.0', 'pnpm');

			const output = consoleOutput.join('\n');
			expect(output).toContain('pnpm');
		});

		it('should work with bun package manager', async () => {
			mockPrompt.mockResolvedValueOnce({ shouldUpdate: true });

			await prompter.promptForUpdate('0.1.0', '0.2.0', 'bun');

			const output = consoleOutput.join('\n');
			expect(output).toContain('bun');
		});
	});
});
