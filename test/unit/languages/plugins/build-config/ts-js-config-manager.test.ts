import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { IConstellationLanguageConfig } from '../../../../../src/config/config';

// Mock tsconfck BEFORE importing TsJsConfigManager
jest.mock('tsconfck', () => ({
	findAll: jest.fn(async () => []),
	parse: jest.fn(async () => ({
		tsconfigFile: '/mock/tsconfig.json',
		tsconfig: {
			compilerOptions: {
				baseUrl: './',
				paths: {}
			}
		}
	})),
}));

import { TsJsConfigManager } from '../../../../../src/languages/plugins/build-config/ts-js-config-manager';
import * as tsconfck from 'tsconfck';

describe('TsJsConfigManager', () => {
	const mockProjectRoot = '/test/project';
	let mockFindAll: jest.MockedFunction<typeof tsconfck.findAll>;
	let mockParse: jest.MockedFunction<typeof tsconfck.parse>;

	beforeEach(() => {
		jest.clearAllMocks();
		mockFindAll = tsconfck.findAll as jest.MockedFunction<typeof tsconfck.findAll>;
		mockParse = tsconfck.parse as jest.MockedFunction<typeof tsconfck.parse>;
	});

	describe('constructor', () => {
		it('should create TsJsConfigManager with TypeScript enabled', () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts', '.tsx'] },
			} as IConstellationLanguageConfig;

			const manager = new TsJsConfigManager(mockProjectRoot, languages);

			expect(manager).toBeDefined();
			expect(manager.isEnabled()).toBe(true);
		});

		it('should create TsJsConfigManager with JavaScript enabled (TypeScript disabled)', () => {
			const languages: IConstellationLanguageConfig = {
				javascript: { fileExtensions: ['.js', '.jsx'] },
			} as IConstellationLanguageConfig;

			const manager = new TsJsConfigManager(mockProjectRoot, languages);

			expect(manager).toBeDefined();
			expect(manager.isEnabled()).toBe(true);
		});
	});

	describe('initialize', () => {
		it('should discover tsconfig files when TypeScript is enabled', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue([
				'/test/project/tsconfig.json',
				'/test/project/packages/frontend/tsconfig.json',
			]);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.initialize();

			expect(result).toHaveLength(2);
			expect(result).toContain('/test/project/tsconfig.json');
			expect(result).toContain('/test/project/packages/frontend/tsconfig.json');
			expect(mockFindAll).toHaveBeenCalledWith(mockProjectRoot, {
				skip: expect.any(Function),
				configNames: ['tsconfig.json']
			});
		});

		it('should discover jsconfig files when JavaScript is enabled', async () => {
			const languages: IConstellationLanguageConfig = {
				javascript: { fileExtensions: ['.js'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue([
				'/test/project/jsconfig.json',
				'/test/project/packages/frontend/jsconfig.json',
			]);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.initialize();

			expect(result).toHaveLength(2);
			expect(result).toContain('/test/project/jsconfig.json');
			expect(result).toContain('/test/project/packages/frontend/jsconfig.json');
			expect(mockFindAll).toHaveBeenCalledWith(mockProjectRoot, {
				skip: expect.any(Function),
				configNames: ['jsconfig.json']
			});
		});

		it('should cache results on subsequent calls', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue(['/test/project/tsconfig.json']);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);

			const result1 = await manager.initialize();
			const result2 = await manager.initialize();

			expect(result1).toEqual(result2);
			expect(mockFindAll).toHaveBeenCalledTimes(1);
		});

		it('should handle errors gracefully', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
			mockFindAll.mockRejectedValue(new Error('File system error'));

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.initialize();

			expect(result).toEqual([]);
			expect(consoleWarnSpy).toHaveBeenCalled();
			consoleWarnSpy.mockRestore();
		});

		it('should skip node_modules and .git directories', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue([]);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			await manager.initialize();

			expect(mockFindAll).toHaveBeenCalledWith(mockProjectRoot, {
				skip: expect.any(Function),
				configNames: ['tsconfig.json']
			});

			const skipFn = (mockFindAll.mock.calls[0][1] as any).skip;
			expect(skipFn('node_modules')).toBe(true);
			expect(skipFn('.git')).toBe(true);
			expect(skipFn('src')).toBe(false);
		});
	});

	describe('getConfigForFile', () => {
		it('should parse and return tsconfig for a TypeScript file', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const mockTsConfig = {
				tsconfigFile: '/test/project/tsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			};

			mockParse.mockResolvedValue(mockTsConfig as any);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.getConfigForFile('/test/project/src/index.ts');

			expect(result).toEqual(mockTsConfig);
			expect(mockParse).toHaveBeenCalledWith('/test/project/src/index.ts', {
				root: mockProjectRoot,
				configName: 'tsconfig.json'
			});
		});

		it('should parse and return jsconfig for a JavaScript file', async () => {
			const languages: IConstellationLanguageConfig = {
				javascript: { fileExtensions: ['.js'] },
			} as IConstellationLanguageConfig;

			const mockJsConfig = {
				tsconfigFile: '/test/project/jsconfig.json',
				tsconfig: {
					compilerOptions: {
						baseUrl: './',
						paths: { '@utils/*': ['src/utils/*'] }
					}
				}
			};

			mockParse.mockResolvedValue(mockJsConfig as any);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.getConfigForFile('/test/project/src/index.js');

			expect(result).toEqual(mockJsConfig);
			expect(mockParse).toHaveBeenCalledWith('/test/project/src/index.js', {
				root: mockProjectRoot,
				configName: 'jsconfig.json'
			});
		});

		it('should cache parsed configs', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const mockTsConfig = {
				tsconfigFile: '/test/project/tsconfig.json',
				tsconfig: { compilerOptions: {} }
			};

			mockParse.mockResolvedValue(mockTsConfig as any);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);

			const result1 = await manager.getConfigForFile('/test/project/src/index.ts');
			const result2 = await manager.getConfigForFile('/test/project/src/index.ts');

			expect(result1).toEqual(result2);
			expect(mockParse).toHaveBeenCalledTimes(1);
		});

		it('should handle parsing errors gracefully', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
			mockParse.mockRejectedValue(new Error('Parse error'));

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = await manager.getConfigForFile('/test/project/src/index.ts');

			expect(result).toBeNull();
			expect(consoleWarnSpy).toHaveBeenCalled();
			consoleWarnSpy.mockRestore();
		});
	});

	describe('getTsconfigPaths', () => {
		it('should return discovered tsconfig paths', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue([
				'/test/project/tsconfig.json',
				'/test/project/packages/frontend/tsconfig.json',
			]);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			await manager.initialize();
			const result = manager.getTsconfigPaths();

			expect(result).toHaveLength(2);
			expect(result).toContain('/test/project/tsconfig.json');
		});

		it('should return empty array before initialization', () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			const result = manager.getTsconfigPaths();

			expect(result).toEqual([]);
		});

		it('should return copy of array to prevent mutation', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			mockFindAll.mockResolvedValue(['/test/project/tsconfig.json']);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);
			await manager.initialize();

			const result1 = manager.getTsconfigPaths();
			const result2 = manager.getTsconfigPaths();

			expect(result1).not.toBe(result2); // Different array instances
			expect(result1).toEqual(result2); // But same content
		});
	});

	describe('clearCache', () => {
		it('should clear the parse cache', async () => {
			const languages: IConstellationLanguageConfig = {
				typescript: { fileExtensions: ['.ts'] },
			} as IConstellationLanguageConfig;

			const mockTsConfig = {
				tsconfigFile: '/test/project/tsconfig.json',
				tsconfig: { compilerOptions: {} }
			};

			mockParse.mockResolvedValue(mockTsConfig as any);

			const manager = new TsJsConfigManager(mockProjectRoot, languages);

			// First call - should parse
			await manager.getConfigForFile('/test/project/src/index.ts');
			expect(mockParse).toHaveBeenCalledTimes(1);

			// Clear cache
			manager.clearCache();

			// Second call - should parse again
			await manager.getConfigForFile('/test/project/src/index.ts');
			expect(mockParse).toHaveBeenCalledTimes(2);
		});
	});
});
