import pkg from 'enquirer';
import path from 'node:path';
const { prompt } = pkg;

import { IConstellationConfig } from '../config/config';
import { LANGUAGE_EXTENSIONS } from '../languages/language.registry';
import { } from '../utils/constants';
import { FileUtils } from '../utils/file.utils';
import {
	BLUE_INFO,
	GREEN_CHECK,
	RED_X,
	YELLOW_LIGHTNING,
	YELLOW_WARN
} from '../utils/unicode-chars';
import { BaseCommand } from './base.command';

/**
 * Results from user prompts during initialization.
 */
interface PromptResults {
	/** API endpoint URL for the Constellation service */
	apiUrl: string;
	/** Git branch to index and track */
	branch: string;
	/** Selected programming languages to parse */
	languages: string[];
	/** Project namespace identifier */
	namespace: string;
}

/**
 * Command to initialize a new Constellation project configuration.
 * Creates constellation.json file with user-provided settings and stages it in git.
 */
export default class InitCommand extends BaseCommand {

	/**
	 * Executes the initialization process.
	 * Prompts user for configuration, creates constellation.json, and stages the file.
	 * @throws Error if git is not available or directory is not a git repository
	 */
	public async run(): Promise<void> {
		try {
			console.log(`${YELLOW_LIGHTNING}Initializing project configuration...\n`)

			const gitAvailable = await this.git!.isGitAvailable();

			if (!gitAvailable) {
				throw new Error(
					`${YELLOW_WARN} Could not find git client installation.\n${BLUE_INFO} Constellation requires git, please install git and try again (https://git-scm.com/downloads).`,
				);
			}

			const configFilePath = path.join(process.cwd(), 'constellation.json');

			// Exit early if config file already exists
			const configExists = await FileUtils.fileIsReadable(configFilePath);
			if (configExists) {
				console.log(
					`${GREEN_CHECK} Found existing constellation.json file, project already initialized.`,
				);
				return;
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
			const [status, localBranches, remoteUrl] = await Promise.all([
				this.git!.status(),
				this.git!.listBranches(),
				this.git!.getRemoteOriginUrl(),
			]);

			const { currentBranch } = status;
			const otherBranches = localBranches.filter(
				(branch) => branch !== currentBranch,
			);

			// Extract project ID from remote URL (e.g., "constellation" from "https://github.com/user/constellation.git")
			const projectId =
				remoteUrl
					.split('/')
					.pop()
					?.replace(/\.git$/, '') || '';

			// Prompt user for configuration values, suggesting defaults
			const questions = [
				{
					initial: projectId,
					message: 'Project Namespace:',
					name: 'namespace',
					type: 'input',
				},
				{
					choices: [currentBranch, ...otherBranches],
					initial: 0,
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
					message: 'Select Language(s):',
					choices: [
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
					],
					result(names: string[]) {
						return names.map((name: string) => {
							const choice = this.choices.find(
								(c: { name: string; value: string }) => c.name === name,
							);
							return choice?.value ?? name;
						});
					},
				},
				{
					initial: 'http://localhost:3000',
					message: 'Constellation API URL:',
					name: 'apiUrl',
					type: 'input',
				},
			];

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const answers = await prompt<PromptResults>(questions as any);

			// Compose Constellation config
			const constellationSettings: IConstellationConfig = {
				namespace: answers.namespace.replaceAll(' ', ''),
				branch: answers.branch,
				apiUrl: answers.apiUrl,
				languages: {
					...answers.languages.reduce(
						(acc, lang) => {
							acc[lang] = { fileExtensions: LANGUAGE_EXTENSIONS[lang] || [] };
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
				`${GREEN_CHECK} Initialized configuration file at ${configFilePath}`,
			);

			// Stage new file in git
			await this.git!.stageFile(configFilePath);
			console.log(
				`${GREEN_CHECK} Added constellation.json to staged changes in git`,
			);
		} catch (error) {
			const errorMessage =
				(error as Error).message ?? 'An unexpected error occurred';
			console.error(
				`${RED_X} Failed to initialize configuration file.\n${errorMessage}`,
			);
		}
	}
}
