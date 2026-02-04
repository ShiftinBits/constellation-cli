import Enquirer from 'enquirer';
import path from 'node:path';
const { prompt } = Enquirer;

import type {
	IConstellationConfig,
	IConstellationLanguageConfig,
} from '../config/config';
import { getConstellationHooks, HooksWriter } from '../hooks';
import type { HooksConfigResult } from '../hooks/types';
import { LANGUAGE_EXTENSIONS } from '../languages/language.registry';
import { ConfigWriter } from '../mcp/config-writer';
import { AI_TOOLS, getToolById } from '../mcp/tool-registry';
import type { AITool, InitOptions, ToolConfigResult } from '../mcp/types';
import { FileUtils } from '../utils/file.utils';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING,
	YELLOW_WARN,
} from '../utils/unicode-chars';
import { BaseCommand } from './base.command';

/**
 * Convert an absolute path to a display-friendly relative path.
 * Returns relative path if within cwd, otherwise returns absolute path.
 */
function toDisplayPath(absolutePath: string, cwd: string): string {
	const normalizedPath = path.normalize(absolutePath);
	const normalizedCwd = path.normalize(cwd);

	if (normalizedPath.startsWith(normalizedCwd + path.sep)) {
		return path.relative(cwd, absolutePath);
	}

	// Return absolute path for files outside project (global configs)
	return absolutePath;
}

/**
 * Results from user prompts during initialization.
 */
interface PromptResults {
	/** Git branch to index and track */
	branch: string;
	/** Selected programming languages to parse */
	languages: string[];
	/** Unique project identifier (created in Constellation web app) */
	projectId: string;
}

/**
 * Command to initialize a new Constellation project configuration.
 * Creates constellation.json file with user-provided settings and stages it in git.
 */
export default class InitCommand extends BaseCommand {
	/**
	 * Executes the initialization process.
	 * Prompts user for configuration, creates constellation.json, configures MCP servers, and stages files.
	 * @param options - Optional configuration options
	 * @throws Error if git is not available or directory is not a git repository
	 */
	public async run(options: InitOptions = {}): Promise<void> {
		try {
			console.log(`${YELLOW_LIGHTNING}Initializing project configuration...\n`);

			const gitAvailable = await this.git!.isGitAvailable();

			if (!gitAvailable) {
				throw new Error(
					`${YELLOW_WARN} Could not find git client installation.\n${BLUE_INFO} Constellation requires git, please install git and try again (https://git-scm.com/downloads).`,
				);
			}

			const configFilePath = path.join(process.cwd(), 'constellation.json');

			// Load existing config if present (for idempotent re-initialization)
			let existingConfig: IConstellationConfig | null = null;
			const configExists = await FileUtils.fileIsReadable(configFilePath);
			if (configExists) {
				try {
					const content = await FileUtils.readFile(configFilePath);
					existingConfig = JSON.parse(content) as IConstellationConfig;
					console.log(
						`${BLUE_INFO} Found existing constellation.json, current values will be used as defaults.\n`,
					);
				} catch {
					// Invalid JSON, proceed with fresh init
					console.log(
						`${YELLOW_WARN} Existing constellation.json is invalid, starting fresh.\n`,
					);
				}
			}

			// Check if CWD in a git repository
			const isRepo = await this.git!.isGitRepository();
			if (!isRepo) {
				throw new Error(
					`${YELLOW_WARN} Current directory is not a git repository.\n${BLUE_INFO} Please run this command from the root directory of a git repository.`,
				);
			}

			// Check if CWD is the root of the repository
			const gitRoot = await this.git!.getRootDir();
			// if (gitRoot !== process.cwd()) {
			// 	throw new Error(
			// 		`${YELLOW_WARN} Current directory is not the root of a git repository.\n${BLUE_INFO} Please run this command from the root of this repository (${gitRoot}).`,
			// 	);
			// }

			// Parallelize Git operations for better performance
			const [status, localBranches] = await Promise.all([
				this.git!.status(),
				this.git!.listBranches(),
			]);

			const { currentBranch } = status;
			const otherBranches = localBranches.filter(
				(branch) => branch !== currentBranch,
			);

			// Build branch choices and calculate initial selection
			const branchChoices = currentBranch
				? [currentBranch, ...otherBranches]
				: otherBranches;
			const branchInitialIndex = this.getBranchInitialIndex(
				branchChoices,
				existingConfig?.branch,
			);

			const existingLangs = this.getInitialLanguages(existingConfig);

			// Prompt user for configuration values
			const questions = [
				{
					message: 'Constellation Project ID:',
					name: 'projectId',
					type: 'input',
					initial: existingConfig?.projectId ?? '',
					validate: (value: string) =>
						value.trim().length > 0 || 'Project ID is required',
				},
				{
					choices: branchChoices,
					initial: branchInitialIndex,
					limit: 10,
					maxChoices: 1,
					message: 'Branch to index:',
					name: 'branch',
					scroll: true,
					type: 'select',
				},
				{
					type: 'multiselect',
					name: 'languages',
					multiple: true,
					message: 'Select Language(s):',
					choices: this.buildLanguageChoices(existingConfig),
					initial: existingLangs,
					result(names: string[]) {
						return names.map((name: string) => {
							const choice = this.choices.find(
								(c: { name: string; value: string }) => c.name === name,
							);
							return choice?.value ?? name;
						});
					},
				},
			];

			// Use Enquirer instance for better multiselect initial support
			const enquirer = new Enquirer<PromptResults>();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const answers = await enquirer.prompt(questions as any);

			// Compose Constellation config
			const constellationSettings: IConstellationConfig = {
				projectId: answers.projectId.trim(),
				branch: answers.branch,
				languages: {
					...answers.languages.reduce(
						(acc, lang) => {
							acc[lang as keyof IConstellationConfig['languages']] = {
								fileExtensions:
									LANGUAGE_EXTENSIONS[
										lang as keyof typeof LANGUAGE_EXTENSIONS
									] || [],
							};
							return acc;
						},
						{} as IConstellationConfig['languages'],
					),
				},
			};

			const constellationJson = JSON.stringify(
				constellationSettings,
				undefined,
				2,
			);

			// Write file to disk
			FileUtils.writeFile(configFilePath, constellationJson);
			console.log(
				`${GREEN_CHECK} ${configExists ? 'Updated' : 'Initialized'} configuration file at ${toDisplayPath(configFilePath, process.cwd())}`,
			);

			// Stage new file in git
			await this.git!.stageFile(configFilePath);
			console.log(
				`${GREEN_CHECK} Added constellation.json to staged changes in git`,
			);

			// Configure MCP servers for AI coding assistants (unless skipped)
			if (!options.skipMcp) {
				await this.configureMCPServers();
			}
		} catch (error) {
			const errorMessage =
				(error as Error).message ?? 'An unexpected error occurred';
			console.error(
				`${RED_X} Failed to initialize configuration file.\n${errorMessage}`,
			);
		}
	}

	/**
	 * Configure MCP servers for AI coding assistants.
	 */
	private async configureMCPServers(): Promise<void> {
		// Ask user if they want to configure MCP servers
		const { configureMcp } = await prompt<{ configureMcp: boolean }>({
			type: 'confirm',
			name: 'configureMcp',
			message:
				'Automatically configure Constellation for AI coding assistants?',
			initial: true,
		});

		if (!configureMcp) {
			return;
		}

		// Build choices from all available tools
		const choices = AI_TOOLS.map((tool) => ({
			name: tool.displayName,
			value: tool.id,
		}));

		// Multi-select prompt for tool selection
		const { selectedTools } = await prompt<{ selectedTools: string[] }>({
			type: 'multiselect',
			name: 'selectedTools',
			message: 'Select AI coding assistants to configure:',
			choices,
			result(names: string[]) {
				return names.map((name: string) => {
					const choice = this.choices.find(
						(c: { name: string; value: string }) => c.name === name,
					);
					return choice?.value ?? name;
				});
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		if (selectedTools.length === 0) {
			console.log(`${BLUE_INFO} No tools selected, skipping MCP configuration`);
			return;
		}

		// Configure selected tools
		const writer = new ConfigWriter(process.cwd());
		const results: ToolConfigResult[] = [];

		for (const toolId of selectedTools) {
			const tool = getToolById(toolId);
			if (!tool) continue;

			console.log(`  ${BLUE_INFO} Configuring ${tool.displayName}...`);

			// Handle global config tools (like Cline) with multiple installation paths
			if (tool.isGlobalConfig && tool.getGlobalConfigPaths) {
				const globalResults = await writer.configureGlobalTool(tool);
				let anySuccess = false;

				for (const result of globalResults) {
					results.push(result);
					if (result.success) {
						anySuccess = true;
						console.log(
							`  ${GREEN_CHECK} ${result.tool.displayName} configured at ${toDisplayPath(result.configuredPath!, process.cwd())}`,
						);
					} else if (result.error) {
						console.log(
							`  ${YELLOW_WARN} ${result.tool.displayName}: ${result.error}`,
						);
					}
				}

				if (anySuccess) {
					const settingsType =
						tool.id === 'cline' ? 'global VS Code settings' : 'global settings';
					console.log(
						`  ${BLUE_INFO} Note: ${tool.displayName} uses ${settingsType} (not project-level)`,
					);
				}
				if (globalResults.length === 0) {
					const notFoundMsg =
						tool.id === 'cline'
							? 'No VS Code installations found'
							: 'Configuration directory not found';
					console.log(`  ${YELLOW_WARN} ${tool.displayName}: ${notFoundMsg}`);
				}
			} else {
				// Handle project-level config tools
				const result = await writer.configureTool(tool);
				results.push(result);

				if (result.success) {
					console.log(
						`  ${GREEN_CHECK} ${tool.displayName} configured at ${toDisplayPath(result.configuredPath!, process.cwd())}`,
					);
					if (tool.permissionsConfig) {
						console.log(
							`  ${GREEN_CHECK} ${tool.displayName} permissions set in ${tool.permissionsConfig.filePath}`,
						);
					}
				} else {
					console.log(`  ${YELLOW_WARN} ${tool.displayName}: ${result.error}`);
				}
			}
		}

		// Stage Claude Code settings file if it was configured
		const claudeCodeResult = results.find(
			(r) => r.tool.id === 'claude-code' && r.success,
		);
		if (claudeCodeResult) {
			const settingsPath = path.join(process.cwd(), '.claude/settings.json');
			try {
				await this.git!.stageFile(settingsPath);
				console.log(
					`  ${GREEN_CHECK} Added .claude/settings.json to staged changes in git`,
				);
			} catch {
				console.log(
					`  ${YELLOW_WARN} Could not stage .claude/settings.json in git`,
				);
			}
		}

		// Stage Codex CLI config file if it was configured
		const codexResult = results.find(
			(r) => r.tool.id === 'codex-cli' && r.success,
		);
		if (codexResult) {
			const codexPath = path.join(process.cwd(), '.codex/config.toml');
			try {
				await this.git!.stageFile(codexPath);
				console.log(
					`  ${GREEN_CHECK} Added .codex/config.toml to staged changes in git`,
				);
			} catch {
				// Ignore staging errors (user might not want to commit)
			}
		}

		// Stage OpenCode config file if it was configured
		const opencodeResult = results.find(
			(r) => r.tool.id === 'opencode' && r.success,
		);
		if (opencodeResult) {
			const opencodePath = path.join(process.cwd(), 'opencode.jsonc');
			try {
				await this.git!.stageFile(opencodePath);
				console.log(
					`  ${GREEN_CHECK} Added opencode.jsonc to staged changes in git`,
				);
			} catch {
				// Ignore staging errors
			}
		}

		// Summary
		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		console.log(
			`\n${GREEN_CHECK} MCP configuration complete: ${successful} configured`,
		);
		if (failed > 0) {
			console.log(`${YELLOW_WARN} ${failed} tool(s) could not be configured`);
		}

		// Configure hooks for tools that support them
		await this.configureHooks(selectedTools, results);

		// Reminder for tools that need restart
		console.log(
			`\n${BLUE_INFO} Some tools may require restart to pick up new configuration.`,
		);
	}

	/**
	 * Configure hooks for AI coding assistants that support them.
	 * Only configures hooks for tools that were successfully MCP-configured.
	 */
	private async configureHooks(
		selectedToolIds: string[],
		mcpResults: ToolConfigResult[],
	): Promise<void> {
		const hooksWriter = new HooksWriter(process.cwd());
		const hooks = getConstellationHooks();

		// Only configure hooks for successfully MCP-configured tools that support hooks
		const toolsToConfigureHooks = selectedToolIds
			.map((id) => getToolById(id))
			.filter(
				(tool): tool is AITool =>
					tool !== undefined &&
					tool.hooksConfig !== undefined &&
					mcpResults.some((r) => r.tool.id === tool.id && r.success),
			);

		if (toolsToConfigureHooks.length === 0) {
			return;
		}

		console.log(`\n${BLUE_INFO} Configuring AI hooks...`);

		const hooksResults: HooksConfigResult[] = [];

		for (const tool of toolsToConfigureHooks) {
			const result = await hooksWriter.configureHooks(tool, hooks);
			hooksResults.push(result);

			if (result.success) {
				// Determine what was configured (config file or auxiliary files)
				const configuredPaths = result.configuredPath
					? [result.configuredPath]
					: (result.auxiliaryPaths ?? []);

				if (configuredPaths.length > 0) {
					// Show the directory for auxiliary files, or the file path for config
					const displayPath = result.configuredPath
						? toDisplayPath(result.configuredPath, process.cwd())
						: path.dirname(configuredPaths[0]); // auxiliaryPaths are already relative
					console.log(
						`  ${GREEN_CHECK} ${tool.displayName} hooks configured at ${displayPath}`,
					);

					// Stage all configured files in git
					for (const filePath of configuredPaths) {
						const displayFilePath = path.isAbsolute(filePath)
							? toDisplayPath(filePath, process.cwd())
							: filePath;
						try {
							await this.git!.stageFile(filePath);
							console.log(
								`  ${GREEN_CHECK} Added ${displayFilePath} to staged changes in git`,
							);
						} catch {
							console.log(
								`  ${YELLOW_WARN} Could not stage ${displayFilePath} in git`,
							);
						}
					}
				} else {
					console.log(`  ${GREEN_CHECK} ${tool.displayName} hooks configured`);
				}
			} else {
				console.log(`  ${YELLOW_WARN} ${tool.displayName}: ${result.error}`);
			}
		}

		// Hooks summary
		const hooksSuccessful = hooksResults.filter((r) => r.success).length;
		if (hooksSuccessful > 0) {
			console.log(
				`${GREEN_CHECK} Hooks configuration complete: ${hooksSuccessful} configured`,
			);
		}
	}

	/**
	 * Build language choices with pre-selection based on existing config.
	 */
	private buildLanguageChoices(
		existingConfig: IConstellationConfig | null,
	): Array<{
		name: string;
		value: string;
	}> {
		const languageList = [
			{ name: 'C', value: 'c' },
			{ name: 'C#', value: 'c-sharp' },
			{ name: 'C++', value: 'cpp' },
			{ name: 'Go', value: 'go' },
			{ name: 'JSON', value: 'json' },
			{ name: 'Java', value: 'java' },
			{ name: 'JavaScript', value: 'javascript' },
			{ name: 'PHP', value: 'php' },
			{ name: 'Python', value: 'python' },
			{ name: 'Ruby', value: 'ruby' },
			{ name: 'Shell (Bash)', value: 'bash' },
			{ name: 'TypeScript', value: 'typescript' },
		];

		return languageList;
	}

	/**
	 * Get the language names to pre-select based on existing config.
	 * Returns an array of display names for the enquirer initial property.
	 * Enquirer multiselect initial expects choice names (display text), not values.
	 */
	private getInitialLanguages(
		existingConfig: IConstellationConfig | null,
	): string[] {
		if (!existingConfig?.languages) {
			return [];
		}

		// Map from config keys (values) to display names that enquirer expects
		const valueToName: Record<string, string> = {
			c: 'C',
			'c-sharp': 'C#',
			cpp: 'C++',
			go: 'Go',
			json: 'JSON',
			java: 'Java',
			javascript: 'JavaScript',
			php: 'PHP',
			python: 'Python',
			ruby: 'Ruby',
			bash: 'Shell (Bash)',
			typescript: 'TypeScript',
		};

		// Return display names for languages that exist in the config
		return Object.keys(existingConfig.languages)
			.filter(
				(key) =>
					existingConfig.languages[
						key as keyof IConstellationLanguageConfig
					] !== undefined,
			)
			.map((key) => valueToName[key])
			.filter((name): name is string => name !== undefined);
	}

	/**
	 * Get the initial branch index based on existing config or default to current branch.
	 */
	private getBranchInitialIndex(
		branches: string[],
		existingBranch: string | undefined,
	): number {
		if (existingBranch) {
			const idx = branches.indexOf(existingBranch);
			if (idx !== -1) return idx;
		}
		// Default to current branch (always first in array)
		return 0;
	}
}
