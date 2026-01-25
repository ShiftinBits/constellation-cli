/**
 * Configuration writer for MCP server configuration files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { FileUtils } from '../utils/file.utils';
import { CONSTELLATION_MCP_CONFIG } from './tool-registry';
import type {
	AITool,
	GlobalConfigPath,
	MarketplaceConfig,
	PermissionsConfig,
	ToolConfigResult,
} from './types';

// Dynamic import for TOML support (only loaded when needed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tomlModule: {
	parse: (input: string) => any;
	stringify: (input: any) => string;
} | null = null;

async function loadTomlModule(): Promise<typeof tomlModule> {
	if (!tomlModule) {
		try {
			const mod = await import('@iarna/toml');
			tomlModule = {
				parse: mod.parse,
				stringify: mod.stringify,
			};
		} catch {
			throw new Error(
				'TOML support requires @iarna/toml package. Install with: npm install @iarna/toml',
			);
		}
	}
	return tomlModule;
}

/**
 * Writes MCP configuration to tool config files.
 */
export class ConfigWriter {
	private cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	/**
	 * Configure a tool with Constellation MCP server.
	 */
	async configureTool(tool: AITool): Promise<ToolConfigResult> {
		try {
			const configPath = path.join(this.cwd, tool.configPath);

			// Ensure directory exists
			await this.ensureDirectoryExists(configPath);

			// Read existing config or create new
			let config = await this.readConfig(configPath, tool.format);

			// Add Constellation MCP server
			config = this.addConstellationServer(config, tool);

			// Write updated config
			await this.writeConfig(configPath, config, tool.format);

			// Handle permissions if configured
			if (tool.permissionsConfig) {
				await this.configurePermissions(tool.permissionsConfig);
			}

			// Handle marketplace configuration if configured
			if (tool.marketplaceConfig) {
				await this.configureMarketplace(tool.marketplaceConfig);
			}

			return {
				tool,
				success: true,
				configuredPath: configPath,
			};
		} catch (error) {
			return {
				tool,
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Configure a global tool (like Cline) that may have multiple installation paths.
	 * Configures all available installations.
	 */
	async configureGlobalTool(tool: AITool): Promise<ToolConfigResult[]> {
		if (!tool.getGlobalConfigPaths) {
			return [
				{ tool, success: false, error: 'No global config paths defined' },
			];
		}

		const paths: GlobalConfigPath[] = tool.getGlobalConfigPaths();
		const results: ToolConfigResult[] = [];

		for (const { displayName, settingsPath } of paths) {
			try {
				// Ensure directory exists
				await this.ensureDirectoryExists(settingsPath);

				// Read existing config or create new
				let config = await this.readConfig(settingsPath, tool.format);

				// Add Constellation MCP server
				config = this.addConstellationServer(config, tool);

				// Write updated config
				await this.writeConfig(settingsPath, config, tool.format);

				results.push({
					tool: {
						...tool,
						displayName: `${tool.displayName} (${displayName})`,
					},
					success: true,
					configuredPath: settingsPath,
				});
			} catch (error) {
				// Skip installations that don't exist (VS Code variant not installed)
				// Only report actual errors, not ENOENT for parent directories
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const isNotFound =
					errorMessage.includes('ENOENT') ||
					errorMessage.includes('no such file');

				if (!isNotFound) {
					results.push({
						tool: {
							...tool,
							displayName: `${tool.displayName} (${displayName})`,
						},
						success: false,
						error: errorMessage,
					});
				}
			}
		}

		return results;
	}

	/**
	 * Ensure the directory for a config file exists.
	 */
	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
	}

	/**
	 * Read existing config or return empty object.
	 */
	private async readConfig(
		filePath: string,
		format: 'json' | 'toml',
	): Promise<Record<string, unknown>> {
		try {
			const exists = await FileUtils.fileIsReadable(filePath);
			if (!exists) return {};

			const content = await FileUtils.readFile(filePath);

			if (format === 'json') {
				return JSON.parse(content) as Record<string, unknown>;
			} else {
				const toml = await loadTomlModule();
				return toml!.parse(content);
			}
		} catch {
			return {};
		}
	}

	/**
	 * Add Constellation server to config.
	 */
	private addConstellationServer(
		config: Record<string, unknown>,
		tool: AITool,
	): Record<string, unknown> {
		// Navigate to the mcpServers key path
		let current = config;
		for (let i = 0; i < tool.mcpServersKeyPath.length - 1; i++) {
			const key = tool.mcpServersKeyPath[i];
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			current = current[key] as Record<string, unknown>;
		}

		// Get or create the mcpServers object
		const lastKey = tool.mcpServersKeyPath[tool.mcpServersKeyPath.length - 1];
		if (!current[lastKey] || typeof current[lastKey] !== 'object') {
			current[lastKey] = {};
		}
		const mcpServers = current[lastKey] as Record<string, unknown>;

		// Add constellation server (idempotent - won't overwrite if exists)
		if (!mcpServers.constellation) {
			const serverConfig: Record<string, unknown> = {
				...CONSTELLATION_MCP_CONFIG,
			};

			// Add tool-specific extras (alwaysAllow, disabled, etc.)
			if (tool.mcpServerExtras) {
				Object.assign(serverConfig, tool.mcpServerExtras);
			}

			// Merge tool-specific environment variables if defined (JSON env object format)
			if (tool.mcpEnv) {
				serverConfig.env = { ...CONSTELLATION_MCP_CONFIG.env, ...tool.mcpEnv };
			}

			// Handle env_vars array format (Codex TOML)
			if (tool.mcpEnvVars) {
				serverConfig.env_vars = tool.mcpEnvVars;
			}

			mcpServers.constellation = serverConfig;
		}

		return config;
	}

	/**
	 * Write config to file.
	 * Ensures consistent LF line endings and trailing newline for cross-platform compatibility.
	 */
	private async writeConfig(
		filePath: string,
		config: Record<string, unknown>,
		format: 'json' | 'toml',
	): Promise<void> {
		let content: string;

		if (format === 'json') {
			content = JSON.stringify(config, null, 2);
		} else {
			const toml = await loadTomlModule();
			content = toml!.stringify(config);
		}

		// Normalize line endings to LF and ensure trailing newline
		content = content.replace(/\r\n/g, '\n');
		if (!content.endsWith('\n')) {
			content += '\n';
		}

		await FileUtils.writeFile(filePath, content);
	}

	/**
	 * Configure permissions for tools that support it.
	 * Uses the permissionsConfig to navigate to the correct location and add the allow value.
	 */
	private async configurePermissions(
		permissionsConfig: PermissionsConfig,
	): Promise<void> {
		const permissionsPath = path.join(this.cwd, permissionsConfig.filePath);
		await this.ensureDirectoryExists(permissionsPath);

		let settings: Record<string, unknown> = {};

		try {
			const exists = await FileUtils.fileIsReadable(permissionsPath);
			if (exists) {
				const content = await FileUtils.readFile(permissionsPath);
				settings = JSON.parse(content) as Record<string, unknown>;
			}
		} catch {
			// File doesn't exist or is invalid - start fresh
		}

		// Navigate to the allowKeyPath location
		let current: Record<string, unknown> = settings;
		for (let i = 0; i < permissionsConfig.allowKeyPath.length - 1; i++) {
			const key = permissionsConfig.allowKeyPath[i];
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			current = current[key] as Record<string, unknown>;
		}

		// Get or create the allow array at the final key
		const lastKey =
			permissionsConfig.allowKeyPath[permissionsConfig.allowKeyPath.length - 1];
		if (!Array.isArray(current[lastKey])) {
			current[lastKey] = [];
		}

		const allowList = current[lastKey] as string[];

		// Add the allow value if not already present
		if (!allowList.includes(permissionsConfig.allowValue)) {
			allowList.push(permissionsConfig.allowValue);
		}

		await FileUtils.writeFile(
			permissionsPath,
			JSON.stringify(settings, null, '\t') + '\n',
		);
	}

	/**
	 * Configure marketplace settings for tools that support plugin marketplaces.
	 * Deep merges the configuration to preserve existing settings.
	 */
	private async configureMarketplace(
		marketplaceConfig: MarketplaceConfig,
	): Promise<void> {
		const marketplacePath = path.join(this.cwd, marketplaceConfig.filePath);
		await this.ensureDirectoryExists(marketplacePath);

		let settings: Record<string, unknown> = {};

		try {
			const exists = await FileUtils.fileIsReadable(marketplacePath);
			if (exists) {
				const content = await FileUtils.readFile(marketplacePath);
				settings = JSON.parse(content) as Record<string, unknown>;
			}
		} catch {
			// File doesn't exist or is invalid - start fresh
		}

		// Deep merge the marketplace configuration
		settings = this.deepMerge(settings, marketplaceConfig.config);

		await FileUtils.writeFile(
			marketplacePath,
			JSON.stringify(settings, null, '\t') + '\n',
		);
	}

	/**
	 * Deep merge two objects, preserving nested structures.
	 * Arrays are replaced, not merged.
	 */
	private deepMerge(
		target: Record<string, unknown>,
		source: Record<string, unknown>,
	): Record<string, unknown> {
		const result = { ...target };

		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = target[key];

			if (
				sourceValue &&
				typeof sourceValue === 'object' &&
				!Array.isArray(sourceValue) &&
				targetValue &&
				typeof targetValue === 'object' &&
				!Array.isArray(targetValue)
			) {
				result[key] = this.deepMerge(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				);
			} else {
				result[key] = sourceValue;
			}
		}

		return result;
	}
}
