import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImportResolver } from '../base-plugin';
import { PYTHON_STDLIB_MODULES } from '../../../utils/import-handlers/python';

/**
 * CLI-side Python import resolver.
 * Resolves Python import specifiers to project-relative file paths.
 */
export class PythonImportResolver implements ImportResolver {
	private readonly sourceDir: string;
	private readonly projectRoot: string;

	constructor(sourceFilePath: string, projectRoot: string) {
		this.sourceDir = path.dirname(sourceFilePath);
		this.projectRoot = projectRoot;
	}

	async resolve(specifier: string): Promise<string> {
		// Stdlib — return as-is
		const topLevel = specifier.split('.')[0];
		if (PYTHON_STDLIB_MODULES.has(topLevel)) return specifier;

		// Relative imports (leading dots)
		if (specifier.startsWith('.')) {
			return this.resolveRelative(specifier);
		}

		// Absolute dotted imports — try to resolve locally
		const modulePath = specifier.replace(/\./g, '/');
		const resolved = await this.tryResolveFile(
			path.resolve(this.projectRoot, modulePath),
		);
		if (resolved) {
			return path.relative(this.projectRoot, resolved).replace(/\\/g, '/');
		}

		// Not found locally — external package
		return specifier;
	}

	private async resolveRelative(specifier: string): Promise<string> {
		let dotCount = 0;
		while (dotCount < specifier.length && specifier[dotCount] === '.') {
			dotCount++;
		}
		const modulePart = specifier.slice(dotCount);
		const upDirs = dotCount <= 1 ? '' : '../'.repeat(dotCount - 1);
		const relativePath = modulePart
			? upDirs + modulePart.replace(/\./g, '/')
			: upDirs.slice(0, -1) || '.';

		const absoluteBase = path.resolve(this.sourceDir, relativePath);
		const resolved = await this.tryResolveFile(absoluteBase);
		if (resolved) {
			return path.relative(this.projectRoot, resolved).replace(/\\/g, '/');
		}
		return specifier;
	}

	private async tryResolveFile(basePath: string): Promise<string | null> {
		const variations = [
			`${basePath}.py`,
			`${basePath}.pyi`,
			path.join(basePath, '__init__.py'),
			path.join(basePath, '__init__.pyi'),
		];
		for (const v of variations) {
			try {
				await fs.promises.access(v, fs.constants.F_OK);
				return v;
			} catch {
				continue;
			}
		}
		return null;
	}
}
