/**
 * Node.js version compatibility check.
 *
 * Pure function that compares the current Node.js version against
 * a semver requirement string from package.json engines.node.
 */

export interface NodeVersionCheck {
	/** Whether the current Node version meets the requirement */
	compatible: boolean;
	/** Current Node.js version (e.g., "v24.1.0") */
	current: string;
	/** Required minimum version (e.g., ">=24.0.0") */
	required: string;
}

/**
 * Checks whether the current Node.js version satisfies the engines.node requirement.
 *
 * @param enginesNode - The engines.node string from package.json (e.g., ">=24.0.0")
 * @param currentVersion - Override for testing (defaults to process.version)
 * @returns Version check result with compatibility status
 */
export function checkNodeVersion(
	enginesNode: string,
	currentVersion: string = process.version,
): NodeVersionCheck {
	const requiredVersion = enginesNode.replace(/^>=\s*/, '');
	const current = currentVersion.replace(/^v/, '');

	const requiredParts = requiredVersion.split('.').map(Number);
	const currentParts = current.split('.').map(Number);

	let compatible = true;
	for (let i = 0; i < 3; i++) {
		const req = requiredParts[i] || 0;
		const cur = currentParts[i] || 0;
		if (cur > req) break;
		if (cur < req) {
			compatible = false;
			break;
		}
	}

	return {
		compatible,
		current: currentVersion,
		required: enginesNode,
	};
}
