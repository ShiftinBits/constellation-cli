import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const DEFAULT_CONSTELLATION_DIR = path.join(os.homedir(), '.constellation');
const UPDATE_STATE_FILENAME = 'update-state.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Persisted state for update checking.
 */
export interface UpdateState {
	/** Unix timestamp of last NPM registry check */
	lastCheckTimestamp: number;
	/** Version the user declined to update to */
	lastDeclinedVersion?: string;
	/** Unix timestamp when user declined */
	lastDeclinedTimestamp?: number;
}

/**
 * Manages update check state persistence and rate limiting.
 *
 * Stores state in ~/.constellation/update-state.json to:
 * - Rate-limit NPM registry checks to once per 24 hours
 * - Remember which version the user declined (don't re-prompt for same version)
 */
export class UpdateCache {
	private state: UpdateState | null = null;
	private readonly stateDir: string;
	private readonly stateFile: string;

	/**
	 * Creates an UpdateCache instance.
	 * @param stateDir - Optional directory for state storage (defaults to ~/.constellation)
	 */
	constructor(stateDir?: string) {
		this.stateDir = stateDir ?? DEFAULT_CONSTELLATION_DIR;
		this.stateFile = path.join(this.stateDir, UPDATE_STATE_FILENAME);
	}

	/**
	 * Loads state from disk, returning defaults if file doesn't exist or is corrupted.
	 */
	async load(): Promise<UpdateState> {
		if (this.state) return this.state;

		try {
			const content = await fs.readFile(this.stateFile, 'utf-8');
			this.state = JSON.parse(content) as UpdateState;
			return this.state;
		} catch {
			// File doesn't exist or is corrupted - return defaults
			return { lastCheckTimestamp: 0 };
		}
	}

	/**
	 * Persists state to disk, creating directory if needed.
	 */
	async save(state: UpdateState): Promise<void> {
		try {
			await fs.mkdir(this.stateDir, { recursive: true });
			await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
			this.state = state;
		} catch {
			// Silent fail - don't block user's command for cache issues
		}
	}

	/**
	 * Returns true if enough time has passed since last check.
	 * Default interval is 24 hours.
	 */
	async shouldCheck(): Promise<boolean> {
		const state = await this.load();
		const now = Date.now();
		return now - state.lastCheckTimestamp > CHECK_INTERVAL_MS;
	}

	/**
	 * Records that a check was performed.
	 */
	async recordCheck(): Promise<void> {
		const state = await this.load();
		state.lastCheckTimestamp = Date.now();
		await this.save(state);
	}

	/**
	 * Records that the user declined to update to a specific version.
	 * We won't prompt again for this version.
	 */
	async recordDecline(version: string): Promise<void> {
		const state = await this.load();
		state.lastDeclinedVersion = version;
		state.lastDeclinedTimestamp = Date.now();
		await this.save(state);
	}

	/**
	 * Returns true if the user has already declined this specific version.
	 */
	async wasVersionDeclined(version: string): Promise<boolean> {
		const state = await this.load();
		return state.lastDeclinedVersion === version;
	}

	/**
	 * Clears all cached state. Useful for testing or forcing a fresh check.
	 */
	async clear(): Promise<void> {
		try {
			await fs.unlink(this.stateFile);
			this.state = null;
		} catch {
			// File may not exist, that's fine
		}
	}
}
