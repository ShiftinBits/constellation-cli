import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TsJsImportResolver } from '../../../../../src/languages/plugins/resolvers/ts-js-import-resolver';
import { TSConfckParseResult } from 'tsconfck';
import * as fs from 'node:fs/promises';

// Mock fs module
jest.mock('node:fs/promises');

/**
 * Test suite specifically for monorepo workspace package resolution.
 * Tests the scenario described in the bug report where @constellation/* packages
 * should resolve to project-relative paths.
 *
 * This integration test suite verifies that TsJsImportResolver correctly
 * uses WorkspacePackageResolver to resolve workspace packages BEFORE
 * treating them as external npm packages.
 */
describe('TsJsImportResolver - Workspace Packages', () => {
	let mockFs: jest.Mocked<typeof fs>;
	let originalCwd: typeof process.cwd;

	beforeEach(() => {
		jest.clearAllMocks();
		mockFs = fs as jest.Mocked<typeof fs>;

		// Default mocks
		// @ts-ignore
		(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));
		// @ts-ignore
		(mockFs.readFile as jest.Mock).mockResolvedValue('{}' as any);

		// Mock process.cwd() to return /project for all tests
		originalCwd = process.cwd;
		process.cwd = jest.fn(() => '/project') as any;
	});

	afterEach(() => {
		process.cwd = originalCwd;
	});

	it('should resolve @constellation/database to project-relative path with ./ prefix', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*/src']
					}
				}
			}
		} as TSConfckParseResult;

		// Mock file system to simulate libs/database/src/index.ts exists
		mockFs.stat.mockImplementation((filePath: any) => {
			if (filePath === '/project/libs/database/src/index.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/database');

		expect(result).toBe('./libs/database/src/index.ts');
	});

	it('should resolve @constellation/activity to project-relative path with ./ prefix', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*/src']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			if (filePath === '/project/libs/activity/src/index.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/activity');

		expect(result).toBe('./libs/activity/src/index.ts');
	});

	it('should resolve @constellation/shared to project-relative path with ./ prefix', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*/src']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			if (filePath === '/project/libs/shared/src/index.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/shared');

		expect(result).toBe('./libs/shared/src/index.ts');
	});

	it('should return original import if workspace package file does not exist', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*/src']
					}
				}
			}
		} as TSConfckParseResult;

		// File does not exist
		mockFs.stat.mockRejectedValue(new Error('not found'));

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/nonexistent');

		// Should return original when file doesn't exist
		expect(result).toBe('@constellation/nonexistent');
	});

	it('should handle workspace packages with exact directory paths (real constellation-core scenario)', async () => {
		// This matches the EXACT tsconfig from constellation-core
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/database': ['libs/database/src'],
						'@constellation/database/*': ['libs/database/src/*']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			// The directory index file exists
			if (filePath === '/project/libs/database/src/index.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/database');

		expect(result).toBe('./libs/database/src/index.ts');
	});

	it('should handle deep imports from workspace packages', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			if (filePath === '/project/libs/database/models/User.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/database/models/User');

		expect(result).toBe('./libs/database/models/User.ts');
	});

	it('should distinguish workspace packages from external scoped packages', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					baseUrl: '.',
					paths: {
						'@constellation/*': ['libs/*/src']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			// Only constellation workspace packages exist, specifically the index.ts file
			if (filePath === '/project/libs/database/src/index.ts') {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);

		// Workspace package should resolve
		const workspaceResult = await resolver.resolve('@constellation/database');
		expect(workspaceResult).toBe('./libs/database/src/index.ts');

		// External package should remain unchanged
		const externalResult = await resolver.resolve('@testing-library/react');
		expect(externalResult).toBe('@testing-library/react');
	});

	it('should resolve workspace packages defined in package.json workspaces', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {}
		} as TSConfckParseResult;

		// Mock package.json setup
		mockFs.readFile.mockImplementation((filePath: any) => {
			if (filePath === '/project/package.json') {
				return Promise.resolve(JSON.stringify({
					name: 'constellation-core',
					workspaces: ['libs/*', 'apps/*']
				})) as any;
			}
			if (filePath === '/project/libs/database/package.json') {
				return Promise.resolve(JSON.stringify({
					name: '@constellation/database',
					main: 'src/index.ts'
				})) as any;
			}
			return Promise.reject(new Error('not found'));
		});

		mockFs.readdir.mockImplementation((dirPath: any) => {
			if (dirPath === '/project/libs') {
				return Promise.resolve([
					{ name: 'database', isDirectory: () => true }
				] as any);
			}
			if (dirPath === '/project/apps') {
				return Promise.resolve([] as any);
			}
			return Promise.reject(new Error('not found'));
		});

		mockFs.stat.mockImplementation((filePath: any) => {
			const existingPaths = [
				'/project/package.json',
				'/project/libs',
				'/project/libs/database',
				'/project/libs/database/package.json',
				'/project/libs/database/src/index.ts',
				'/project/apps'
			];
			if (existingPaths.includes(filePath)) {
				return Promise.resolve({
					isFile: () => filePath.includes('.'),
					isDirectory: () => !filePath.includes('.')
				} as any);
			}
			return Promise.reject(new Error('not found'));
		});

		const resolver = new TsJsImportResolver('/project/apps/api/src/index.ts', tsconfig);
		const result = await resolver.resolve('@constellation/database');

		expect(result).toBe('./libs/database/src/index.ts');
	});

	it('should resolve workspace packages with sub-paths', async () => {
		const tsconfig: TSConfckParseResult = {
			tsconfigFile: '/project/tsconfig.json',
			tsconfig: {
				compilerOptions: {
					paths: {
						'@myorg/ui': ['libs/ui/src']
					}
				}
			}
		} as TSConfckParseResult;

		mockFs.stat.mockImplementation((filePath: any) => {
			const existingFiles = [
				'/project/libs/ui/src/index.ts',
				'/project/libs/ui/src/Button.tsx',
				'/project/libs/ui/src/components/Input.tsx'
			];
			if (existingFiles.includes(filePath)) {
				return Promise.resolve({ isFile: () => true } as any);
			}
			return Promise.reject(new Error('not found'));
		});

		mockFs.readFile.mockResolvedValue('{}' as any);

		const resolver = new TsJsImportResolver('/project/apps/web/src/index.ts', tsconfig);

		// Main package
		expect(await resolver.resolve('@myorg/ui')).toBe('./libs/ui/src/index.ts');

		// Sub-path (direct file)
		expect(await resolver.resolve('@myorg/ui/Button')).toBe('./libs/ui/src/Button.tsx');

		// Sub-path (nested)
		expect(await resolver.resolve('@myorg/ui/components/Input')).toBe('./libs/ui/src/components/Input.tsx');
	});
});
