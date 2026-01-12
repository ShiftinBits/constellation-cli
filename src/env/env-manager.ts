import { spawn } from 'child_process';
import * as os from 'os';
import { FileUtils } from '../utils/file.utils';

// Abstract base class for environment variable managers
abstract class EnvironmentManager {
	abstract setVariable(key: string, value: string): Promise<void>;
	abstract hasPrivileges(): Promise<boolean>;

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
	 * Check if the current process is running with administrator privileges.
	 */
	private async isAdmin(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const proc = spawn('net', ['session'], {
				shell: false,
				windowsHide: true,
			});
			proc.on('close', (code) => resolve(code === 0));
			proc.on('error', () => resolve(false));
		});
	}

	async hasPrivileges(): Promise<boolean> {
		return this.isAdmin();
	}

	/**
	 * Retrieves an environment variable from the Windows registry.
	 * NOTE: This method has a side effect - it syncs the retrieved value to process.env
	 * to ensure consistency between registry and runtime environment.
	 * @param key The environment variable name
	 * @returns The value if found, undefined otherwise
	 */
	override async getVariable(key: string): Promise<string | undefined> {
		try {
			// Query user environment variables
			const userResult = await this.queryRegistry('HKCU\\Environment', key);

			if (userResult) {
				process.env[key] = userResult;
				return userResult;
			}

			// Query system environment variables
			const systemResult = await this.queryRegistry(
				'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
				key,
			);

			if (systemResult) {
				process.env[key] = systemResult;
				return systemResult;
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

		// Check for administrator privileges before system-level write
		if (!(await this.isAdmin())) {
			throw new Error(
				'Administrator privileges required to set system environment variables.',
			);
		}

		try {
			// Use spawn to avoid shell interpretation - prevents command injection
			// /M flag sets variable at system level (HKLM) instead of user level (HKCU)
			await new Promise<void>((resolve, reject) => {
				const proc = spawn('setx', [key, value, '/M'], {
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
		path: string,
		key: string,
	): Promise<string | undefined> {
		try {
			// Use spawn for safer execution
			const stdout = await new Promise<string>((resolve, reject) => {
				const proc = spawn('reg', ['query', path, '/v', key], {
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
	// System config files to write to (may be multiple for cross-shell compatibility)
	private readonly systemConfigFiles: string[];

	constructor() {
		super();
		if (os.platform() === 'darwin') {
			// macOS: Write to both zshenv (zsh default) and profile (bash/other shells)
			this.systemConfigFiles = ['/etc/zshenv', '/etc/profile'];
		} else {
			// Linux: Use profile.d directory (sourced by all POSIX shells at login)
			this.systemConfigFiles = ['/etc/profile.d/constellation.sh'];
		}
	}

	/**
	 * Check if the current process is running as root.
	 */
	private isRoot(): boolean {
		return process.getuid?.() === 0;
	}

	async hasPrivileges(): Promise<boolean> {
		return Promise.resolve(this.isRoot());
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

		// Check for root privileges before system-level write
		if (!this.isRoot()) {
			throw new Error(
				'Root privileges required to set system environment variables.',
			);
		}

		// Properly escape the value for shell safety
		const escapedValue = this.escapeShellValue(value);
		const exportLine = `export ${key}="${escapedValue}"`;

		try {
			// Write to all configured system config files for cross-shell compatibility
			for (const configFile of this.systemConfigFiles) {
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
			// File doesn't exist - create with header for Linux profile.d
			if (configFile.includes('profile.d')) {
				content = '#!/bin/sh\n# Constellation CLI environment variables\n';
			}
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
	 * Check if the current process has the required privileges to set system environment variables.
	 */
	async hasPrivileges(): Promise<boolean> {
		return this.manager.hasPrivileges();
	}

	/**
	 * Check if running in a CI/CD environment.
	 */
	isCI(): boolean {
		return this.manager.isCIEnvironment();
	}
}
