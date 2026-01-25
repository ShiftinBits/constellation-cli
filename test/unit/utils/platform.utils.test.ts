import { describe, expect, it } from '@jest/globals';
import {
	getClinePrimarySettingsPath,
	getClineSettingsPaths,
} from '../../../src/utils/platform.utils';

describe('platform.utils', () => {
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
