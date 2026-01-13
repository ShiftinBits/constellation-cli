import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { FileUtils } from '../utils/file.utils';

// Abstract base class for environment variable managers
abstract class EnvironmentManager {
	abstract setVariable(key: string, value: string): Promise<void>;

	public getVariable(key: string): Promise<string | undefined> {
		return Promise.resolve(process.env[key]);
	}

	public isCIEnvironment(): boolean {
		return this.isCI();
	}

	// Check if running in CI/CD environment
	protected isCI(): boolean {
		return !!(
			process.env.CI ||
			process.env.GITHUB_ACTIONS ||
			process.env.GITLAB_CI ||
			process.env.JENKINS_URL ||
			process.env.CIRCLECI ||
			process.env.TRAVIS ||
			process.env.BUILDKITE ||
			process.env.DRONE ||
			process.env.TF_BUILD || // Azure Pipelines
			process.env.BITBUCKET_BUILD_NUMBER || // Bitbucket Pipelines
			process.env.TEAMCITY_VERSION || // TeamCity
			process.env.CODEBUILD_BUILD_ID // AWS CodeBuild
		);
	}

	// Template method pattern for validation
	protected validateInput(key: string, value: string): void {
		if (!key || typeof key !== 'string') {
			throw new Error('Invalid key provided');
		}
		if (value === undefined || value === null) {
			throw new Error('Invalid value provided');
		}

		// Validate key format (alphanumeric + underscore only)
		if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
			throw new Error(
				'Environment variable name must contain only letters, numbers, and underscores',
			);
		}

		// Reject values with null bytes (prevents many attacks)
		if (value.includes('\0')) {
			throw new Error('Value contains invalid characters');
		}

		// Reject values with newlines (prevents command injection via line breaks)
		if (value.includes('\n') || value.includes('\r')) {
			throw new Error('Value cannot contain newline characters');
		}
	}

	// Shell escape helper for Unix-like systems
	protected escapeShellValue(value: string): string {
		// Escape special characters that could be interpreted by the shell
		return value.replace(/[\\'\"$`]/g, '\\$&');
	}
}

// Windows implementation
class WindowsEnvironmentManager extends EnvironmentManager {
	/**
	 * Retrieves an environment variable from the Windows user registry.
	 * NOTE: This method has a side effect - it syncs the retrieved value to process.env
	 * to ensure consistency between registry and runtime environment.
	 * @param key The environment variable name
	 * @returns The value if found, undefined otherwise
	 */
	override async getVariable(key: string): Promise<string | undefined> {
		try {
			// Query user environment variables only
			const userResult = await this.queryRegistry('HKCU\\Environment', key);

			if (userResult) {
				process.env[key] = userResult;
				return userResult;
			}

			// Variable not found, remove from process.env if it exists
			delete process.env[key];
			return undefined;
		} catch {
			return undefined;
		}
	}

	async setVariable(key: string, value: string): Promise<void> {
		this.validateInput(key, value);

		// Reject CI environments - access key must be configured manually in pipelines
		if (this.isCI()) {
			throw new Error(
				'Cannot set environment variables in CI/CD environments.\n' +
					'  Configure CONSTELLATION_ACCESS_KEY directly in your pipeline settings.',
			);
		}

		try {
			// Use spawn to avoid shell interpretation - prevents command injection
			// No /M flag = user level (HKCU) instead of system level (HKLM)
			await new Promise<void>((resolve, reject) => {
				const proc = spawn('setx', [key, value], {
					shell: false, // Critical: no shell interpretation
					windowsHide: true,
				});

				let stderr = '';
				proc.stderr?.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`setx failed with code ${code}: ${stderr}`));
					}
				});

				proc.on('error', (err) => {
					reject(err);
				});
			});

			// Also set in Node.js process for immediate use
			process.env[key] = value;
		} catch (error) {
			throw new Error(`Failed to set environment variable ${key}: ${error}`);
		}
	}

	private async queryRegistry(
		registryPath: string,
		key: string,
	): Promise<string | undefined> {
		try {
			// Use spawn for safer execution
			const stdout = await new Promise<string>((resolve, reject) => {
				const proc = spawn('reg', ['query', registryPath, '/v', key], {
					shell: false,
					windowsHide: true,
				});

				let output = '';
				let stderr = '';

				proc.stdout?.on('data', (data) => {
					output += data.toString();
				});

				proc.stderr?.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (code) => {
					if (code === 0) {
						resolve(output);
					} else {
						reject(new Error(`reg query failed: ${stderr}`));
					}
				});

				proc.on('error', (err) => {
					reject(err);
				});
			});

			// Parse the output - handles REG_SZ and REG_EXPAND_SZ
			const match = stdout.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+?)(?:\r?\n|$)/);
			return match ? match[1].trim() : undefined;
		} catch {
			// Key doesn't exist
			return undefined;
		}
	}
}

// Unix-like implementation (macOS/Linux)
class UnixEnvironmentManager extends EnvironmentManager {
	// User config files to write to (multiple for cross-shell compatibility)
	private readonly userConfigFiles: string[];

	constructor() {
		super();
		// Write to both zsh and bash user config files for broad shell compatibility
		this.userConfigFiles = [
			path.join(os.homedir(), '.zshrc'),
			path.join(os.homedir(), '.bashrc'),
		];
	}

	async setVariable(key: string, value: string): Promise<void> {
		this.validateInput(key, value);

		// Reject CI environments - access key must be configured manually in pipelines
		if (this.isCI()) {
			throw new Error(
				'Cannot set environment variables in CI/CD environments.\n' +
					'  Configure CONSTELLATION_ACCESS_KEY directly in your pipeline settings.',
			);
		}

		// Properly escape the value for shell safety
		const escapedValue = this.escapeShellValue(value);
		const exportLine = `export ${key}="${escapedValue}"`;

		try {
			// Write to all configured user config files for cross-shell compatibility
			for (const configFile of this.userConfigFiles) {
				await this.writeToConfigFile(configFile, key, exportLine);
			}

			// Also set for current process
			process.env[key] = value;
		} catch (error) {
			throw new Error(`Failed to set environment variable ${key}: ${error}`);
		}
	}

	/**
	 * Writes an export line to a shell configuration file.
	 * Updates existing variable if present, otherwise appends.
	 */
	private async writeToConfigFile(
		configFile: string,
		key: string,
		exportLine: string,
	): Promise<void> {
		let content = '';
		try {
			content = await FileUtils.readFile(configFile, 'utf-8');
		} catch {
			// File doesn't exist - will be created
		}

		// Check if variable already exists and update it
		// Use escaped key in regex to prevent regex injection
		const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`^export ${escapedKey}=.*$`, 'gm');
		if (regex.test(content)) {
			content = content.replace(regex, exportLine);
		} else {
			// Append new export
			content = content.trimEnd() + '\n' + exportLine + '\n';
		}

		await FileUtils.writeFile(configFile, content);
	}
}

// Factory pattern for creating the appropriate manager
class EnvironmentManagerFactory {
	static create(): EnvironmentManager {
		const platform = os.platform();

		switch (platform) {
			case 'win32':
				return new WindowsEnvironmentManager();
			case 'darwin':
			case 'linux':
				return new UnixEnvironmentManager();
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}
	}
}

// Facade for simplified usage
export class CrossPlatformEnvironment {
	private manager: EnvironmentManager;

	constructor() {
		this.manager = EnvironmentManagerFactory.create();
	}

	async setKey(key: string, value: string): Promise<void> {
		await this.manager.setVariable(key.toUpperCase(), value);
	}

	async getKey(key: string): Promise<string | undefined> {
		return this.manager.getVariable(key.toUpperCase());
	}

	/**
	 * Check if running in a CI/CD environment.
	 */
	isCI(): boolean {
		return this.manager.isCIEnvironment();
	}
}
