import { exec } from 'child_process';
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

    // Template method pattern for validation
    protected validateInput(key: string, value: string): void {
        if (!key || typeof key !== 'string') {
            throw new Error('Invalid key provided');
        }
        if (value === undefined || value === null) {
            throw new Error('Invalid value provided');
        }
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

				const commands: string[] = [
						// Set persistent (User scope)
						`setx ${key} "${value}"`,
						// Set for current process
						`set ${key}=${value}`
				];

				try {
						for (const cmd of commands) {
							await execAsync(cmd);
						}
						process.env[key] = value; // Also set in Node.js process
        } catch (error) {
            throw new Error(`Failed to set environment variable ${key}: ${error}`);
        }
    }

		private async queryRegistry(path: string, key: string): Promise<string | undefined> {
        try {
            const { stdout } = await execAsync(
                `reg query "${path}" /v ${key}`,
                { windowsHide: true }
            );

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

        const exportLine = `export ${key}="${value}"`;

        try {
            // Read existing content
            let content = '';
            try {
                content = await FileUtils.readFile(this.shellConfigFile, 'utf-8');
            } catch {
                // File doesn't exist, we'll create it
            }

            // Check if variable already exists and update it
            const regex = new RegExp(`^export ${key}=.*$`, 'gm');
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
