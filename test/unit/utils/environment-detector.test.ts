import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
	isCI,
	isTTY,
	shouldShowBanner,
	getEnvironmentInfo,
} from '../../../src/utils/environment-detector';

describe('environment-detector', () => {
	let originalEnv: NodeJS.ProcessEnv;
	let originalIsTTY: boolean | undefined;
	beforeEach(() => {
		originalEnv = { ...process.env };
		originalIsTTY = process.stdout.isTTY;
		delete process.env.CI;
		delete process.env.GITHUB_ACTIONS;
		delete process.env.GITLAB_CI;
		delete process.env.JENKINS_URL;
		delete process.env.CIRCLECI;
		delete process.env.TRAVIS;
		delete process.env.BUILDKITE;
		delete process.env.DRONE;
		Object.defineProperty(process.stdout, 'isTTY', {
			value: undefined,
			writable: true,
			configurable: true,
		});
	});
	afterEach(() => {
		process.env = originalEnv;
		Object.defineProperty(process.stdout, 'isTTY', {
			value: originalIsTTY,
			writable: true,
			configurable: true,
		});
	});
	describe('isCI()', () => {
		it('should detect GitHub Actions', () => {
			process.env.GITHUB_ACTIONS = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect GitLab CI', () => {
			process.env.GITLAB_CI = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect Jenkins', () => {
			process.env.JENKINS_URL = 'https://jenkins.example.com';
			expect(isCI()).toBe(true);
		});
		it('should detect CircleCI', () => {
			process.env.CIRCLECI = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect Travis', () => {
			process.env.TRAVIS = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect Buildkite', () => {
			process.env.BUILDKITE = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect Drone', () => {
			process.env.DRONE = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect generic CI', () => {
			process.env.CI = 'true';
			expect(isCI()).toBe(true);
		});
		it('should detect multiple CI vars', () => {
			process.env.CI = 'true';
			process.env.GITHUB_ACTIONS = 'true';
			expect(isCI()).toBe(true);
		});
		it('should return false when no CI vars', () => {
			expect(isCI()).toBe(false);
		});
		it('should return false for empty string', () => {
			process.env.CI = '';
			expect(isCI()).toBe(false);
		});
		it('should return true for truthy strings', () => {
			process.env.CI = '1';
			expect(isCI()).toBe(true);
		});
	});
	describe('isTTY()', () => {
		it('should return true when stdout is TTY', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				writable: true,
				configurable: true,
			});
			expect(isTTY()).toBe(true);
		});
		it('should return false when stdout is not TTY', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: false,
				writable: true,
				configurable: true,
			});
			expect(isTTY()).toBe(false);
		});
		it('should return false when isTTY is undefined', () => {
			expect(isTTY()).toBe(false);
		});
		it('should handle null', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: null,
				writable: true,
				configurable: true,
			});
			expect(isTTY()).toBe(false);
		});
	});
	describe('shouldShowBanner()', () => {
		it('should return true when NOT in CI AND is TTY', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				writable: true,
				configurable: true,
			});
			expect(shouldShowBanner()).toBe(true);
		});
		it('should return false when NOT in CI BUT not TTY', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: false,
				writable: true,
				configurable: true,
			});
			expect(shouldShowBanner()).toBe(false);
		});
		it('should return false when in CI AND is TTY', () => {
			process.env.CI = 'true';
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				writable: true,
				configurable: true,
			});
			expect(shouldShowBanner()).toBe(false);
		});
		it('should return false when in CI AND not TTY', () => {
			process.env.CI = 'true';
			Object.defineProperty(process.stdout, 'isTTY', {
				value: false,
				writable: true,
				configurable: true,
			});
			expect(shouldShowBanner()).toBe(false);
		});
	});
	describe('getEnvironmentInfo()', () => {
		it('should return complete info structure', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				writable: true,
				configurable: true,
			});
			const info = getEnvironmentInfo();
			expect(info).toHaveProperty('isCI');
			expect(info).toHaveProperty('isTTY');
			expect(info).toHaveProperty('shouldShowBanner');
		});
		it('should detect GitHub Actions platform', () => {
			process.env.GITHUB_ACTIONS = 'true';
			const info = getEnvironmentInfo();
			expect(info.isCI).toBe(true);
			expect(info.detectedCI).toBe('GITHUB_ACTIONS');
		});
		it('should detect GitLab CI platform', () => {
			process.env.GITLAB_CI = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('GITLAB_CI');
		});
		it('should detect Jenkins platform', () => {
			process.env.JENKINS_URL = 'x';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('JENKINS_URL');
		});
		it('should detect CircleCI platform', () => {
			process.env.CIRCLECI = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('CIRCLECI');
		});
		it('should detect Travis platform', () => {
			process.env.TRAVIS = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('TRAVIS');
		});
		it('should detect Buildkite platform', () => {
			process.env.BUILDKITE = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('BUILDKITE');
		});
		it('should detect Drone platform', () => {
			process.env.DRONE = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('DRONE');
		});
		it('should detect generic CI', () => {
			process.env.CI = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('CI');
		});
		it('should return undefined when not in CI', () => {
			Object.defineProperty(process.stdout, 'isTTY', {
				value: true,
				writable: true,
				configurable: true,
			});
			const info = getEnvironmentInfo();
			expect(info.isCI).toBe(false);
			expect(info.detectedCI).toBeUndefined();
		});
		it('should detect first CI when multiple set', () => {
			process.env.CI = 'true';
			process.env.GITHUB_ACTIONS = 'true';
			const info = getEnvironmentInfo();
			expect(info.detectedCI).toBe('CI');
		});
	});
});
