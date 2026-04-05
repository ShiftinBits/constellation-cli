import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from '@jest/globals';
import path from 'node:path';

import { CICDConfigurator } from '../../../src/cicd/cicd-configurator';
import { FileUtils } from '../../../src/utils/file.utils';

// Mock dependencies
jest.mock('../../../src/utils/file.utils');
jest.mock('node:fs/promises', () => ({
	mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

describe('CICDConfigurator', () => {
	const gitRoot = '/test/repo';
	let configurator: CICDConfigurator;
	let mockDirectoryExists: jest.Mock<(p: string) => Promise<boolean>>;
	let mockFileIsReadable: jest.Mock<(p: string) => Promise<boolean>>;
	let mockReadFile: jest.Mock<(p: string) => Promise<string>>;
	let mockWriteFile: jest.Mock<(p: string, c: string) => Promise<void>>;

	beforeEach(() => {
		configurator = new CICDConfigurator(gitRoot);

		// Default: nothing exists
		mockDirectoryExists = jest
			.fn<() => Promise<boolean>>()
			.mockResolvedValue(false);
		mockFileIsReadable = jest
			.fn<() => Promise<boolean>>()
			.mockResolvedValue(false);
		mockReadFile = jest.fn<() => Promise<string>>().mockResolvedValue('');
		mockWriteFile = jest.fn();

		(FileUtils as any).directoryExists = mockDirectoryExists;
		(FileUtils as any).fileIsReadable = mockFileIsReadable;
		(FileUtils as any).readFile = mockReadFile;
		(FileUtils as any).writeFile = mockWriteFile;
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('detectPlatforms', () => {
		it('should return github when .github/workflows exists', async () => {
			mockDirectoryExists.mockResolvedValue(true);

			const platforms = await configurator.detectPlatforms();

			expect(platforms).toEqual(['github']);
			expect(mockDirectoryExists).toHaveBeenCalledWith(
				path.join(gitRoot, '.github', 'workflows'),
			);
		});

		it('should return gitlab when .gitlab-ci.yml exists', async () => {
			mockFileIsReadable.mockResolvedValue(true);

			const platforms = await configurator.detectPlatforms();

			expect(platforms).toEqual(['gitlab']);
			expect(mockFileIsReadable).toHaveBeenCalledWith(
				path.join(gitRoot, '.gitlab-ci.yml'),
			);
		});

		it('should return both platforms when both exist', async () => {
			mockDirectoryExists.mockResolvedValue(true);
			mockFileIsReadable.mockResolvedValue(true);

			const platforms = await configurator.detectPlatforms();

			expect(platforms).toEqual(['github', 'gitlab']);
		});

		it('should return empty array when neither exists', async () => {
			const platforms = await configurator.detectPlatforms();

			expect(platforms).toEqual([]);
		});
	});

	describe('githubWorkflowExists', () => {
		it('should return true when workflow file exists', async () => {
			mockFileIsReadable.mockResolvedValue(true);

			const exists = await configurator.githubWorkflowExists();

			expect(exists).toBe(true);
			expect(mockFileIsReadable).toHaveBeenCalledWith(
				path.join(gitRoot, '.github', 'workflows', 'constellation-index.yml'),
			);
		});

		it('should return false when workflow file does not exist', async () => {
			const exists = await configurator.githubWorkflowExists();

			expect(exists).toBe(false);
		});
	});

	describe('gitlabJobExists', () => {
		it('should return true when constellation-index job exists', async () => {
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue(
				'stages:\n  - test\n\nconstellation-index:\n  rules:\n    - if: $CI_COMMIT_BRANCH == "main"\n',
			);

			const exists = await configurator.gitlabJobExists();

			expect(exists).toBe(true);
		});

		it('should return false when file does not exist', async () => {
			const exists = await configurator.gitlabJobExists();

			expect(exists).toBe(false);
		});

		it('should return false when file exists but job is absent', async () => {
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue(
				'stages:\n  - test\n\nother-job:\n  script: echo hello\n',
			);

			const exists = await configurator.gitlabJobExists();

			expect(exists).toBe(false);
		});

		it('should return false when YAML is invalid', async () => {
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue('invalid: yaml: content: [');

			const exists = await configurator.gitlabJobExists();

			expect(exists).toBe(false);
		});
	});

	describe('createGitHubWorkflow', () => {
		it('should create workflows directory and write file', async () => {
			const fsMock = await import('node:fs/promises');

			const filePath = await configurator.createGitHubWorkflow('main');

			expect(fsMock.mkdir).toHaveBeenCalledWith(
				path.join(gitRoot, '.github', 'workflows'),
				{ recursive: true },
			);
			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(gitRoot, '.github', 'workflows', 'constellation-index.yml'),
				expect.stringContaining('branches: ["main"]'),
			);
			expect(filePath).toBe(
				path.join(gitRoot, '.github', 'workflows', 'constellation-index.yml'),
			);
		});

		it('should substitute branch name in workflow', async () => {
			await configurator.createGitHubWorkflow('develop');

			expect(mockWriteFile).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining('branches: ["develop"]'),
			);
		});
	});

	describe('createOrMergeGitLabCI', () => {
		it('should create new file when none exists', async () => {
			const filePath = await configurator.createOrMergeGitLabCI('main');

			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(gitRoot, '.gitlab-ci.yml'),
				expect.stringContaining('constellation-index:'),
			);
			expect(filePath).toBe(path.join(gitRoot, '.gitlab-ci.yml'));
		});

		it('should merge into existing file without destroying other jobs', async () => {
			const existingContent =
				'stages:\n  - test\n  - deploy\n\nlint:\n  stage: test\n  script: npm run lint\n\ndeploy:\n  stage: deploy\n  script: npm run deploy\n';
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue(existingContent);

			await configurator.createOrMergeGitLabCI('main');

			const writeCall = mockWriteFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			// Should preserve existing jobs
			expect(writtenContent).toContain('lint:');
			expect(writtenContent).toContain('deploy:');
			expect(writtenContent).toContain('stages:');

			// Should add Constellation config
			expect(writtenContent).toContain('constellation-index:');
			expect(writtenContent).toContain('include:');
			expect(writtenContent).toContain(
				'constellation-gitlab/constellation-index@1',
			);
		});

		it('should replace existing constellation include entry', async () => {
			const existingContent =
				'include:\n  - component: gitlab.com/shiftinbits/constellation-gitlab/constellation-index@0\n    inputs:\n      access_key: $OLD_KEY\n\nother-job:\n  script: echo hello\n';
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue(existingContent);

			await configurator.createOrMergeGitLabCI('main');

			const writeCall = mockWriteFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			// Should have the new component version
			expect(writtenContent).toContain(
				'constellation-gitlab/constellation-index@1',
			);
			// Should NOT have the old version
			expect(writtenContent).not.toContain(
				'constellation-gitlab/constellation-index@0',
			);
			// Should preserve other jobs
			expect(writtenContent).toContain('other-job:');
		});

		it('should substitute branch name in merged config', async () => {
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue('other-job:\n  script: echo hello\n');

			await configurator.createOrMergeGitLabCI('develop');

			const writeCall = mockWriteFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			expect(writtenContent).toContain('develop');
		});

		it('should handle existing include as array and add entry', async () => {
			const existingContent =
				'include:\n  - template: Verify.gitlab-ci.yml\n\ntest:\n  script: npm test\n';
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue(existingContent);

			await configurator.createOrMergeGitLabCI('main');

			const writeCall = mockWriteFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			// Should keep existing include
			expect(writtenContent).toContain('Verify.gitlab-ci.yml');
			// Should add constellation include
			expect(writtenContent).toContain(
				'constellation-gitlab/constellation-index@1',
			);
		});

		it('should overwrite with fresh content when file is not valid YAML map', async () => {
			mockFileIsReadable.mockResolvedValue(true);
			mockReadFile.mockResolvedValue('just a string value');

			await configurator.createOrMergeGitLabCI('main');

			const writeCall = mockWriteFile.mock.calls[0];
			const writtenContent = writeCall[1] as string;

			expect(writtenContent).toContain('constellation-index:');
			expect(writtenContent).toContain('include:');
		});
	});
});
