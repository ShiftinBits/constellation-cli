import { ConstellationConfig } from "../config/config";
import { CrossPlatformEnvironment } from "../env/env-manager";
import { LanguageRegistry } from "../languages/language.registry";
import { GitClient } from "../utils/git-client";
import { CommandDeps } from "./command.deps";

/**
 * Abstract base class for all CLI commands.
 * Provides common dependencies and initialization for command implementations.
 */
export abstract class BaseCommand {

	/** Git client for repository operations */
	protected readonly git?: GitClient;
	/** Configuration settings, null if not initialized */
	protected readonly config?: ConstellationConfig;
	/** Language registry for parsing support, null if not available */
	protected readonly langRegistry?: LanguageRegistry;
	/** Cross-platform environment variable access interface */
	protected readonly env?: CrossPlatformEnvironment;

	/**
	 * Creates a new command instance with injected dependencies.
	 * @param dependencies Injected command dependencies
	 */
	constructor(
		dependencies: CommandDeps
	) {
		this.git = dependencies.GitClient;
		this.config = dependencies.Config;
		this.langRegistry = dependencies.LanguageRegistry;
		this.env = dependencies.Environment;
	}
}
