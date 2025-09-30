import { jest, describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { SourceParser } from '../../../src/parsers/source.parser';
import { LanguageRegistry, ParserLanguage } from '../../../src/languages/language.registry';
import { FileUtils } from '../../../src/utils/file.utils';
import Parser, { Tree, Input } from 'tree-sitter';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

// Mock dependencies
jest.mock('../../../src/utils/file.utils');
jest.mock('tree-sitter', () => {
	const mockParser = {
		setLanguage: jest.fn(),
		parse: jest.fn()
	};
	return {
		__esModule: true,
		default: jest.fn(() => mockParser)
	};
});
jest.mock('fs');
jest.mock('fs/promises');

// Mock FileUtils at the top level
const mockFileUtils = FileUtils as jest.Mocked<typeof FileUtils>;

// Helper function to create mock Stats object
const createMockStats = (size: number) => ({
	size,
	isFile: () => true,
	isDirectory: () => false,
	isBlockDevice: () => false,
	isCharacterDevice: () => false,
	isSymbolicLink: () => false,
	isFIFO: () => false,
	isSocket: () => false,
	dev: 1,
	ino: 1,
	mode: 33188,
	nlink: 1,
	uid: 501,
	gid: 20,
	rdev: 0,
	blksize: 4096,
	blocks: 8,
	atimeMs: Date.now(),
	mtimeMs: Date.now(),
	ctimeMs: Date.now(),
	birthtimeMs: Date.now(),
	atime: new Date(),
	mtime: new Date(),
	ctime: new Date(),
	birthtime: new Date()
} as any);

describe('SourceParser', () => {
	let sourceParser: SourceParser;
	let mockLanguageRegistry: any;
	let mockParser: jest.Mocked<Parser>;
	let mockTree: jest.Mocked<Tree>;
	let mockLanguage: any;

	// Helper function to create mock language registry
	const createMockLanguageRegistry = (): any => ({
		javascript: {
			language: jest.fn(),
			fileExtensions: jest.fn()
		},
		typescript: {
			language: jest.fn(),
			fileExtensions: jest.fn()
		}
	});

	beforeEach(() => {
		// Reset all mocks
		jest.clearAllMocks();

		// Create mock instances
		mockLanguageRegistry = createMockLanguageRegistry();
		mockTree = {} as jest.Mocked<Tree>;
		mockLanguage = { mockLanguage: true };

		// Get the mocked parser from the Parser constructor
		const MockedParser = Parser as jest.MockedClass<typeof Parser>;
		mockParser = {
			setLanguage: jest.fn(),
			parse: jest.fn()
		} as unknown as jest.Mocked<Parser>;

		// Ensure the constructor returns our mock
		MockedParser.mockImplementation(() => mockParser);

		// Mock FileUtils methods
		mockFileUtils.getFileStats.mockResolvedValue(createMockStats(1024));
		mockFileUtils.readFile.mockResolvedValue('console.log("test");');

		// Create SourceParser instance
		sourceParser = new SourceParser(mockLanguageRegistry);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should create SourceParser with language registry', () => {
			expect(sourceParser).toBeInstanceOf(SourceParser);
		});
	});

	describe('parseFile', () => {
		it('should parse small files using direct content reading', async () => {
			const filePath = '/test/file.js';
			const language: ParserLanguage = 'javascript';
			const fileContent = 'console.log("test");';

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( 1024)); // Small file
			mockFileUtils.readFile.mockResolvedValue(fileContent);
			mockParser.parse.mockReturnValue(mockTree);

			const result = await sourceParser.parseFile(filePath, language);

			expect(mockLanguageRegistry.javascript!.language).toHaveBeenCalled();
			expect(mockParser.setLanguage).toHaveBeenCalledWith(mockLanguage);
			expect(FileUtils.getFileStats).toHaveBeenCalledWith(filePath);
			expect(FileUtils.readFile).toHaveBeenCalledWith(filePath);
			expect(mockParser.parse).toHaveBeenCalledWith(fileContent);
			expect(result).toBe(mockTree);
		});

		it('should parse large files using streaming', async () => {
			const filePath = '/test/large-file.js';
			const language: ParserLanguage = 'javascript';
			const largeFileSize = 15 * 1024 * 1024; // 15MB > 10MB threshold

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( largeFileSize));

			// Mock file handle and fs operations
			const mockFileHandle = {
				fd: 5,
				// @ts-expect-error - Jest mock typing issue
			close: jest.fn().mockResolvedValue(undefined)
			};
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockResolvedValue(mockFileHandle);

			// Mock Buffer allocation
			const mockBuffer = Buffer.from('test content');
			jest.spyOn(Buffer, 'alloc').mockReturnValue(mockBuffer);

			// Mock fs.readSync to simulate file reading
			let callCount = 0;
			(fs.readSync as jest.Mock).mockImplementation((fd, buffer, offset, length, position) => {
				callCount++;
				if (callCount === 1) {
					// First call returns some data
					const testData = 'function test() {}';
					(buffer as Buffer).write(testData);
					return testData.length;
				}
				// Second call returns 0 (EOF)
				return 0;
			});

			// Mock parser.parse with callback
			mockParser.parse.mockImplementation((input: string | Input | ((index: number) => string | null)) => {
				if (typeof input === 'function') {
					// Simulate the parsing callback being called
					const chunk1 = input(0); // First chunk
					const chunk2 = input(18); // Second chunk (should return null for EOF)
					expect(chunk1).toBeTruthy();
					expect(chunk2).toBeNull();
				}
				return mockTree;
			});

			const result = await sourceParser.parseFile(filePath, language);

			expect(fsPromises.open).toHaveBeenCalledWith(filePath, 'r');
			expect(mockParser.parse).toHaveBeenCalledWith(expect.any(Function));
			expect(mockFileHandle.close).toHaveBeenCalled();
			expect(result).toBe(mockTree);
		});

		it('should throw error for unsupported language', async () => {
			const filePath = '/test/file.unknown';
			const language = 'unsupported' as ParserLanguage;

			// Language not in registry
			(mockLanguageRegistry as any)['unsupported'] = undefined;

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow(
				'Unsupported language: unsupported'
			);
		});

		it('should throw error if language loader returns null', async () => {
			const filePath = '/test/file.js';
			const language: ParserLanguage = 'javascript';

			// Language loader returns null
			mockLanguageRegistry.javascript.language.mockResolvedValue(null);

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow(
				'Failed to load language: javascript'
			);
		});

		it('should throw error if language loader returns undefined', async () => {
			const filePath = '/test/file.js';
			const language: ParserLanguage = 'javascript';

			// Language loader returns undefined
			mockLanguageRegistry.javascript.language.mockResolvedValue(undefined);

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow(
				'Failed to load language: javascript'
			);
		});

		it('should handle TypeScript files', async () => {
			const filePath = '/test/file.ts';
			const language: ParserLanguage = 'typescript';
			const fileContent = 'const test: string = "hello";';

			// Setup mocks for TypeScript
			mockLanguageRegistry.typescript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( 512));
			mockFileUtils.readFile.mockResolvedValue(fileContent);
			mockParser.parse.mockReturnValue(mockTree);

			const result = await sourceParser.parseFile(filePath, language);

			expect(mockLanguageRegistry.typescript!.language).toHaveBeenCalled();
			expect(mockParser.setLanguage).toHaveBeenCalledWith(mockLanguage);
			expect(FileUtils.readFile).toHaveBeenCalledWith(filePath);
			expect(result).toBe(mockTree);
		});

		it('should handle file exactly at threshold size (10MB)', async () => {
			const filePath = '/test/threshold-file.js';
			const language: ParserLanguage = 'javascript';
			const thresholdSize = 10 * 1024 * 1024; // Exactly 10MB
			const fileContent = 'console.log("exactly at threshold");';

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( thresholdSize));
			mockFileUtils.readFile.mockResolvedValue(fileContent);
			mockParser.parse.mockReturnValue(mockTree);

			const result = await sourceParser.parseFile(filePath, language);

			// Should use direct reading (not streaming) for files <= threshold
			expect(FileUtils.readFile).toHaveBeenCalledWith(filePath);
			expect(mockParser.parse).toHaveBeenCalledWith(fileContent);
			expect(result).toBe(mockTree);
		});
	});

	describe('parseWithStream (via large file parsing)', () => {
		it('should show progress for very large files (>50MB)', async () => {
			const filePath = '/test/very-large-file.js';
			const language: ParserLanguage = 'javascript';
			const veryLargeFileSize = 60 * 1024 * 1024; // 60MB

			// Mock console.log to capture progress messages
			const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( veryLargeFileSize));

			// Mock file handle
			const mockFileHandle = {
				fd: 5,
				// @ts-expect-error - Jest mock typing issue
			close: jest.fn().mockResolvedValue(undefined)
			};
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockResolvedValue(mockFileHandle);

			// Mock Buffer
			const mockBuffer = Buffer.from('test content for progress');
			jest.spyOn(Buffer, 'alloc').mockReturnValue(mockBuffer);

			let readCallCount = 0;
			(fs.readSync as jest.Mock).mockImplementation((fd, buffer, offset, length, position) => {
				readCallCount++;
				if (readCallCount <= 3) {
					// Simulate reading chunks at different positions to trigger progress
					const testData = `chunk ${readCallCount} data`;
					(buffer as Buffer).write(testData);
					return testData.length;
				}
				return 0; // EOF
			});

			// Mock parser with callback that simulates different file positions
			mockParser.parse.mockImplementation((input: string | Input | ((index: number) => string | null)) => {
				if (typeof input === 'function') {
					input(0); // 0% progress
					input(veryLargeFileSize * 0.2); // 20% progress
					input(veryLargeFileSize * 0.5); // 50% progress
					input(veryLargeFileSize); // 100% progress
				}
				return mockTree;
			});

			await sourceParser.parseFile(filePath, language);

			// Should show progress messages for very large files
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Parsing large file:')
			);

			consoleSpy.mockRestore();
		});

		it('should handle streaming errors and close file handle', async () => {
			const filePath = '/test/error-file.js';
			const language: ParserLanguage = 'javascript';
			const largeFileSize = 15 * 1024 * 1024;

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( largeFileSize));

			// Mock file handle
			const mockFileHandle = {
				fd: 5,
				// @ts-expect-error - Jest mock typing issue
			close: jest.fn().mockResolvedValue(undefined)
			};
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockResolvedValue(mockFileHandle);

			// Mock Buffer
			jest.spyOn(Buffer, 'alloc').mockReturnValue(Buffer.alloc(64 * 1024));

			// Mock parser to throw error
			const parseError = new Error('Parse error');
			mockParser.parse.mockImplementation(() => {
				throw parseError;
			});

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow('Parse error');

			// Should still close file handle even on error
			expect(mockFileHandle.close).toHaveBeenCalled();
		});

		it('should handle multiple reads during streaming', async () => {
			const filePath = '/test/multi-read-file.js';
			const language: ParserLanguage = 'javascript';
			const largeFileSize = 12 * 1024 * 1024;

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( largeFileSize));

			const mockFileHandle = {
				fd: 5,
				// @ts-expect-error - Jest mock typing issue
			close: jest.fn().mockResolvedValue(undefined)
			};
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockResolvedValue(mockFileHandle);

			const mockBuffer = Buffer.alloc(64 * 1024);
			jest.spyOn(Buffer, 'alloc').mockReturnValue(mockBuffer);

			// Mock multiple fs.readSync calls
			let readCallCount = 0;
			const testChunks = ['chunk1', 'chunk2', 'chunk3'];
			(fs.readSync as jest.Mock).mockImplementation((fd, buffer, offset, length, position) => {
				if (readCallCount < testChunks.length) {
					const data = testChunks[readCallCount];
					(buffer as Buffer).write(data, 0);
					readCallCount++;
					return data.length;
				}
				return 0; // EOF
			});

			// Mock parser to call callback multiple times
			const capturedChunks: string[] = [];
			mockParser.parse.mockImplementation((input: string | Input | ((index: number) => string | null)) => {
				if (typeof input === 'function') {
					let position = 0;
					let chunk;
					while ((chunk = input(position)) !== null) {
						capturedChunks.push(chunk);
						position += chunk.length;
					}
				}
				return mockTree;
			});

			const result = await sourceParser.parseFile(filePath, language);

			expect(result).toBe(mockTree);
			expect(capturedChunks).toEqual(testChunks);
			expect(fs.readSync).toHaveBeenCalledTimes(testChunks.length + 1); // +1 for EOF
		});

		it('should convert buffer to UTF-8 string correctly', async () => {
			const filePath = '/test/utf8-file.js';
			const language: ParserLanguage = 'javascript';
			const largeFileSize = 11 * 1024 * 1024;

			// Setup mocks
			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( largeFileSize));

			const mockFileHandle = {
				fd: 5,
				// @ts-expect-error - Jest mock typing issue
			close: jest.fn().mockResolvedValue(undefined)
			};
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockResolvedValue(mockFileHandle);

			const mockBuffer = Buffer.alloc(64 * 1024);
			jest.spyOn(Buffer, 'alloc').mockReturnValue(mockBuffer);

			// Mock fs.readSync to write UTF-8 content
			const utf8Content = 'function test() { return "unicode: café"; }';
			(fs.readSync as jest.Mock).mockImplementation((fd, buffer, offset, length, position) => {
				if (position === 0) {
					const bytesWritten = (buffer as Buffer).write(utf8Content, 0, 'utf8');
					return bytesWritten;
				}
				return 0; // EOF
			});

			// Mock parser to verify UTF-8 conversion
			let capturedContent = '';
			mockParser.parse.mockImplementation((input: string | Input | ((index: number) => string | null)) => {
				if (typeof input === 'function') {
					const chunk = input(0);
					capturedContent = chunk || '';
					input(utf8Content.length); // Trigger EOF
				}
				return mockTree;
			});

			await sourceParser.parseFile(filePath, language);

			expect(capturedContent).toBe(utf8Content);
		});
	});

	describe('error handling', () => {
		it('should propagate file stats errors', async () => {
			const filePath = '/test/inaccessible-file.js';
			const language: ParserLanguage = 'javascript';

			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockRejectedValue(new Error('File not found'));

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow('File not found');
		});

		it('should propagate file reading errors', async () => {
			const filePath = '/test/read-error-file.js';
			const language: ParserLanguage = 'javascript';

			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( 1024));
			mockFileUtils.readFile.mockRejectedValue(new Error('Permission denied'));

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow('Permission denied');
		});

		it('should propagate file opening errors in streaming', async () => {
			const filePath = '/test/open-error-file.js';
			const language: ParserLanguage = 'javascript';
			const largeFileSize = 15 * 1024 * 1024;

			mockLanguageRegistry.javascript.language.mockResolvedValue(mockLanguage);
			mockFileUtils.getFileStats.mockResolvedValue(createMockStats( largeFileSize));
			// @ts-expect-error - Jest mock typing issue
		(fsPromises.open as jest.Mock).mockRejectedValue(new Error('Cannot open file'));

			await expect(sourceParser.parseFile(filePath, language)).rejects.toThrow('Cannot open file');
		});
	});
});