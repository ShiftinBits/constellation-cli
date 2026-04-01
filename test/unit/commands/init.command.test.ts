import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from '@jest/globals';
import InitCommand from '../../../src/commands/init.command';
import { LANGUAGE_EXTENSIONS } from '../../../src/languages/language.registry';
import { FileUtils } from '../../../src/utils/file.utils';
import { GitClient } from '../../../src/utils/git-client';

// Mock enquirer - needs to handle both static prompt and instance prompt
jest.mock('enquirer', () => {
	// Create the mock function inside the factory
	const promptMock = jest.fn();
	// Export it so we can access it in tests
	(global as any).__enquirerMockPrompt = promptMock;
	// Create a mock class that has prompt as instance method
	const MockEnquirer = jest.fn().mockImplementation(() => ({
		prompt: promptMock,
	}));
	return {
		__esModule: true,
		default: MockEnquirer,
	};
});

// Mock dependencies
jest.mock('../../../src/utils/git-client');
jest.mock('../../../src/utils/file.utils');

describe('InitCommand', () => {
	let mockGit: jest.Mocked<GitClient>;
	let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
	let command: InitCommand;
	let mockPrompt: jest.Mock;

	beforeEach(async () => {
		// Get the mock prompt from global (set by mock factory)
		mockPrompt = (global as any).__enquirerMockPrompt;

		// Spy on console methods
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		// Create mock git client with proper typing
		mockGit = {
			isGitAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
			isGitRepository: jest
				.fn<() => Promise<boolean>>()
				.mockResolvedValue(true),
			getRootDir: jest
				.fn<() => Promise<string>>()
				.mockResolvedValue('/test/repo'),
			status: jest
				.fn<() => Promise<{ currentBranch: string; clean: boolean }>>()
				.mockResolvedValue({
					currentBranch: 'main',
					clean: true,
				}),
			listBranches: jest
				.fn<() => Promise<string[]>>()
				.mockResolvedValue(['main', 'develop', 'feature/test']),
			getRemoteOriginUrl: jest
				.fn<() => Promise<string>>()
				.mockResolvedValue('https://github.com/user/test-project.git'),
			stageFile: jest
				.fn<(path: string) => Promise<void>>()
				.mockResolvedValue(undefined),
		} as unknown as jest.Mocked<GitClient>;

		// Mock FileUtils
		(FileUtils.fileIsReadable as jest.Mock) = jest
			.fn<() => Promise<boolean>>()
			.mockResolvedValue(false);
		(FileUtils.readFile as jest.Mock) = jest
			.fn<() => Promise<string>>()
			.mockResolvedValue('{}');
		(FileUtils.writeFile as jest.Mock) = jest.fn();

		// Mock prompt
		// @ts-expect-error - Jest mock typing
		mockPrompt.mockResolvedValue({
			projectId: 'test-project',
			branch: 'main',
			languages: ['typescript', 'javascript'],
		});

		// Create command instance
		command = new InitCommand({
			Config: undefined,
			GitClient: mockGit,
			Environment: undefined,
			LanguageRegistry: undefined,
		});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		jest.clearAllMocks();
	});

	describe('run', () => {
		it('should successfully initialize project with valid configuration', async () => {
			await command.run();

			expect(mockGit.isGitAvailable).toHaveBeenCalled();
			expect(mockGit.isGitRepository).toHaveBeenCalled();
			expect(mockGit.getRootDir).toHaveBeenCalled();
			expect(mockGit.status).toHaveBeenCalled();
			expect(mockGit.listBranches).toHaveBeenCalled();
			expect(FileUtils.writeFile).toHaveBeenCalled();
			expect(mockGit.stageFile).toHaveBeenCalledWith(
				expect.stringContaining('constellation.json'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Initializing project configuration'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Initialized configuration file'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Added constellation.json to staged changes'),
			);
		});

		it('should load existing config and pre-populate prompts when constellation.json exists', async () => {
			const existingConfig = {
				projectId: 'existing-project',
				branch: 'develop',
				languages: {
					typescript: { fileExtensions: ['.ts', '.tsx'] },
					javascript: { fileExtensions: ['.js', '.jsx'] },
				},
			};

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			// Should show info message about using existing values
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Found existing constellation.json'),
			);

			// Should still proceed to prompt and write file
			expect(FileUtils.writeFile).toHaveBeenCalled();
			expect(mockGit.stageFile).toHaveBeenCalled();
		});

		it('should pre-populate projectId with existing value', async () => {
			const existingConfig = {
				projectId: 'my-existing-project',
				branch: 'main',
				languages: { typescript: { fileExtensions: ['.ts'] } },
			};

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			expect(promptQuestions[0].initial).toBe('my-existing-project');
		});

		it('should pre-select existing branch in branch selector', async () => {
			const existingConfig = {
				projectId: 'test-project',
				branch: 'develop',
				languages: { typescript: { fileExtensions: ['.ts'] } },
			};

			mockGit.listBranches.mockResolvedValue([
				'main',
				'develop',
				'feature/test',
			]);

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);

			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			// develop should be at index 1 in the list [main, develop, feature/test]
			// But wait, current branch is 'main' so list is [main, develop, feature/test]
			expect(promptQuestions[1].initial).toBe(1); // develop is at index 1
		});

		it('should pre-check existing languages in language selector', async () => {
			const existingConfig = {
				projectId: 'test-project',
				branch: 'main',
				languages: {
					typescript: { fileExtensions: ['.ts'] },
					python: { fileExtensions: ['.py'] },
				},
			};

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			const languageQuestion = promptQuestions[2];

			// Verify initial property is set with display names for pre-selection
			// Enquirer multiselect expects choice names (display text), not values
			expect(languageQuestion.initial).toEqual(
				expect.arrayContaining(['TypeScript', 'Python']),
			);
			expect(languageQuestion.initial).toHaveLength(2);
		});

		it('should show Updated message when reconfiguring existing project', async () => {
			const existingConfig = {
				projectId: 'test-project',
				branch: 'main',
				languages: { typescript: { fileExtensions: ['.ts'] } },
			};

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Updated configuration file'),
			);
		});

		it('should handle invalid JSON in existing config gracefully', async () => {
			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			// @ts-ignore - Jest mock typing
			(FileUtils.readFile as jest.Mock).mockResolvedValue('invalid json {');

			await command.run();

			// Should show warning about invalid config
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('invalid, starting fresh'),
			);

			// Should still proceed with prompts and create new config
			expect(mockPrompt).toHaveBeenCalled();
			expect(FileUtils.writeFile).toHaveBeenCalled();
		});

		it('should use empty string as initial projectId when no existing config', async () => {
			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(false);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			expect(promptQuestions[0].initial).toBe('');
		});

		it('should default to current branch when existing config branch not in list', async () => {
			const existingConfig = {
				projectId: 'test-project',
				branch: 'deleted-branch',
				languages: { typescript: { fileExtensions: ['.ts'] } },
			};

			mockGit.listBranches.mockResolvedValue(['main', 'develop']);

			// @ts-expect-error - Jest mock typing
			(FileUtils.fileIsReadable as jest.Mock).mockResolvedValue(true);
			(FileUtils.readFile as jest.Mock).mockResolvedValue(
				// @ts-expect-error - Jest mock typing
				JSON.stringify(existingConfig),
			);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			// Should default to 0 (current branch) since deleted-branch is not in list
			expect(promptQuestions[1].initial).toBe(0);
		});

		it('should throw error if git is not available', async () => {
			mockGit.isGitAvailable.mockResolvedValue(false);

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Could not find git client installation'),
			);
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should throw error if not in a git repository', async () => {
			mockGit.isGitRepository.mockResolvedValue(false);

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('not a git repository'),
			);
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should prompt for project ID with empty string as default when no existing config', async () => {
			await command.run();

			// Verify prompt was called with empty initial value for project ID
			expect(mockPrompt).toHaveBeenCalled();
			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			expect(promptQuestions[0].name).toBe('projectId');
			expect(promptQuestions[0].message).toBe('Constellation Project ID:');
			expect(promptQuestions[0].initial).toBe('');
			expect(promptQuestions[0].validate).toBeDefined();
		});

		it('should validate that project ID is not empty', async () => {
			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			const validateFn = promptQuestions[0].validate;

			// Empty string should fail validation
			expect(validateFn('')).toBe('Project ID is required');
			expect(validateFn('   ')).toBe('Project ID is required');

			// Non-empty string should pass
			expect(validateFn('my-project')).toBe(true);
		});

		it('should present current branch as first choice', async () => {
			mockGit.status.mockResolvedValue({
				currentBranch: 'develop',
				clean: true,
			});
			mockGit.listBranches.mockResolvedValue([
				'main',
				'develop',
				'feature/test',
			]);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			const branchQuestion = promptQuestions[1];
			expect(branchQuestion.choices[0]).toBe('develop');
			expect(branchQuestion.choices).toContain('main');
			expect(branchQuestion.choices).toContain('feature/test');
		});

		it('should include all supported languages in language selection', async () => {
			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			const languageQuestion = promptQuestions[2];

			// Choices should have name and value for each supported language
			expect(languageQuestion.choices).toEqual([
				{ name: 'JavaScript', value: 'javascript' },
				{ name: 'Python', value: 'python' },
				{ name: 'TypeScript', value: 'typescript' },
			]);

			// Initial should be empty when no existing config
			expect(languageQuestion.initial).toEqual([]);
		});

		it('should trim whitespace from project ID', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: '  my-test-project  ',
				branch: 'main',
				languages: ['typescript'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);
			expect(configContent.projectId).toBe('my-test-project');
		});

		it('should create config with selected languages and their extensions', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				languages: ['typescript', 'python'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);

			expect(configContent.languages).toHaveProperty('typescript');
			expect(configContent.languages.typescript.fileExtensions).toEqual(
				LANGUAGE_EXTENSIONS.typescript,
			);
			expect(configContent.languages).toHaveProperty('python');
			expect(configContent.languages.python.fileExtensions).toEqual(
				LANGUAGE_EXTENSIONS.python,
			);
		});

		it('should handle language with no extensions gracefully', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'test-project',
				branch: 'main',
				languages: ['unknown-language'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);

			expect(configContent.languages).toHaveProperty('unknown-language');
			expect(
				configContent.languages['unknown-language'].fileExtensions,
			).toEqual([]);
		});

		it('should create properly formatted JSON with 2-space indentation', async () => {
			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const jsonString = writeCall[1];

			// Check that JSON is properly formatted
			expect(jsonString).toContain('\n');
			expect(jsonString).toMatch(/  "projectId":/);
		});

		it('should include all required configuration fields', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'test-project',
				branch: 'develop',
				languages: ['javascript'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);

			expect(configContent).toHaveProperty('projectId', 'test-project');
			expect(configContent).toHaveProperty('branch', 'develop');
			expect(configContent).toHaveProperty('languages');
		});

		it('should stage constellation.json file in git after creation', async () => {
			await command.run();

			expect(mockGit.stageFile).toHaveBeenCalledWith(
				expect.stringMatching(/constellation\.json$/),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'Added constellation.json to staged changes in git',
				),
			);
		});

		it('should handle errors during file write', async () => {
			(FileUtils.writeFile as jest.Mock).mockImplementation(() => {
				throw new Error('Write failed: Permission denied');
			});

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Permission denied'),
			);
		});

		it('should handle errors during git staging', async () => {
			mockGit.stageFile.mockRejectedValue(new Error('Git add failed'));

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Git add failed'),
			);
		});

		it('should handle errors when getting git status', async () => {
			mockGit.status.mockRejectedValue(new Error('Failed to get status'));

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to get status'),
			);
		});

		it('should handle errors when listing branches', async () => {
			mockGit.listBranches.mockRejectedValue(
				new Error('Failed to list branches'),
			);

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
		});

		it('should handle prompt cancellation gracefully', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockRejectedValue(new Error('Prompt cancelled'));

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
			expect(FileUtils.writeFile).not.toHaveBeenCalled();
		});

		it('should handle error with no message', async () => {
			mockGit.isGitAvailable.mockRejectedValue({
				toString: () => 'Unknown error',
			});

			await command.run();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to initialize configuration file'),
			);
		});

		it('should parallelize git operations for performance', async () => {
			const statusPromise = Promise.resolve({
				currentBranch: 'main',
				clean: true,
			});
			const branchesPromise = Promise.resolve(['main']);

			mockGit.status.mockReturnValue(statusPromise as any);
			mockGit.listBranches.mockReturnValue(branchesPromise as any);

			await command.run();

			// Verify git operations were called
			expect(mockGit.status).toHaveBeenCalled();
			expect(mockGit.listBranches).toHaveBeenCalled();
		});

		it('should handle multiple selected languages', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'multi-lang-project',
				branch: 'main',
				languages: ['typescript', 'javascript', 'python', 'go'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);

			expect(Object.keys(configContent.languages)).toHaveLength(4);
			expect(configContent.languages).toHaveProperty('typescript');
			expect(configContent.languages).toHaveProperty('javascript');
			expect(configContent.languages).toHaveProperty('python');
			expect(configContent.languages).toHaveProperty('go');
		});

		it('should handle single selected language', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'single-lang-project',
				branch: 'main',
				languages: ['ruby'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);

			expect(Object.keys(configContent.languages)).toHaveLength(1);
			expect(configContent.languages).toHaveProperty('ruby');
			expect(configContent.languages.ruby.fileExtensions).toEqual(
				LANGUAGE_EXTENSIONS.ruby,
			);
		});

		it('should filter out current branch from other branches list', async () => {
			mockGit.status.mockResolvedValue({
				currentBranch: 'feature/test',
				clean: true,
			});
			mockGit.listBranches.mockResolvedValue([
				'main',
				'develop',
				'feature/test',
				'hotfix/bug',
			]);

			await command.run();

			const promptQuestions = mockPrompt.mock.calls[0][0] as any;
			const branchQuestion = promptQuestions[1];

			// Current branch should be first
			expect(branchQuestion.choices[0]).toBe('feature/test');
			// Should have all branches (current + others)
			expect(branchQuestion.choices).toHaveLength(4);
			// Current branch should only appear once
			const featureTestCount = branchQuestion.choices.filter(
				(b: string) => b === 'feature/test',
			).length;
			expect(featureTestCount).toBe(1);
		});

		it('should write config to correct file path', async () => {
			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const filePath = writeCall[0];

			expect(filePath).toMatch(/constellation\.json$/);
			expect(filePath).toContain(process.cwd());
		});

		it('should handle very long project IDs', async () => {
			const longId = 'a'.repeat(1000);
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: longId,
				branch: 'main',
				languages: ['typescript'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);
			expect(configContent.projectId).toBe(longId);
		});

		it('should handle special characters in project ID', async () => {
			// @ts-expect-error - Jest mock typing
			mockPrompt.mockResolvedValue({
				projectId: 'test-project_v2.0',
				branch: 'main',
				languages: ['typescript'],
			});

			await command.run();

			const writeCall = (FileUtils.writeFile as jest.Mock).mock.calls[0];
			const configContent = JSON.parse(writeCall[1] as string);
			expect(configContent.projectId).toBe('test-project_v2.0');
		});

		it('should skip MCP configuration when skipMcp option is true', async () => {
			await command.run({ skipMcp: true });

			// constellation.json should still be created
			expect(FileUtils.writeFile).toHaveBeenCalled();
			expect(mockGit.stageFile).toHaveBeenCalledWith(
				expect.stringContaining('constellation.json'),
			);

			// Only one stageFile call (constellation.json, no MCP-related staging)
			expect(mockGit.stageFile).toHaveBeenCalledTimes(1);
		});
	});
});
