import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WorkspacePackageResolver } from '../../../../../src/languages/plugins/resolvers/workspace-package-resolver';
import { TSConfckParseResult } from 'tsconfck';
import * as fs from 'node:fs/promises';

// Mock fs module
jest.mock('node:fs/promises');

/**
 * Test suite for WorkspacePackageResolver.
 * Tests workspace package detection and resolution from multiple sources:
 * - tsconfig.json paths (exact matches without wildcards)
 * - package.json workspaces + individual package names
 */
describe('WorkspacePackageResolver', () => {
	let mockFs: jest.Mocked<typeof fs>;
	let originalCwd: typeof process.cwd;

	beforeEach(() => {
		jest.clearAllMocks();
		mockFs = fs as jest.Mocked<typeof fs>;

		// Default mocks
		// @ts-ignore
		(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

		// Mock process.cwd() to return /project for all tests
		originalCwd = process.cwd;
		process.cwd = jest.fn(() => '/project') as any;
	});

	afterEach(() => {
		process.cwd = originalCwd;
	});

	describe('tsconfig.json paths source', () => {
		it('should load workspace packages from tsconfig.json paths (exact matches only)', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/database': ['libs/database/src'],
							'@myorg/shared': ['libs/shared/src'],
							'@myorg/utils/*': ['libs/utils/*'] // Should be ignored (wildcard)
						}
					}
				}
			} as TSConfckParseResult;

			// Mock file system
			mockFs.stat.mockImplementation((filePath: any) => {
				const existingFiles = [
					'/project/libs/database/src/index.ts',
					'/project/libs/shared/src/index.ts'
				];
				if (existingFiles.includes(filePath)) {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Direct package import
			expect(await resolver.resolve('@myorg/database')).toBe('./libs/database/src/index.ts');
			expect(await resolver.resolve('@myorg/shared')).toBe('./libs/shared/src/index.ts');

			// Wildcard pattern should not be treated as workspace package
			expect(await resolver.resolve('@myorg/utils')).toBeNull();
		});

		it('should handle sub-path imports from workspace packages', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/database': ['libs/database/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingFiles = [
					'/project/libs/database/src/index.ts',
					'/project/libs/database/src/entities.ts'
				];
				if (existingFiles.includes(filePath)) {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Main package
			expect(await resolver.resolve('@myorg/database')).toBe('./libs/database/src/index.ts');

			// Sub-path
			expect(await resolver.resolve('@myorg/database/entities')).toBe('./libs/database/src/entities.ts');
		});

		it('should try multiple extensions for sub-paths', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/utils': ['libs/utils/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				// Only .jsx file exists
				if (filePath === '/project/libs/utils/src/index.ts' || filePath === '/project/libs/utils/src/helpers.jsx') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Should find .jsx extension
			expect(await resolver.resolve('@myorg/utils/helpers')).toBe('./libs/utils/src/helpers.jsx');
		});

		it('should resolve sub-path to index files in directories', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/components': ['libs/components/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingFiles = [
					'/project/libs/components/src/index.ts',
					'/project/libs/components/src/Button/index.ts'
				];
				if (existingFiles.includes(filePath)) {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Should resolve to index.ts inside Button directory
			expect(await resolver.resolve('@myorg/components/Button')).toBe('./libs/components/src/Button/index.ts');
		});

		it('should handle tsconfig in subdirectory', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/packages/app/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@app/utils': ['src/utils']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/packages/app/src/utils/index.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Should resolve relative to tsconfig location
			expect(await resolver.resolve('@app/utils')).toBe('./packages/app/src/utils/index.ts');
		});
	});

	describe('package.json workspaces source', () => {
		it('should load workspace packages from package.json workspaces', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock root package.json
			mockFs.readFile.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve(JSON.stringify({
						name: 'monorepo-root',
						workspaces: ['packages/*', 'libs/*']
					})) as any;
				}
				if (filePath === '/project/packages/web/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/web',
						main: 'src/index.ts'
					})) as any;
				}
				if (filePath === '/project/libs/database/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/database',
						main: 'src/index.ts'
					})) as any;
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readdir.mockImplementation((dirPath: any) => {
				if (dirPath === '/project/packages') {
					return Promise.resolve([
						{ name: 'web', isDirectory: () => true }
					] as any);
				}
				if (dirPath === '/project/libs') {
					return Promise.resolve([
						{ name: 'database', isDirectory: () => true }
					] as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingPaths = [
					'/project/package.json',
					'/project/packages',
					'/project/packages/web',
					'/project/packages/web/package.json',
					'/project/packages/web/src/index.ts',
					'/project/libs',
					'/project/libs/database',
					'/project/libs/database/package.json',
					'/project/libs/database/src/index.ts'
				];
				if (existingPaths.includes(filePath)) {
					return Promise.resolve({
						isFile: () => filePath.includes('.'),
						isDirectory: () => !filePath.includes('.')
					} as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			expect(await resolver.resolve('@myorg/web')).toBe('./packages/web/src/index.ts');
			expect(await resolver.resolve('@myorg/database')).toBe('./libs/database/src/index.ts');
		});

		it('should use package.json exports field', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			mockFs.readFile.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve(JSON.stringify({
						workspaces: ['packages/*']
					})) as any;
				}
				if (filePath === '/project/packages/api/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/api',
						exports: {
							'.': './dist/index.js'
						}
					})) as any;
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readdir.mockImplementation((dirPath: any) => {
				if (dirPath === '/project/packages') {
					return Promise.resolve([
						{ name: 'api', isDirectory: () => true }
					] as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingPaths = [
					'/project/package.json',
					'/project/packages',
					'/project/packages/api',
					'/project/packages/api/package.json',
					'/project/packages/api/dist/index.js'
				];
				if (existingPaths.includes(filePath)) {
					return Promise.resolve({
						isFile: () => filePath.includes('.'),
						isDirectory: () => !filePath.includes('.')
					} as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			expect(await resolver.resolve('@myorg/api')).toBe('./packages/api/dist/index.js');
		});

		it('should fall back to convention paths when no main/exports', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			mockFs.readFile.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve(JSON.stringify({
						workspaces: ['libs/*']
					})) as any;
				}
				if (filePath === '/project/libs/utils/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/utils'
						// No main or exports field
					})) as any;
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readdir.mockImplementation((dirPath: any) => {
				if (dirPath === '/project/libs') {
					return Promise.resolve([
						{ name: 'utils', isDirectory: () => true }
					] as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingPaths = [
					'/project/package.json',
					'/project/libs',
					'/project/libs/utils',
					'/project/libs/utils/package.json',
					'/project/libs/utils/src/index.ts' // Convention path
				];
				if (existingPaths.includes(filePath)) {
					return Promise.resolve({
						isFile: () => filePath.includes('.'),
						isDirectory: () => !filePath.includes('.')
					} as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Should fall back to src/index.ts convention
			expect(await resolver.resolve('@myorg/utils')).toBe('./libs/utils/src/index.ts');
		});

		it('should handle workspaces object format', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			mockFs.readFile.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve(JSON.stringify({
						workspaces: {
							packages: ['apps/*']
						}
					})) as any;
				}
				if (filePath === '/project/apps/web/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/web',
						main: 'index.ts'
					})) as any;
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readdir.mockImplementation((dirPath: any) => {
				if (dirPath === '/project/apps') {
					return Promise.resolve([
						{ name: 'web', isDirectory: () => true }
					] as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingPaths = [
					'/project/package.json',
					'/project/apps',
					'/project/apps/web',
					'/project/apps/web/package.json',
					'/project/apps/web/index.ts'
				];
				if (existingPaths.includes(filePath)) {
					return Promise.resolve({
						isFile: () => filePath.includes('.'),
						isDirectory: () => !filePath.includes('.')
					} as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			expect(await resolver.resolve('@myorg/web')).toBe('./apps/web/index.ts');
		});
	});

	describe('combined sources', () => {
		it('should prefer tsconfig paths over package.json workspaces', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/database': ['libs/database/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.readFile.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve(JSON.stringify({
						workspaces: ['packages/*']
					})) as any;
				}
				// Different entry point in package.json
				if (filePath === '/project/packages/database/package.json') {
					return Promise.resolve(JSON.stringify({
						name: '@myorg/database',
						main: 'dist/index.js'
					})) as any;
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readdir.mockImplementation((dirPath: any) => {
				if (dirPath === '/project/packages') {
					return Promise.resolve([
						{ name: 'database', isDirectory: () => true }
					] as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				const existingPaths = [
					'/project/package.json',
					'/project/libs/database/src/index.ts', // tsconfig path
					'/project/packages',
					'/project/packages/database',
					'/project/packages/database/package.json',
					'/project/packages/database/dist/index.js' // package.json path
				];
				if (existingPaths.includes(filePath)) {
					return Promise.resolve({
						isFile: () => filePath.includes('.'),
						isDirectory: () => !filePath.includes('.')
					} as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Should use tsconfig path (libs/database/src), not package.json (packages/database/dist)
			expect(await resolver.resolve('@myorg/database')).toBe('./libs/database/src/index.ts');
		});
	});

	describe('edge cases', () => {
		it('should return null for external packages', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/database': ['libs/database/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/libs/database/src/index.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readFile.mockResolvedValue('{}' as any);

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// External packages should return null
			expect(await resolver.resolve('@nestjs/common')).toBeNull();
			expect(await resolver.resolve('react')).toBeNull();
			expect(await resolver.resolve('lodash')).toBeNull();
		});

		it('should handle missing tsconfig gracefully', async () => {
			const resolver = new WorkspacePackageResolver('/project', null);

			// Should still try package.json workspaces
			mockFs.readFile.mockResolvedValue('{}' as any);
			mockFs.stat.mockRejectedValue(new Error('not found'));

			expect(await resolver.resolve('@myorg/database')).toBeNull();
		});

		it('should handle missing package.json gracefully', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			mockFs.readFile.mockRejectedValue(new Error('not found'));
			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			expect(await resolver.resolve('@myorg/database')).toBeNull();
		});

		it('should only initialize once', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/utils': ['libs/utils/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/libs/utils/src/index.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readFile.mockResolvedValue('{}' as any);

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			// Call resolve multiple times
			await resolver.resolve('@myorg/utils');
			await resolver.resolve('@myorg/utils');
			await resolver.resolve('@myorg/utils');

			// readFile should only be called once for root package.json
			expect(mockFs.readFile).toHaveBeenCalledTimes(1);
		});

		it('should check if import is a workspace package', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						paths: {
							'@myorg/database': ['libs/database/src']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/libs/database/src/index.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			mockFs.readFile.mockResolvedValue('{}' as any);

			const resolver = new WorkspacePackageResolver('/project', tsconfig);

			expect(await resolver.isWorkspacePackage('@myorg/database')).toBe(true);
			expect(await resolver.isWorkspacePackage('@nestjs/common')).toBe(false);
		});
	});
});
