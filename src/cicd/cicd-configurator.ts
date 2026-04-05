/**
 * CI/CD pipeline configurator for GitHub Actions and GitLab CI.
 * Handles platform detection, file creation, and GitLab YAML merging.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { type Document, parseDocument, isSeq, isMap } from 'yaml';

import { FileUtils } from '../utils/file.utils';
import {
	getGitHubActionsWorkflow,
	getGitLabCIConfig,
	getGitLabCIFreshYaml,
} from './templates';

export type CICDPlatform = 'github' | 'gitlab';

export interface CICDConfigResult {
	success: boolean;
	platform?: CICDPlatform;
	createdFiles: string[];
	overwrote?: boolean;
	error?: string;
}

/**
 * Detects CI/CD platforms, creates workflow files, and merges GitLab CI config.
 */
export class CICDConfigurator {
	constructor(private readonly gitRoot: string) {}

	/**
	 * Detect which CI/CD platforms are present in the repository.
	 */
	async detectPlatforms(): Promise<CICDPlatform[]> {
		const platforms: CICDPlatform[] = [];

		const [hasGitHub, hasGitLab] = await Promise.all([
			FileUtils.directoryExists(
				path.join(this.gitRoot, '.github', 'workflows'),
			),
			FileUtils.fileIsReadable(path.join(this.gitRoot, '.gitlab-ci.yml')),
		]);

		if (hasGitHub) platforms.push('github');
		if (hasGitLab) platforms.push('gitlab');

		return platforms;
	}

	/**
	 * Check if a Constellation GitHub Actions workflow already exists.
	 */
	async githubWorkflowExists(): Promise<boolean> {
		return FileUtils.fileIsReadable(
			path.join(
				this.gitRoot,
				'.github',
				'workflows',
				'constellation-index.yml',
			),
		);
	}

	/**
	 * Check if a constellation-index job already exists in .gitlab-ci.yml.
	 */
	async gitlabJobExists(): Promise<boolean> {
		const filePath = path.join(this.gitRoot, '.gitlab-ci.yml');
		const exists = await FileUtils.fileIsReadable(filePath);
		if (!exists) return false;

		try {
			const content = await FileUtils.readFile(filePath);
			const parsed = parseDocument(content);
			const map = parsed.contents;
			return isMap(map) && map.has('constellation-index');
		} catch {
			return false;
		}
	}

	/**
	 * Create the GitHub Actions workflow file.
	 * @returns Absolute path to the created file
	 */
	async createGitHubWorkflow(branch: string): Promise<string> {
		const workflowDir = path.join(this.gitRoot, '.github', 'workflows');
		await fs.mkdir(workflowDir, { recursive: true });

		const filePath = path.join(workflowDir, 'constellation-index.yml');
		await FileUtils.writeFile(filePath, getGitHubActionsWorkflow(branch));

		return filePath;
	}

	/**
	 * Create or merge Constellation config into .gitlab-ci.yml.
	 * If the file exists, merges the include entry and job without destroying other config.
	 * If the file doesn't exist, creates a new one.
	 * @returns Absolute path to the created/updated file
	 */
	async createOrMergeGitLabCI(branch: string): Promise<string> {
		const filePath = path.join(this.gitRoot, '.gitlab-ci.yml');
		const exists = await FileUtils.fileIsReadable(filePath);

		if (!exists) {
			await FileUtils.writeFile(filePath, getGitLabCIFreshYaml(branch));
			return filePath;
		}

		// Merge into existing file preserving comments and formatting
		const content = await FileUtils.readFile(filePath);
		const doc = parseDocument(content);

		// If existing file isn't a valid YAML mapping, overwrite with fresh content
		if (!isMap(doc.contents)) {
			await FileUtils.writeFile(filePath, getGitLabCIFreshYaml(branch));
			return filePath;
		}

		const { includeEntry, job } = getGitLabCIConfig(branch);

		// Merge include entry
		this.mergeIncludeEntry(doc, includeEntry);

		// Add/update constellation-index job
		doc.set('constellation-index', job);

		await FileUtils.writeFile(filePath, doc.toString());
		return filePath;
	}

	/**
	 * Merge a Constellation include entry into the document's include array.
	 * If include doesn't exist, creates it. If it already has a Constellation entry, replaces it.
	 */
	private mergeIncludeEntry(
		doc: Document,
		includeEntry: { component: string; inputs: { access_key: string } },
	): void {
		const existingInclude = doc.get('include');

		if (!existingInclude) {
			// No include yet — create as array with our entry
			doc.set('include', [includeEntry]);
			return;
		}

		if (isSeq(existingInclude)) {
			// Remove any existing Constellation include entry
			const items = existingInclude.items.filter((item) => {
				if (isMap(item)) {
					const comp = item.get('component');
					return (
						typeof comp !== 'string' || !comp.includes('constellation-gitlab')
					);
				}
				return true;
			});
			existingInclude.items = items;
			// Add our entry
			existingInclude.items.push(doc.createNode(includeEntry));
			return;
		}

		// include is a single value (not array) — convert to array
		doc.set('include', [existingInclude, includeEntry]);
	}
}
