import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TsJsImportResolver } from '../../../../../src/languages/plugins/resolvers/ts-js-import-resolver';
import { TSConfckParseResult } from 'tsconfck';
import * as fs from 'node:fs/promises';

// Mock fs module
jest.mock('node:fs/promises');

describe('TsJsImportResolver', () => {
	let mockFs: jest.Mocked<typeof fs>;
	let originalCwd: typeof process.cwd;

	beforeEach(() => {
		jest.clearAllMocks();
		mockFs = fs as jest.Mocked<typeof fs>;

		// Add default mocks for new functions (identity/passthrough)
		// These can be overridden in individual tests
		// @ts-ignore
		(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));
		// @ts-ignore
		(mockFs.readFile as jest.Mock).mockResolvedValue('{}' as any);

		// Mock process.cwd() to return /project for all tests
		originalCwd = process.cwd;
		process.cwd = jest.fn(() => '/project') as any;
	});

	afterEach(() => {
		// Restore process.cwd
		process.cwd = originalCwd;
	});

	describe('constructor', () => {
		it('should create resolver with null tsconfig', async () => {
			const resolver = new TsJsImportResolver('/project/src/index.ts', null);
			expect(resolver).toBeDefined();

			// Should return original specifier when no tsconfig
			const result = await resolver.resolve('@utils/helper');
			expect(result).toBe('@utils/helper');
		});

		it('should create resolver with tsconfig', () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			expect(resolver).toBeDefined();
		});
	});

	describe('resolve - relative imports', () => {
		it('should resolve relative imports to project-relative paths', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);

			expect(await resolver.resolve('./helper')).toBe('./src/helper.ts');
			expect(await resolver.resolve('../utils/helper')).toBe('./utils/helper.ts');
		});

		it('should return original specifier if relative import file not found', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);

			expect(await resolver.resolve('./nonexistent')).toBe('./nonexistent');
			expect(await resolver.resolve('../nonexistent')).toBe('../nonexistent');
		});
	});

	describe('resolve - path aliases', () => {
		it('should resolve simple path alias', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({
				isFile: () => true
			} as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should try multiple extensions', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			// First two attempts fail, third succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper.d.ts');
			expect(mockFs.stat).toHaveBeenCalledTimes(3);
		});

		it('should resolve with index.ts for directories', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			// Direct file attempts fail, index.ts succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper/index.ts');
		});

		it('should return original specifier if resolution fails', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/nonexistent');

			expect(result).toBe('@utils/nonexistent');
		});

		it('should handle multiple path substitutions', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*', 'lib/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			// First substitution fails, second succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./lib/utils/helper.ts');
		});

		it('should pass through patterns without wildcards that do not match', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'jquery': ['node_modules/jquery/dist/jquery']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('jquery');

			// Non-wildcard patterns without @ are treated as node_modules and passed through
			expect(result).toBe('jquery');
		});
	});

	describe('resolve - baseUrl without paths', () => {
		it('should resolve using baseUrl when no paths match', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './src'
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('utils/helper');

			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should return original if baseUrl resolution fails', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './src'
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('utils/nonexistent');

			expect(result).toBe('utils/nonexistent');
		});
	});

	describe('resolve - node_modules imports', () => {
		it('should pass through node_modules imports without @ prefix', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);

			expect(await resolver.resolve('react')).toBe('react');
			expect(await resolver.resolve('lodash/debounce')).toBe('lodash/debounce');
		});

		it('should NOT pass through scoped packages (they use @)', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@testing-library/react');

			// Should attempt resolution and fail, returning original
			expect(result).toBe('@testing-library/react');
		});
	});

	describe('resolve - complex patterns', () => {
		it('should pass through pattern with suffix that is treated as node_modules', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'*Model': ['src/models/*']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('UserModel');

			// Patterns without @ prefix and no slashes are treated as node_modules imports
			expect(result).toBe('UserModel');
		});

		it('should handle nested wildcards', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@components/*': ['src/components/*']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@components/ui/Button');

			expect(result).toBe('./src/components/ui/Button.ts');
		});
	});

	describe('resolve - tsconfig in subdirectory', () => {
		it('should resolve paths relative to tsconfig location', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/packages/frontend/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver(
				'/project/packages/frontend/src/index.ts',
				tsconfig
			);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./packages/frontend/src/utils/helper.ts');
		});
	});

	describe('resolve - JavaScript files', () => {
		it('should use JavaScript extensions for .js files', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.js', jsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper.js');
		});

		it('should try JavaScript extensions in order (.js, .jsx, .mjs, .cjs)', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			// First three attempts fail, fourth (.cjs) succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.js', jsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper.cjs');
			expect(mockFs.stat).toHaveBeenCalledTimes(4);
		});

		it('should resolve relative imports with JavaScript extensions', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {}
					}
				}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.js', jsconfig);

			expect(await resolver.resolve('./helper')).toBe('./src/helper.js');
			expect(await resolver.resolve('../utils/helper')).toBe('./utils/helper.js');
		});

		it('should handle .jsx files', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@components/*': ['src/components/*']
						}
					}
				}
			} as TSConfckParseResult;

			// First attempt fails, second (.jsx) succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/App.jsx', jsconfig);
			const result = await resolver.resolve('@components/Button');

			expect(result).toBe('./src/components/Button.jsx');
		});

		it('should handle .mjs files', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './src'
					}
				}
			} as TSConfckParseResult;

			// First two attempts fail, third (.mjs) succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.mjs', jsconfig);
			const result = await resolver.resolve('utils/helper');

			expect(result).toBe('./src/utils/helper.mjs');
		});

		it('should resolve with index.js for directories', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			// Direct file attempts fail (.js, .jsx, .mjs, .cjs), then index.js succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.js', jsconfig);
			const result = await resolver.resolve('@utils/helper');

			expect(result).toBe('./src/utils/helper/index.js');
		});
	});

	describe('resolve - symlink resolution', () => {
		it('should resolve symlinks to their actual locations', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			// Mock fs.stat to succeed
			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			// Mock fs.realpath to return a different path (simulating symlink)
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockResolvedValue('/project/packages/shared/utils/helper.ts');

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			// Should resolve to the real path location
			expect(result).toBe('./packages/shared/utils/helper.ts');
		});

		it('should handle broken symlinks gracefully', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			} as TSConfckParseResult;

			// Mock fs.stat to succeed
			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);

			// Mock fs.realpath to fail (broken symlink)
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockRejectedValue(new Error('broken symlink'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper');

			// Should fall back to the original path
			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should resolve symlinked relative imports', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			mockFs.stat.mockResolvedValue({ isFile: () => true } as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockResolvedValue('/project/packages/core/helper.ts');

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./helper');

			expect(result).toBe('./packages/core/helper.ts');
		});
	});

	describe('resolve - TypeScript ESM imports with .js extensions', () => {
		it('should resolve .js imports to .ts files for TypeScript source files', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {}
					}
				}
			} as TSConfckParseResult;

			// Mock: file at /project/src/tools/base/BaseMcpTool.ts exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/tools/base/BaseMcpTool.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/tools/discovery/SearchSymbolsTool.ts', tsconfig);
			const result = await resolver.resolve('../base/BaseMcpTool.js');

			// Should resolve to .ts file, not .js
			expect(result).toBe('./src/tools/base/BaseMcpTool.ts');
		});

		it('should resolve .jsx imports to .tsx files for TypeScript source files', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock: file at /project/src/components/Button.tsx exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/components/Button.tsx') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/components/App.tsx', tsconfig);
			const result = await resolver.resolve('./Button.jsx');

			// Should resolve to .tsx file
			expect(result).toBe('./src/components/Button.tsx');
		});

		it('should try .ts, .tsx, .d.ts extensions when .js import does not resolve', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// First attempt (.ts) fails, second (.tsx) succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./Component.js');

			expect(result).toBe('./src/Component.tsx');
			expect(mockFs.stat).toHaveBeenCalledTimes(2);
		});

		it('should handle .mjs imports by trying TypeScript extensions', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock: file at /project/src/utils/helper.ts exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/utils/helper.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./utils/helper.mjs');

			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should handle .cjs imports by trying TypeScript extensions', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock: file at /project/src/config.ts exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/config.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./config.cjs');

			expect(result).toBe('./src/config.ts');
		});

		it('should try index files when .js directory import fails', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Direct file attempts fail, index.ts succeeds
			mockFs.stat
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockRejectedValueOnce(new Error('not found'))
				.mockResolvedValueOnce({ isFile: () => true } as any);

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./utils.js');

			expect(result).toBe('./src/utils/index.ts');
		});

		it('should return original specifier if no TypeScript file found for .js import', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// All resolution attempts fail
			mockFs.stat.mockRejectedValue(new Error('not found'));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('./nonexistent.js');

			expect(result).toBe('./nonexistent.js');
		});

		it('should resolve .js imports with path aliases to .ts files', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: {
							'@utils/*': ['src/utils/*']
						}
					}
				}
			} as TSConfckParseResult;

			// Mock: file at /project/src/utils/helper.ts exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/utils/helper.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('@utils/helper.js');

			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should NOT replace .js extension for JavaScript source files', async () => {
			const jsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/jsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock: file at /project/src/utils.js exists
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/src/utils.js') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			const resolver = new TsJsImportResolver('/project/src/index.js', jsconfig);
			const result = await resolver.resolve('./utils.js');

			// Should keep .js extension for JavaScript files
			expect(result).toBe('./src/utils.js');
		});
	});

	describe('resolve - package.json imports field', () => {
		it('should resolve # prefix imports using package.json imports field', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// Mock package.json content
			const packageJsonContent = JSON.stringify({
				name: 'test-package',
				imports: {
					'#utils/*': './src/utils/*'
				}
			});

			// Mock fs.stat for package.json discovery and file existence
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json' || filePath === '/project/src/utils/helper.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// Mock fs.readFile for package.json
			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);

			// Mock fs.realpath
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('#utils/helper');

			expect(result).toBe('./src/utils/helper.ts');
		});

		it('should handle wildcard patterns in imports field', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			const packageJsonContent = JSON.stringify({
				imports: {
					'#internal/*': './lib/internal/*.js'
				}
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json' || filePath === '/project/lib/internal/utils.js') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.js', tsconfig);
			const result = await resolver.resolve('#internal/utils');

			expect(result).toBe('./lib/internal/utils.js');
		});

		it('should try multiple import targets in order', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			const packageJsonContent = JSON.stringify({
				imports: {
					'#utils': ['./lib/utils.js', './src/utils.js']
				}
			});

			// First target fails, second succeeds
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json' || filePath === '/project/src/utils.js') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.js', tsconfig);
			const result = await resolver.resolve('#utils');

			expect(result).toBe('./src/utils.js');
		});

		it('should return original specifier if import not found in package.json', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			const packageJsonContent = JSON.stringify({
				imports: {
					'#utils/*': './src/utils/*'
				}
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('#nonexistent/helper');

			expect(result).toBe('#nonexistent/helper');
		});

		it('should handle exact match imports without wildcards', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			const packageJsonContent = JSON.stringify({
				imports: {
					'#logger': './src/logger.ts'
				}
			});

			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json' || filePath === '/project/src/logger.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('#logger');

			expect(result).toBe('./src/logger.ts');
		});

		it('should work without package.json present', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			// No package.json exists
			mockFs.stat.mockRejectedValue(new Error('not found'));
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/index.ts', tsconfig);
			const result = await resolver.resolve('#utils/helper');

			// Should return original since no package.json
			expect(result).toBe('#utils/helper');
		});

		it('should find package.json in parent directory', async () => {
			const tsconfig: TSConfckParseResult = {
				tsconfigFile: '/project/tsconfig.json',
				tsconfig: {}
			} as TSConfckParseResult;

			const packageJsonContent = JSON.stringify({
				imports: {
					'#shared/*': './shared/*'
				}
			});

			// package.json is in parent directory
			mockFs.stat.mockImplementation((filePath: any) => {
				if (filePath === '/project/package.json' || filePath === '/project/shared/utils.ts') {
					return Promise.resolve({ isFile: () => true } as any);
				}
				return Promise.reject(new Error('not found'));
			});

			// @ts-ignore
			(mockFs.readFile as jest.Mock).mockResolvedValue(packageJsonContent as any);
			// @ts-ignore
			(mockFs.realpath as jest.Mock).mockImplementation((p: any) => Promise.resolve(p));

			const resolver = new TsJsImportResolver('/project/src/components/Button.tsx', tsconfig);
			const result = await resolver.resolve('#shared/utils');

			expect(result).toBe('./shared/utils.ts');
		});
	});
});
