import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PackageManager } from '../../../src/update/package-manager';

// Mock child_process.spawn
const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
}));

describe('PackageManager', () => {
	let pm: PackageManager;
	let originalUserAgent: string | undefined;
	let originalPlatform: PropertyDescriptor | undefined;

	beforeEach(() => {
		originalUserAgent = process.env.npm_config_user_agent;
		delete process.env.npm_config_user_agent;
		pm = new PackageManager();
		mockSpawn.mockReset();
		originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
	});

	afterEach(() => {
		if (originalUserAgent !== undefined) {
			process.env.npm_config_user_agent = originalUserAgent;
		} else {
			delete process.env.npm_config_user_agent;
		}
		if (originalPlatform) {
			Object.defineProperty(process, 'platform', originalPlatform);
		}
	});

	describe('detect()', () => {
		it('should detect npm from user agent', () => {
			process.env.npm_config_user_agent = 'npm/10.2.4 node/v20.11.0 darwin x64';
			const newPm = new PackageManager();
			expect(newPm.detect()).toBe('npm');
		});

		it('should detect yarn from user agent', () => {
			process.env.npm_config_user_agent =
				'yarn/4.0.2 npm/? node/v20.11.0 darwin x64';
			const newPm = new PackageManager();
			expect(newPm.detect()).toBe('yarn');
		});

		it('should detect pnpm from user agent', () => {
			process.env.npm_config_user_agent =
				'pnpm/8.14.1 npm/? node/v20.11.0 darwin x64';
			const newPm = new PackageManager();
			expect(newPm.detect()).toBe('pnpm');
		});

		it('should detect bun from user agent', () => {
			process.env.npm_config_user_agent = 'bun/1.0.0';
			const newPm = new PackageManager();
			expect(newPm.detect()).toBe('bun');
		});

		it('should default to npm when no user agent', () => {
			expect(pm.detect()).toBe('npm');
		});

		it('should cache detection result', () => {
			const result1 = pm.detect();
			const result2 = pm.detect();
			expect(result1).toBe(result2);
		});
	});

	describe('getUpdateCommand()', () => {
		it('should return npm global install command', () => {
			const cmd = pm.getUpdateCommand('@constellationdev/cli');
			expect(cmd).toEqual([
				'npm',
				'install',
				'-g',
				'@constellationdev/cli@latest',
			]);
		});

		it('should return yarn global add command', () => {
			process.env.npm_config_user_agent = 'yarn/4.0.2';
			const yarnPm = new PackageManager();
			const cmd = yarnPm.getUpdateCommand('@constellationdev/cli');
			expect(cmd).toEqual([
				'yarn',
				'global',
				'add',
				'@constellationdev/cli@latest',
			]);
		});

		it('should return pnpm global add command', () => {
			process.env.npm_config_user_agent = 'pnpm/8.14.1';
			const pnpmPm = new PackageManager();
			const cmd = pnpmPm.getUpdateCommand('@constellationdev/cli');
			expect(cmd).toEqual([
				'pnpm',
				'add',
				'-g',
				'@constellationdev/cli@latest',
			]);
		});

		it('should return bun global add command', () => {
			process.env.npm_config_user_agent = 'bun/1.0.0';
			const bunPm = new PackageManager();
			const cmd = bunPm.getUpdateCommand('@constellationdev/cli');
			expect(cmd).toEqual(['bun', 'add', '-g', '@constellationdev/cli@latest']);
		});
	});

	describe('getUpdateCommandString()', () => {
		it('should return command as string', () => {
			const cmdStr = pm.getUpdateCommandString('@constellationdev/cli');
			expect(cmdStr).toBe('npm install -g @constellationdev/cli@latest');
		});
	});

	describe('executeUpdate()', () => {
		function createMockProcess() {
			const proc = new EventEmitter();
			return proc;
		}

		it('should return true on exit code 0', async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = pm.executeUpdate('@constellationdev/cli');

			// Simulate successful exit
			mockProc.emit('close', 0);

			const result = await resultPromise;
			expect(result).toBe(true);
		});

		it('should return false on non-zero exit code', async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = pm.executeUpdate('@constellationdev/cli');

			// Simulate failed exit
			mockProc.emit('close', 1);

			const result = await resultPromise;
			expect(result).toBe(false);
		});

		it('should return false on spawn error', async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = pm.executeUpdate('@constellationdev/cli');

			// Simulate spawn error (e.g., command not found)
			mockProc.emit('error', new Error('spawn ENOENT'));

			const result = await resultPromise;
			expect(result).toBe(false);
		});

		it('should spawn with correct command and args for npm', async () => {
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = pm.executeUpdate('@constellationdev/cli');
			mockProc.emit('close', 0);
			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				'npm',
				['install', '-g', '@constellationdev/cli@latest'],
				expect.objectContaining({
					stdio: 'inherit',
				}),
			);
		});

		it('should spawn with correct command for yarn', async () => {
			process.env.npm_config_user_agent = 'yarn/4.0.2';
			const yarnPm = new PackageManager();
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = yarnPm.executeUpdate('@constellationdev/cli');
			mockProc.emit('close', 0);
			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				'yarn',
				['global', 'add', '@constellationdev/cli@latest'],
				expect.anything(),
			);
		});

		it('should use shell:true on Windows', async () => {
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			});
			const winPm = new PackageManager();
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = winPm.executeUpdate('@constellationdev/cli');
			mockProc.emit('close', 0);
			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Array),
				expect.objectContaining({
					shell: true,
				}),
			);
		});

		it('should not use shell on non-Windows platforms', async () => {
			Object.defineProperty(process, 'platform', {
				value: 'darwin',
				configurable: true,
			});
			const macPm = new PackageManager();
			const mockProc = createMockProcess();
			mockSpawn.mockReturnValueOnce(mockProc);

			const resultPromise = macPm.executeUpdate('@constellationdev/cli');
			mockProc.emit('close', 0);
			await resultPromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Array),
				expect.objectContaining({
					shell: false,
				}),
			);
		});
	});
});
