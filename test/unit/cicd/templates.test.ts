import { describe, expect, it } from '@jest/globals';
import {
	getGitHubActionsWorkflow,
	getGitLabCIConfig,
	getGitLabCIFreshYaml,
} from '../../../src/cicd/templates';

describe('CI/CD Templates', () => {
	describe('getGitHubActionsWorkflow', () => {
		it('should return workflow with correct branch', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('branches: ["main"]');
		});

		it('should substitute branch name correctly', () => {
			const result = getGitHubActionsWorkflow('develop');

			expect(result).toContain('branches: ["develop"]');
			expect(result).not.toContain('branches: ["main"]');
		});

		it('should handle branch names with slashes', () => {
			const result = getGitHubActionsWorkflow('release/1.0');

			expect(result).toContain('branches: ["release/1.0"]');
		});

		it('should include the Constellation GitHub Action', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('ShiftinBits/constellation-github@v1');
		});

		it('should include checkout step', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('actions/checkout@v4');
		});

		it('should reference CONSTELLATION_ACCESS_KEY secret', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('CONSTELLATION_ACCESS_KEY');
			expect(result).toContain('secrets.CONSTELLATION_ACCESS_KEY');
		});

		it('should set read-only permissions', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('permissions:');
			expect(result).toContain('contents: read');
		});

		it('should have correct workflow name', () => {
			const result = getGitHubActionsWorkflow('main');

			expect(result).toContain('name: Constellation Index');
		});
	});

	describe('getGitLabCIConfig', () => {
		it('should return include entry with constellation component', () => {
			const { includeEntry } = getGitLabCIConfig('main');

			expect(includeEntry.component).toBe(
				'gitlab.com/shiftinbits/constellation-gitlab/constellation-index@1',
			);
		});

		it('should include access_key input', () => {
			const { includeEntry } = getGitLabCIConfig('main');

			expect(includeEntry.inputs.access_key).toBe('$CONSTELLATION_ACCESS_KEY');
		});

		it('should return job with branch-specific rule', () => {
			const { job } = getGitLabCIConfig('main');

			expect(job.rules).toHaveLength(1);
			expect(job.rules[0].if).toContain('main');
		});

		it('should substitute branch in rule', () => {
			const { job } = getGitLabCIConfig('develop');

			expect(job.rules[0].if).toBe('$CI_COMMIT_BRANCH == "develop"');
		});

		it('should handle branch names with slashes in rules', () => {
			const { job } = getGitLabCIConfig('release/1.0');

			expect(job.rules[0].if).toBe('$CI_COMMIT_BRANCH == "release/1.0"');
		});
	});

	describe('getGitLabCIFreshYaml', () => {
		it('should return valid YAML with include and job', () => {
			const result = getGitLabCIFreshYaml('main');

			expect(result).toContain('include:');
			expect(result).toContain('constellation-index:');
		});

		it('should include constellation component reference', () => {
			const result = getGitLabCIFreshYaml('main');

			expect(result).toContain(
				'gitlab.com/shiftinbits/constellation-gitlab/constellation-index@1',
			);
		});

		it('should reference CONSTELLATION_ACCESS_KEY', () => {
			const result = getGitLabCIFreshYaml('main');

			expect(result).toContain('CONSTELLATION_ACCESS_KEY');
		});

		it('should substitute branch name', () => {
			const result = getGitLabCIFreshYaml('develop');

			expect(result).toContain('develop');
			expect(result).not.toMatch(/== "main"/);
		});
	});
});
