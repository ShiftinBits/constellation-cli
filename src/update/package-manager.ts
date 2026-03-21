import { spawn } from 'node:child_process';

export type PackageManagerType = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Detects the package manager used to install this CLI and executes updates.
 *
 * Detection uses npm_config_user_agent environment variable which is set
 * by npm, yarn, pnpm, and bun when running package scripts.
 */
export class PackageManager {
	private detectedManager: PackageManagerType | null = null;

	/**
	 * Detects which package manager installed/is running this CLI.
	 *
	 * Priority:
	 * 1. npm_config_user_agent (most reliable, set by all major package managers)
	 * 2. Fallback to npm (safe default)
	 *
	 * @returns The detected package manager type
	 */
	detect(): PackageManagerType {
		if (this.detectedManager) return this.detectedManager;

		const userAgent = process.env.npm_config_user_agent;

		if (userAgent) {
			// Examples:
			// "npm/10.2.4 node/v20.11.0 darwin x64 workspaces/false"
			// "yarn/4.0.2 npm/? node/v20.11.0 darwin x64"
			// "pnpm/8.14.1 npm/? node/v20.11.0 darwin x64"
			// "bun/1.0.0"
			if (userAgent.startsWith('yarn')) {
				this.detectedManager = 'yarn';
			} else if (userAgent.startsWith('pnpm')) {
				this.detectedManager = 'pnpm';
			} else if (userAgent.startsWith('bun')) {
				this.detectedManager = 'bun';
			} else {
				this.detectedManager = 'npm';
			}
		} else {
			// Fallback when run directly (not via package manager)
			this.detectedManager = 'npm';
		}

		return this.detectedManager;
	}

	/**
	 * Returns the command and arguments to update the package globally.
	 *
	 * @param packageName - The npm package name to update
	 * @returns Tuple of [command, ...args]
	 */
	getUpdateCommand(packageName: string): [string, ...string[]] {
		const manager = this.detect();

		switch (manager) {
			case 'yarn':
				return ['yarn', 'global', 'add', `${packageName}@latest`];
			case 'pnpm':
				return ['pnpm', 'add', '-g', `${packageName}@latest`];
			case 'bun':
				return ['bun', 'add', '-g', `${packageName}@latest`];
			case 'npm':
			default:
				return ['npm', 'install', '-g', `${packageName}@latest`];
		}
	}

	/**
	 * Returns human-readable command string for display purposes.
	 */
	getUpdateCommandString(packageName: string): string {
		return this.getUpdateCommand(packageName).join(' ');
	}

	/**
	 * Executes the update command, streaming output to the terminal.
	 *
	 * @param packageName - The npm package name to update
	 * @returns Promise resolving to true if update succeeded, false otherwise
	 */
	async executeUpdate(packageName: string): Promise<boolean> {
		const [cmd, ...args] = this.getUpdateCommand(packageName);

		return new Promise((resolve) => {
			const proc = spawn(cmd, args, {
				stdio: 'inherit', // Show output directly to user
				shell: process.platform === 'win32', // Shell required on Windows for PATH resolution
			});

			proc.on('close', (code) => {
				resolve(code === 0);
			});

			proc.on('error', () => {
				// Spawn failed (command not found, permissions, etc.)
				resolve(false);
			});
		});
	}
}
