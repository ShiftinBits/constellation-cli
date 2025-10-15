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

			expect(await resolver.resolve('./helper')).toBe('src/helper.ts');
			expect(await resolver.resolve('../utils/helper')).toBe('utils/helper.ts');
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

			expect(result).toBe('src/utils/helper.ts');
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

			expect(result).toBe('src/utils/helper.d.ts');
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

			expect(result).toBe('src/utils/helper/index.ts');
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

			expect(result).toBe('lib/utils/helper.ts');
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

			expect(result).toBe('src/utils/helper.ts');
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

			expect(result).toBe('src/components/ui/Button.ts');
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

			expect(result).toBe('packages/frontend/src/utils/helper.ts');
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

			expect(result).toBe('src/utils/helper.js');
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

			expect(result).toBe('src/utils/helper.cjs');
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

			expect(await resolver.resolve('./helper')).toBe('src/helper.js');
			expect(await resolver.resolve('../utils/helper')).toBe('utils/helper.js');
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

			expect(result).toBe('src/components/Button.jsx');
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

			expect(result).toBe('src/utils/helper.mjs');
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

			expect(result).toBe('src/utils/helper/index.js');
		});
	});
});
