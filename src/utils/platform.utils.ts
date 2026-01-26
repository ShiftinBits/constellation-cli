/**
 * Platform-specific utilities for resolving paths to VS Code extensions and settings.
 */

import os from 'node:os';
import path from 'node:path';

/**
 * VS Code installation variant.
 */
export type VSCodeVariant = 'stable' | 'insiders';

/**
 * VS Code paths for a specific variant.
 */
export interface VSCodePaths {
	variant: VSCodeVariant;
	displayName: string;
	settingsPath: string;
}

/**
 * Folder names for each VS Code variant.
 */
const VSCODE_FOLDER_NAMES: Record<VSCodeVariant, string> = {
	stable: 'Code',
	insiders: 'Code - Insiders',
};

/**
 * Get the globalStorage path for a VS Code extension.
 *
 * @param variant - The VS Code variant (stable or insiders)
 * @param extensionId - The extension identifier (e.g., 'saoudrizwan.claude-dev')
 * @returns The absolute path to the extension's globalStorage directory
 */
export function getVSCodeGlobalStoragePath(
	variant: VSCodeVariant,
	extensionId: string,
): string {
	const homeDir = os.homedir();
	const platform = process.platform;
	const folderName = VSCODE_FOLDER_NAMES[variant];

	switch (platform) {
		case 'darwin':
			return path.join(
				homeDir,
				'Library/Application Support',
				folderName,
				'User/globalStorage',
				extensionId,
			);
		case 'win32':
			return path.join(
				process.env.APPDATA || path.join(homeDir, 'AppData/Roaming'),
				folderName,
				'User/globalStorage',
				extensionId,
			);
		default:
			// Linux and other platforms
			return path.join(
				homeDir,
				'.config',
				folderName,
				'User/globalStorage',
				extensionId,
			);
	}
}

/**
 * Get the settings paths for Cline extension across all VS Code variants.
 *
 * @returns Array of paths for each VS Code variant (stable and insiders)
 */
export function getClineSettingsPaths(): VSCodePaths[] {
	const extensionId = 'saoudrizwan.claude-dev';
	const variants: VSCodeVariant[] = ['stable', 'insiders'];

	return variants.map((variant) => ({
		variant,
		displayName: variant === 'stable' ? 'VS Code' : 'VS Code Insiders',
		settingsPath: path.join(
			getVSCodeGlobalStoragePath(variant, extensionId),
			'settings',
			'cline_mcp_settings.json',
		),
	}));
}

/**
 * Get the primary (VS Code stable) settings path for Cline.
 * Used as the canonical configPath for the tool registry.
 *
 * @returns Absolute path to Cline's MCP settings file in VS Code stable
 */
export function getClinePrimarySettingsPath(): string {
	const extensionId = 'saoudrizwan.claude-dev';
	return path.join(
		getVSCodeGlobalStoragePath('stable', extensionId),
		'settings',
		'cline_mcp_settings.json',
	);
}

/**
 * Get the Copilot CLI MCP settings path.
 * - macOS/Linux: ~/.copilot/mcp_settings.json
 * - Windows: %USERPROFILE%\.copilot\mcp_settings.json
 *
 * @returns Absolute path to Copilot CLI's MCP settings file
 */
export function getCopilotCliSettingsPath(): string {
	const homeDir = os.homedir();
	return path.join(homeDir, '.copilot', 'mcp-config.json');
}

/**
 * Global config path entry for tools that support multiple installations.
 * Duplicated here to avoid circular dependency with mcp/types.ts.
 */
interface GlobalConfigPath {
	displayName: string;
	settingsPath: string;
}

/**
 * Get the settings paths for Copilot CLI.
 * Unlike Cline (which has VS Code stable/insiders variants), Copilot CLI
 * has a single installation path in the user's home directory.
 *
 * @returns Array with single path entry for Copilot CLI
 */
export function getCopilotCliSettingsPaths(): GlobalConfigPath[] {
	return [
		{
			displayName: 'Copilot CLI',
			settingsPath: getCopilotCliSettingsPath(),
		},
	];
}
