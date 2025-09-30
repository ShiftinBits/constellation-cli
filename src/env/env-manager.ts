import { exec, spawn } from 'child_process';
import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { FileUtils } from '../utils/file.utils';

const execAsync = promisify(exec);

// Abstract base class for environment variable managers
abstract class EnvironmentManager {
    abstract setVariable(key: string, value: string): Promise<void>;
    public getVariable(key: string): Promise<string | undefined> {
			return Promise.resolve(process.env[key]);
		};

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
            process.env.DRONE
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
            throw new Error('Environment variable name must contain only letters, numbers, and underscores');
        }

        // Reject values with null bytes (prevents many attacks)
        if (value.includes('\0')) {
            throw new Error('Value contains invalid characters');
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

		override async getVariable(key: string): Promise<string | undefined> {
        try {
            // Query user environment variables
            const userResult = await this.queryRegistry(
                'HKCU\\Environment',
                key
            );

            if (userResult) {
                process.env[key] = userResult;
                return userResult;
            }

            // Query system environment variables
            const systemResult = await this.queryRegistry(
                'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
                key
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

        // In CI environments, only set in current process
        if (this.isCI()) {
            process.env[key] = value;
            return;
        }

        try {
            // Use spawn to avoid shell interpretation - prevents command injection
            await new Promise<void>((resolve, reject) => {
                const proc = spawn('setx', [key, value], {
                    shell: false,  // Critical: no shell interpretation
                    windowsHide: true
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

		private async queryRegistry(path: string, key: string): Promise<string | undefined> {
        try {
            // Use spawn for safer execution
            const stdout = await new Promise<string>((resolve, reject) => {
                const proc = spawn('reg', ['query', path, '/v', key], {
                    shell: false,
                    windowsHide: true
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
    private shellConfigFile: string;

    constructor() {
        super();
        this.shellConfigFile = this.detectShellConfigFile();
    }

    private detectShellConfigFile(): string {
        const home = os.homedir();
        const shell = process.env.SHELL || '';

        // Detect the appropriate config file based on shell
        if (shell.includes('zsh')) {
            return path.join(home, '.zshrc');
        } else if (shell.includes('bash')) {
            // Check for .bashrc first, fall back to .bash_profile
            const bashrc = path.join(home, '.bashrc');
            const bashProfile = path.join(home, '.bash_profile');
            return fs.existsSync(bashrc) ? bashrc : bashProfile;
        } else {
            // Default to .profile
            return path.join(home, '.profile');
        }
    }

    async setVariable(key: string, value: string): Promise<void> {
        this.validateInput(key, value);

        // In CI environments, only set in current process
        if (this.isCI()) {
            process.env[key] = value;
            return;
        }

        // Properly escape the value for shell safety
        const escapedValue = this.escapeShellValue(value);
        const exportLine = `export ${key}="${escapedValue}"`;

        try {
            // Read existing content
            let content = '';
            try {
                content = await FileUtils.readFile(this.shellConfigFile, 'utf-8');
            } catch {
                // File doesn't exist, we'll create it
            }

            // Check if variable already exists and update it
            // Use escaped key in regex to prevent regex injection
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`^export ${escapedKey}=.*$`, 'gm');
            if (regex.test(content)) {
                content = content.replace(regex, exportLine);
            } else {
                // Append new export
                content += `\n${exportLine}\n`;
            }

            await FileUtils.writeFile(this.shellConfigFile, content);

            // Also set for current process
            process.env[key] = value;
        } catch (error) {
            throw new Error(`Failed to set environment variable ${key}: ${error}`);
        }
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
        // Add a prefix to identify app-specific credentials
        await this.manager.setVariable(key.toUpperCase(), value);
    }

    async getKey(key: string): Promise<string | undefined> {
        return this.manager.getVariable(key.toUpperCase());
    }
}