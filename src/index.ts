import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import {
	AuthenticationError,
	ProjectValidationError,
} from './api/constellation-client';
import AuthCommand from './commands/auth.command';
import { CommandDeps } from './commands/command.deps';
import IndexCommand from './commands/index.command';
import InitCommand from './commands/init.command';
import { ConstellationConfig } from './config/config';
import { CrossPlatformEnvironment } from './env/env-manager';
import { LanguageDetector } from './languages/language.detector';
import { LanguageRegistry } from './languages/language.registry';
import { checkForUpdates } from './update';
import { SKIP_COMMANDS } from './utils/cli-constants';
import { printBanner } from './utils/constants';
import { shouldShowBanner } from './utils/environment-detector';
import { GitClient } from './utils/git-client';
import { BLUE_INFO, RED_X } from './utils/unicode-chars';

// Enquirer throws ERR_USE_AFTER_CLOSE asynchronously on CTRL+C — exit cleanly.
process.on('uncaughtException', (error) => {
	if (
		error instanceof Error &&
		(error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE'
	) {
		process.exit(0);
	}
	console.error(
		`${RED_X} An unexpected error occurred during the index attempt:\n\t${error?.message ?? String(error)}`,
	);
	process.exit(1);
});

// Read version — prefer the value passed by main.ts to avoid re-reading package.json
const VERSION =
	((globalThis as Record<string, unknown>).__constellationVersion as string) ??
	(() => {
		const __dirname = path.dirname(fileURLToPath(import.meta.url));
		const packageJsonPath = path.join(__dirname, '..', 'package.json');
		return (
			JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
				version: string;
			}
		).version;
	})();

// Print Constellation banner and check for updates (only in interactive sessions)
if (shouldShowBanner()) {
	const cmdStr = process.argv[2];
	if (['auth', 'help', 'init', 'index'].includes(cmdStr)) {
		printBanner(cmdStr);
	} else {
		printBanner();
	}

	// Check for updates (skip for help/version commands)
	if (!SKIP_COMMANDS.includes(cmdStr)) {
		const shouldExit = await checkForUpdates(VERSION);
		if (shouldExit) {
			process.exit(0);
		}
	}
}

// Initialize command dependency resources
const cwd = process.cwd();
const cpEnvironment = new CrossPlatformEnvironment();

const program = new Command();

program
	.name('constellation')
	.description('Connecting stars in your code into intelligent patterns')
	.version(VERSION);

// Init command doesn't need config - it creates it
program
	.command('init')
	.description('Initialize a new constellation project configuration')
	.option('--skip-mcp', 'Skip MCP server configuration for AI coding tools')
	.option('--skip-ci', 'Skip CI/CD pipeline configuration')
	.action(async (options: { skipMcp?: boolean; skipCi?: boolean }) => {
		try {
			const git = new GitClient(cwd);
			// Create minimal deps for init command
			const initDeps: CommandDeps = {
				GitClient: git,
			};
			const initCommand = new InitCommand(initDeps);
			await initCommand.run({
				skipMcp: options.skipMcp,
				skipCi: options.skipCi,
			});
		} catch (error) {
			console.error(
				`${RED_X} Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	});

program
	.command('auth')
	.description('Configure authentication for the Constellation CLI')
	.option(
		'--manual',
		'Use manual access key entry instead of browser-based authentication',
	)
	.action(async (options: { manual?: boolean }) => {
		try {
			const commandDeps: CommandDeps = {
				Environment: cpEnvironment,
			};
			const authCommand = new AuthCommand(commandDeps);
			await authCommand.run(options.manual);
		} catch (error) {
			console.error(
				`${RED_X} Failed to configure authentication: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	});

// Index command needs config - load it lazily
program
	.command('index')
	.description(
		'Create or update the Constellation data indices for the current project',
	)
	.option('--full', 'Conduct a full project re-index')
	.option('--incremental', 'Conduct an incremental project index update')
	.option(
		'--dirty',
		'Skip git validation checks (branch and working tree status)',
	)
	.action(async (params) => {
		try {
			// Load config only when needed for this command
			const config = await ConstellationConfig.loadFromFile(
				path.join(cwd, 'constellation.json'),
			);
			const git = new GitClient(cwd);
			const langRegistry = new LanguageRegistry(config);
			const langDetector = new LanguageDetector(config);

			const commandDeps: CommandDeps = {
				GitClient: git,
				Config: config,
				LanguageRegistry: langRegistry,
				LanguageDetector: langDetector,
				Environment: cpEnvironment,
			};

			const isCI = cpEnvironment.isCI();
			const fullIndex = params.full || (!params.incremental && isCI);
			const gitDirty = params.dirty || false;

			if (!params.full && !params.incremental && isCI) {
				console.log(
					`${BLUE_INFO} CI environment detected — defaulting to full index. Use --incremental to override.`,
				);
			}

			const indexCommand = new IndexCommand(commandDeps);
			await indexCommand.run(fullIndex, gitDirty);
		} catch (error) {
			// ProjectValidationError and AuthenticationError are already displayed by the command
			if (
				!(error instanceof AuthenticationError) &&
				!(error instanceof ProjectValidationError)
			) {
				console.error(
					`${RED_X} Failed to run index command: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			process.exit(1);
		}
	});

program.parse();
