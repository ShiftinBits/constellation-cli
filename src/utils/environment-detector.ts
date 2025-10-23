/**
 * Environment Detection Module
 * 
 * Detects execution environment characteristics to determine whether
 * ASCII banners and other interactive terminal features should be displayed.
 * 
 * Key capabilities:
 * - CI/CD environment detection across major platforms
 * - TTY (interactive terminal) detection
 * - Combined decision logic for banner display
 * - Diagnostic environment information
 */

/**
 * Environment variables that indicate CI/CD execution context.
 * These are standard variables set by major CI/CD platforms.
 */
const CI_ENVIRONMENT_VARIABLES = [
	'CI',              // Generic CI indicator (most platforms)
	'GITHUB_ACTIONS',  // GitHub Actions
	'GITLAB_CI',       // GitLab CI/CD
	'JENKINS_URL',     // Jenkins
	'CIRCLECI',        // CircleCI
	'TRAVIS',          // Travis CI
	'BUILDKITE',       // Buildkite
	'DRONE',           // Drone CI
] as const;

/**
 * Detects if the current process is running in a CI/CD environment.
 * 
 * Checks for presence of common CI/CD environment variables across
 * major platforms including GitHub Actions, GitLab CI, Jenkins,
 * CircleCI, Travis CI, Buildkite, and Drone.
 * 
 * @returns {boolean} true if any CI environment variable is detected, false otherwise
 * 
 * @example
 * ```typescript
 * if (isCI()) {
 *   console.log('Running in CI environment');
 * }
 * ```
 */
export function isCI(): boolean {
	return CI_ENVIRONMENT_VARIABLES.some((envVar) => !!process.env[envVar]);
}

/**
 * Detects if standard output is attached to an interactive terminal (TTY).
 * 
 * TTY detection indicates whether the process is running in an interactive
 * terminal session (where users can see output) vs. a non-interactive context
 * like piped output or background processes.
 * 
 * @returns {boolean} true if stdout is a TTY, false otherwise
 * 
 * @example
 * ```typescript
 * if (isTTY()) {
 *   console.log('Running in interactive terminal');
 * }
 * ```
 */
export function isTTY(): boolean {
	return !!process.stdout.isTTY;
}

/**
 * Determines whether ASCII banners should be displayed.
 * 
 * Returns true only when ALL of the following conditions are met:
 * - NOT running in a CI/CD environment (interactive usage expected)
 * - Standard output IS attached to a TTY (user can see output)
 * 
 * This ensures banners are only shown in interactive developer sessions,
 * not in CI logs or piped output where they would add noise.
 * 
 * @returns {boolean} true if banners should be displayed, false otherwise
 * 
 * @example
 * ```typescript
 * if (shouldShowBanner()) {
 *   printBanner();
 * }
 * ```
 */
export function shouldShowBanner(): boolean {
	return !isCI() && isTTY();
}

/**
 * Diagnostic information about the current execution environment.
 * 
 * Provides comprehensive details about environment detection for
 * debugging and troubleshooting purposes.
 */
export interface EnvironmentInfo {
	/** Whether CI/CD environment was detected */
	isCI: boolean;
	/** Whether stdout is attached to a TTY */
	isTTY: boolean;
	/** Whether ASCII banners should be displayed */
	shouldShowBanner: boolean;
	/** Name of detected CI platform, if any */
	detectedCI?: string;
}

/**
 * Returns comprehensive environment detection information.
 * 
 * Useful for debugging environment-specific behavior or troubleshooting
 * why banners may or may not be displayed. Identifies which specific
 * CI platform was detected, if applicable.
 * 
 * @returns {EnvironmentInfo} Complete environment detection state
 * 
 * @example
 * ```typescript
 * const info = getEnvironmentInfo();
 * console.log(`CI: ${info.isCI}, TTY: ${info.isTTY}`);
 * if (info.detectedCI) {
 *   console.log(`Detected platform: ${info.detectedCI}`);
 * }
 * ```
 */
export function getEnvironmentInfo(): EnvironmentInfo {
	const ciDetected = isCI();
	const ttyDetected = isTTY();
	
	// Identify which CI platform was detected
	let detectedPlatform: string | undefined;
	if (ciDetected) {
		detectedPlatform = CI_ENVIRONMENT_VARIABLES.find((envVar) => !!process.env[envVar]);
	}
	
	return {
		isCI: ciDetected,
		isTTY: ttyDetected,
		shouldShowBanner: !ciDetected && ttyDetected,
		detectedCI: detectedPlatform,
	};
}
