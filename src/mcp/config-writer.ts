/**
 * Configuration writer for MCP server configuration files.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileUtils } from '../utils/file.utils';
import { CONSTELLATION_MCP_CONFIG } from './tool-registry';
import type {
	AITool,
	GlobalConfigPath,
	MarketplaceConfig,
	PermissionsConfig,
	PluginConfig,
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
 * Strip single-line (//) and multi-line comments from JSONC content,
 * remove trailing commas before } or ], preserving strings that contain
 * comment-like patterns.
 */
function stripJsonComments(content: string): string {
	let result = '';
	let i = 0;
	const len = content.length;

	while (i < len) {
		// String literal — copy verbatim
		if (content[i] === '"') {
			result += '"';
			i++;
			while (i < len && content[i] !== '"') {
				if (content[i] === '\\') {
					result += content[i++]; // backslash
					if (i < len) result += content[i++]; // escaped char
				} else {
					result += content[i++];
				}
			}
			if (i < len) result += content[i++]; // closing quote
		} else if (content[i] === '/' && i + 1 < len && content[i + 1] === '/') {
			// Single-line comment — skip to end of line
			i += 2;
			while (i < len && content[i] !== '\n') i++;
		} else if (content[i] === '/' && i + 1 < len && content[i + 1] === '*') {
			// Multi-line comment — skip to */
			i += 2;
			while (
				i < len &&
				!(content[i] === '*' && i + 1 < len && content[i + 1] === '/')
			)
				i++;
			if (i < len) i += 2; // skip */
		} else {
			result += content[i++];
		}
	}

	// Remove trailing commas before } or ]
	return result.replace(/,(\s*[}\]])/g, '$1');
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

			// Apply root-level config defaults (e.g., $schema) — only for missing keys
			if (tool.configDefaults) {
				for (const [key, value] of Object.entries(tool.configDefaults)) {
					if (!(key in config)) {
						config[key] = value;
					}
				}
			}

			// Handle plugin configuration (if configured)
			if (tool.pluginConfig) {
				config = this.addPluginToArray(config, tool.pluginConfig);
			}

			// Add Constellation MCP server (unless skipped for plugin-only tools)
			if (!tool.skipMcpServer) {
				config = this.addConstellationServer(config, tool);

				// Handle environment policy whitelist if configured
				await this.configureEnvPolicy(config, tool);
			}

			// Write updated config
			await this.writeConfig(configPath, config, tool.format);

			// Handle permissions if configured (only for MCP-configured tools)
			if (!tool.skipMcpServer && tool.permissionsConfig) {
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
		format: 'json' | 'jsonc' | 'toml',
	): Promise<Record<string, unknown>> {
		try {
			const exists = await FileUtils.fileIsReadable(filePath);
			if (!exists) return {};

			const content = await FileUtils.readFile(filePath);

			if (format === 'json') {
				return JSON.parse(content) as Record<string, unknown>;
			} else if (format === 'jsonc') {
				return JSON.parse(stripJsonComments(content)) as Record<
					string,
					unknown
				>;
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
			const baseConfig =
				tool.mcpServerConfigOverride ?? CONSTELLATION_MCP_CONFIG;
			const serverConfig: Record<string, unknown> = {
				...baseConfig,
			};

			// Add tool-specific extras (alwaysAllow, disabled, etc.)
			if (tool.mcpServerExtras) {
				Object.assign(serverConfig, tool.mcpServerExtras);
			}

			// Merge tool-specific environment variables if defined (JSON env object format)
			if (tool.mcpEnv) {
				const envKey = tool.mcpEnvKey ?? 'env';
				const baseEnv = (baseConfig as Record<string, unknown>)[envKey] as
					| Record<string, string>
					| undefined;
				serverConfig[envKey] = { ...baseEnv, ...tool.mcpEnv };
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
		format: 'json' | 'jsonc' | 'toml',
	): Promise<void> {
		let content: string;

		if (format === 'json' || format === 'jsonc') {
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

	/**
	 * Add a plugin to an array-based plugin configuration.
	 * Creates the array if it doesn't exist, appends if it does.
	 * Does not duplicate if plugin already present.
	 */
	private addPluginToArray(
		config: Record<string, unknown>,
		pluginConfig: PluginConfig,
	): Record<string, unknown> {
		// Navigate to the parent of the plugin array
		let current = config;
		for (let i = 0; i < pluginConfig.pluginKeyPath.length - 1; i++) {
			const key = pluginConfig.pluginKeyPath[i];
			if (!current[key] || typeof current[key] !== 'object') {
				current[key] = {};
			}
			current = current[key] as Record<string, unknown>;
		}

		// Get or create the plugin array at the final key
		const lastKey =
			pluginConfig.pluginKeyPath[pluginConfig.pluginKeyPath.length - 1];
		if (!Array.isArray(current[lastKey])) {
			current[lastKey] = [];
		}

		const pluginArray = current[lastKey] as string[];

		// Add plugin if not already present
		if (!pluginArray.includes(pluginConfig.pluginValue)) {
			pluginArray.push(pluginConfig.pluginValue);
		}

		return config;
	}

	/**
	 * Update environment policy whitelist if it exists.
	 * Checks both project-level config (already loaded) and optional global config.
	 */
	private async configureEnvPolicy(
		config: Record<string, unknown>,
		tool: AITool,
	): Promise<void> {
		if (!tool.envPolicyConfig) return;

		const { includeOnlyKeyPath, envVarsToAllow, globalConfigPath } =
			tool.envPolicyConfig;

		// Update project-level config (in memory, will be written later)
		this.addToEnvPolicyWhitelist(config, includeOnlyKeyPath, envVarsToAllow);

		// Also update global config if specified and exists
		if (globalConfigPath) {
			await this.updateGlobalEnvPolicy(
				globalConfigPath,
				includeOnlyKeyPath,
				envVarsToAllow,
				tool.format,
			);
		}
	}

	/**
	 * Add environment variables to an include_only whitelist if it exists.
	 * Does not create the policy section if it doesn't exist.
	 */
	private addToEnvPolicyWhitelist(
		config: Record<string, unknown>,
		keyPath: string[],
		envVars: string[],
	): void {
		// Navigate to the parent of include_only
		let current = config;
		for (let i = 0; i < keyPath.length - 1; i++) {
			const key = keyPath[i];
			if (!current[key] || typeof current[key] !== 'object') {
				// Policy section doesn't exist - nothing to update
				return;
			}
			current = current[key] as Record<string, unknown>;
		}

		// Check if include_only exists and is an array
		const lastKey = keyPath[keyPath.length - 1];
		if (!Array.isArray(current[lastKey])) {
			// include_only doesn't exist - nothing to update
			return;
		}

		const includeOnly = current[lastKey] as string[];

		// Add each env var if not already present
		for (const envVar of envVars) {
			if (!includeOnly.includes(envVar)) {
				includeOnly.push(envVar);
			}
		}
	}

	/**
	 * Update global config's environment policy whitelist if it exists.
	 * Only writes to the file if changes were made.
	 */
	private async updateGlobalEnvPolicy(
		globalPath: string,
		keyPath: string[],
		envVars: string[],
		format: 'json' | 'jsonc' | 'toml',
	): Promise<void> {
		// Expand ~ to home directory
		const expandedPath = globalPath.replace(/^~/, os.homedir());

		// Read global config if it exists
		const config = await this.readConfig(expandedPath, format);
		if (Object.keys(config).length === 0) return; // File doesn't exist

		// Check if policy exists before modifying
		const beforeJson = JSON.stringify(config);
		this.addToEnvPolicyWhitelist(config, keyPath, envVars);
		const afterJson = JSON.stringify(config);

		// Only write if we made changes
		if (beforeJson !== afterJson) {
			await this.writeConfig(expandedPath, config, format);
		}
	}
}
