import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { Command } from 'commander';
import { AuthenticationError } from './api/constellation-client';
import AuthCommand from './commands/auth.command';
import { CommandDeps } from './commands/command.deps';
import IndexCommand from './commands/index.command';
import InitCommand from './commands/init.command';
import { ConstellationConfig } from './config/config';
import { CrossPlatformEnvironment } from './env/env-manager';
import { LanguageDetector } from './languages/language.detector';
import { LanguageRegistry } from './languages/language.registry';
import { printBanner } from './utils/constants';
import { shouldShowBanner } from './utils/environment-detector';
import { GitClient } from './utils/git-client';
import { RED_X } from './utils/unicode-chars';
import { checkForUpdates } from './update';

// Read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
	version: string;
};
const VERSION = packageJson.version;

// Commands that should skip update checking
const SKIP_UPDATE_COMMANDS = ['help', '--help', '-h', '--version', '-V', '-v'];

// Print Constellation banner and check for updates (only in interactive sessions)
if (shouldShowBanner()) {
	const cmdStr = process.argv[2];
	if (['auth', 'help', 'init', 'index'].includes(cmdStr)) {
		printBanner(cmdStr);
	} else {
		printBanner();
	}

	// Check for updates (skip for help/version commands)
	if (!SKIP_UPDATE_COMMANDS.includes(cmdStr)) {
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
	.description('Connecting the stars in your code into intelligent patterns')
	.version(VERSION);

// Init command doesn't need config - it creates it
program
	.command('init')
	.description('Initialize a new constellation project configuration')
	.action(async () => {
		try {
			const git = new GitClient(cwd);
			// Create minimal deps for init command
			const initDeps: CommandDeps = {
				GitClient: git,
			};
			const initCommand = new InitCommand(initDeps);
			await initCommand.run();
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
	.action(async () => {
		try {
			const commandDeps: CommandDeps = {
				Environment: cpEnvironment,
			};
			const authCommand = new AuthCommand(commandDeps);
			await authCommand.run();
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

			const fullIndex = params.full || false;
			const gitDirty = params.dirty || false;
			const indexCommand = new IndexCommand(commandDeps);
			await indexCommand.run(fullIndex, gitDirty);
		} catch (error) {
			if (!(error instanceof AuthenticationError)) {
				console.error(
					`${RED_X} Failed to run index command: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			process.exit(1);
		}
	});

program.parse();
