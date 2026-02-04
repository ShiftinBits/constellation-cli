/**
 * HooksWriter handles writing hook configurations to tool-specific config files.
 *
 * Similar to ConfigWriter for MCP servers, this class manages the file I/O
 * operations for hook configuration, including directory creation, config
 * merging, and consistent formatting.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../utils/file.utils';
import type { AITool } from '../mcp/types';
import type { CanonicalHook, HooksConfigResult } from './types';
import { getAdapter } from './adapters';

/**
 * Writes hook configuration to tool-specific config files.
 */
export class HooksWriter {
	private cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	/**
	 * Configure hooks for a tool.
	 * @param tool The AI tool to configure hooks for
	 * @param hooks The canonical hooks to write
	 * @returns Configuration result
	 */
	async configureHooks(
		tool: AITool,
		hooks: CanonicalHook[],
	): Promise<HooksConfigResult> {
		if (!tool.hooksConfig) {
			return {
				toolId: tool.id,
				toolDisplayName: tool.displayName,
				success: false,
				error: 'Tool does not support hooks configuration',
			};
		}

		const adapter = getAdapter(tool.hooksConfig.adapterId);
		if (!adapter) {
			return {
				toolId: tool.id,
				toolDisplayName: tool.displayName,
				success: false,
				error: `Unknown adapter: ${tool.hooksConfig.adapterId}`,
			};
		}

		try {
			const hooksPath = path.join(this.cwd, tool.hooksConfig.filePath);

			// Generate new hooks config
			const newConfig = adapter.generateConfig(hooks);

			// Check if adapter produces actual config content
			// (Cline uses scripts only, returns empty object)
			const hasConfigContent = Object.keys(newConfig).some((key) => {
				const value = newConfig[key];
				return (
					value !== undefined &&
					value !== null &&
					(typeof value !== 'object' || Object.keys(value as object).length > 0)
				);
			});

			// Only write config file if adapter produces config content
			if (hasConfigContent) {
				// Ensure directory exists
				await this.ensureDirectoryExists(hooksPath);

				// Read existing config to merge (preserve user customizations)
				const existingConfig = await this.readConfig(hooksPath);

				// Merge: new config takes precedence for Constellation hooks,
				// but preserve any user-defined hooks
				const mergedConfig = this.mergeHooksConfig(existingConfig, newConfig);

				// Write config
				await this.writeConfig(hooksPath, mergedConfig);
			}

			// Generate and write auxiliary files (e.g., shell scripts for Gemini/Cline)
			let auxiliaryPaths: string[] | undefined;
			if (adapter.generateAuxiliaryFiles) {
				const auxiliaryFiles = adapter.generateAuxiliaryFiles(hooks);
				if (auxiliaryFiles) {
					await this.writeAuxiliaryFiles(auxiliaryFiles);
					auxiliaryPaths = Array.from(auxiliaryFiles.keys());
				}
			}

			return {
				toolId: tool.id,
				toolDisplayName: tool.displayName,
				success: true,
				configuredPath: hasConfigContent ? hooksPath : undefined,
				auxiliaryPaths,
			};
		} catch (error) {
			return {
				toolId: tool.id,
				toolDisplayName: tool.displayName,
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
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
	private async readConfig(filePath: string): Promise<Record<string, unknown>> {
		try {
			const exists = await FileUtils.fileIsReadable(filePath);
			if (!exists) return {};

			const content = await FileUtils.readFile(filePath);
			return JSON.parse(content) as Record<string, unknown>;
		} catch {
			return {};
		}
	}

	/**
	 * Merge existing hooks config with new Constellation hooks.
	 *
	 * Strategy:
	 * - Top-level keys from new config take precedence (version, hooks)
	 * - Within hooks object, Constellation-generated events replace existing
	 * - User-defined events (not in new config) are preserved
	 */
	private mergeHooksConfig(
		existing: Record<string, unknown>,
		newConfig: Record<string, unknown>,
	): Record<string, unknown> {
		// If no existing config, just return new config
		if (Object.keys(existing).length === 0) {
			return newConfig;
		}

		const existingHooks = (existing.hooks ?? {}) as Record<string, unknown>;
		const newHooks = (newConfig.hooks ?? {}) as Record<string, unknown>;

		// Merge hooks: new config events replace, other events preserved
		const mergedHooks = {
			...existingHooks,
			...newHooks,
		};

		// Build result - only include version if present in either config
		const result: Record<string, unknown> = {
			hooks: mergedHooks,
		};

		// Include version if present (Cursor has it, Gemini doesn't)
		if (newConfig.version !== undefined || existing.version !== undefined) {
			result.version = newConfig.version ?? existing.version;
		}

		return result;
	}

	/**
	 * Write config to file with consistent formatting.
	 */
	private async writeConfig(
		filePath: string,
		config: Record<string, unknown>,
	): Promise<void> {
		let content = JSON.stringify(config, null, '\t');

		// Normalize line endings to LF and ensure trailing newline
		content = content.replace(/\r\n/g, '\n');
		if (!content.endsWith('\n')) {
			content += '\n';
		}

		await FileUtils.writeFile(filePath, content);
	}

	/**
	 * Write auxiliary files (e.g., shell scripts for Gemini/Cline adapters).
	 * Makes shell scripts executable on Unix systems.
	 */
	private async writeAuxiliaryFiles(files: Map<string, string>): Promise<void> {
		for (const [relativePath, content] of files) {
			const fullPath = path.join(this.cwd, relativePath);

			// Ensure directory exists
			await this.ensureDirectoryExists(fullPath);

			// Normalize line endings to LF
			let normalizedContent = content.replace(/\r\n/g, '\n');
			if (!normalizedContent.endsWith('\n')) {
				normalizedContent += '\n';
			}

			await FileUtils.writeFile(fullPath, normalizedContent);

			// Make scripts executable on Unix if they have .sh extension
			// or start with a shebang (Cline hooks have no extension)
			if (relativePath.endsWith('.sh') || normalizedContent.startsWith('#!')) {
				await fs.chmod(fullPath, 0o755);
			}
		}
	}
}
