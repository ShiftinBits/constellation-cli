import { ConstellationConfig } from '../config/config';
import { CrossPlatformEnvironment } from '../env/env-manager';
import { LanguageDetector } from '../languages/language.detector';
import { LanguageRegistry } from '../languages/language.registry';
import { GitClient } from '../utils/git-client';

/**
 * Dependencies injected into command constructors.
 * Provides all necessary services for command execution.
 */
export interface CommandDeps {
	/** Configuration settings, null if not initialized */
	Config?: ConstellationConfig;
	/** Git client for repository operations */
	GitClient?: GitClient;
	/** Language registry for parsing support, null if not available */
	LanguageRegistry?: LanguageRegistry;
	/** Language detector for file type identification, null if not available */
	LanguageDetector?: LanguageDetector;
	/** Cross-platform compatible environment variable interface */
	Environment?: CrossPlatformEnvironment;
}
