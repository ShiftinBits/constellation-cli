/**
 * CLI entry point — runs the Node.js version check before loading
 * the application. This must be a separate file because ESM imports
 * are hoisted: if the check lived in index.ts, transitive dependencies
 * (e.g., undici) would crash on older Node versions before the check
 * could execute.
 *
 * Only imports Node built-ins and check-node-version.ts (zero external deps).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkNodeVersion } from './utils/check-node-version';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
	engines?: { node?: string };
};

// Commands that should bypass the version check
const SKIP_COMMANDS = ['help', '--help', '-h', '--version', '-V', '-v'];
const cmd = process.argv[2];

if (!SKIP_COMMANDS.includes(cmd) && packageJson.engines?.node) {
	const result = checkNodeVersion(packageJson.engines.node);
	if (!result.compatible) {
		console.error(
			`\u2717 Constellation CLI requires Node.js ${result.required} (current: ${result.current})`,
		);
		console.error(
			'  Please upgrade to the latest LTS version: https://nodejs.org',
		);
		process.exit(1);
	}
}

// Version is compatible — load the full application
await import('./index.js');
