import { describe, expect, it } from '@jest/globals';
import os from 'node:os';
import path from 'node:path';
import {
	getCodexConfigPaths,
	getCodexPrimaryConfigPath,
	getClinePrimarySettingsPath,
	getClineSettingsPaths,
} from '../../../src/utils/platform.utils';

describe('platform.utils', () => {
	describe('Codex CLI path utilities', () => {
		describe('getCodexConfigPaths', () => {
			it('should return array with single config path', () => {
				const paths = getCodexConfigPaths();

				expect(paths).toHaveLength(1);
				expect(paths[0].displayName).toBe('Codex CLI');
			});

			it('should use home directory for config path', () => {
				const paths = getCodexConfigPaths();
				const expectedPath = path.join(os.homedir(), '.codex', 'config.toml');

				expect(paths[0].settingsPath).toBe(expectedPath);
			});
		});

		describe('getCodexPrimaryConfigPath', () => {
			it('should return absolute path to config.toml', () => {
				const configPath = getCodexPrimaryConfigPath();
				const expectedPath = path.join(os.homedir(), '.codex', 'config.toml');

				expect(configPath).toBe(expectedPath);
			});

			it('should match first path from getCodexConfigPaths', () => {
				const primaryPath = getCodexPrimaryConfigPath();
				const paths = getCodexConfigPaths();

				expect(primaryPath).toBe(paths[0].settingsPath);
			});
		});
	});

	describe('Cline path utilities', () => {
		describe('getClineSettingsPaths', () => {
			it('should return paths for both VS Code variants', () => {
				const paths = getClineSettingsPaths();

				expect(paths).toHaveLength(2);
				expect(paths[0].variant).toBe('stable');
				expect(paths[1].variant).toBe('insiders');
			});

			it('should have correct display names', () => {
				const paths = getClineSettingsPaths();

				expect(paths[0].displayName).toBe('VS Code');
				expect(paths[1].displayName).toBe('VS Code Insiders');
			});

			it('should have paths ending with cline_mcp_settings.json', () => {
				const paths = getClineSettingsPaths();

				for (const p of paths) {
					expect(p.settingsPath).toContain('cline_mcp_settings.json');
				}
			});
		});

		describe('getClinePrimarySettingsPath', () => {
			it('should return path for VS Code stable', () => {
				const primaryPath = getClinePrimarySettingsPath();
				const paths = getClineSettingsPaths();
				const stablePath = paths.find((p) => p.variant === 'stable');

				expect(primaryPath).toBe(stablePath?.settingsPath);
			});
		});
	});
});
