import path from 'node:path';

import { Command } from 'commander';
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
// Print Constellation banner (only in interactive sessions)
if (shouldShowBanner()) {
	const cmdStr = process.argv[2];
	if (['auth', 'help', 'init', 'index'].includes(cmdStr)) {
		printBanner(cmdStr);
	} else {
		printBanner();
	}
}

// Initialize command dependency resources
const cwd = process.cwd();
const cpEnvironment = new CrossPlatformEnvironment();

const program = new Command();

program
	.name('constellation')
	.description('Connecting your code\'s stars into intelligent patterns')
	.version('1.0.0');

// Init command doesn't need config - it creates it
program.command('init')
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
			console.error(`${RED_X} Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

program.command('auth')
	.description('Configure authentication for the Constellation CLI')
	.action(async () => {
		try {
			const commandDeps: CommandDeps = {
				Environment: cpEnvironment
			};
			const authCommand = new AuthCommand(commandDeps);
			await authCommand.run();
		} catch (error) {
			console.error(`${RED_X} Failed to configure authentication: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

// Index command needs config - load it lazily
program.command('index')
	.description('Create or update the Constellation data indices for the current project')
	.option('--full', 'Conduct a full project re-index')
	.option('--incremental', 'Conduct an incremental project index update')
	.option('--dirty', 'Skip git validation checks (branch and working tree status)')
	.action(async (params) => {
		try {
			// Load config only when needed for this command
			const config = await ConstellationConfig.loadFromFile(path.join(cwd, 'constellation.json'));
			const git = new GitClient(cwd);
			const langRegistry = new LanguageRegistry(config);
			const langDetector = new LanguageDetector(config);

			const commandDeps: CommandDeps = {
				GitClient: git,
				Config: config,
				LanguageRegistry: langRegistry,
				LanguageDetector: langDetector,
				Environment: cpEnvironment
			};

			const fullIndex = params.full || false;
			const gitDirty = params.dirty || false;
			const indexCommand = new IndexCommand(commandDeps);
			await indexCommand.run(fullIndex, gitDirty);
		} catch (error) {
			console.error(`${RED_X} Failed to run index command: ${error instanceof Error ? error.message : String(error)}`);
			process.exit(1);
		}
	});

program.parse();
