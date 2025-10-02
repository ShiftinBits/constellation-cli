import * as fs from "fs";
import * as fsPromises from "fs/promises";
import Parser, { Tree } from "tree-sitter";
import { LanguageRegistry, ParserLanguage } from "../languages/language.registry";
import { FileUtils } from "../utils/file.utils";

/**
 * Parser for generating Abstract Syntax Trees from source code files.
 * Uses Tree-sitter parsers with automatic memory optimization for large files.
 */
export class SourceParser {

	/**
	 * Creates a new SourceParser instance.
	 * @param langRegistry Language registry containing Tree-sitter parser configurations
	 */
	constructor(private readonly langRegistry: LanguageRegistry) { }

	/**
	 * Parses a source code file and generates an Abstract Syntax Tree.
	 * Automatically chooses between direct parsing and streaming based on file size.
	 * @param filePath Path to the source file to parse
	 * @param language Programming language identifier for parser selection
	 * @returns Tree-sitter Tree object representing the parsed AST
	 * @throws Error if language is unsupported or parser fails to load
	 */
	async parseFile(filePath: string, language: ParserLanguage): Promise<Tree> {
		const langLoader = this.langRegistry[language]?.language;
		if (!langLoader) {
			throw new Error(`Unsupported language: ${language}`);
		}

		const lang = await langLoader();
		if (!lang) {
			throw new Error(`Failed to load language: ${language}`);
		}

		const parser = new Parser();
		parser.setLanguage(lang as any);

		// Check file size to determine parsing strategy
		const stats = await FileUtils.getFileStats(filePath);
		const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB

		if (stats.size <= LARGE_FILE_THRESHOLD) {
			// Most files (<10MB): Read entire file asynchronously, parse synchronously
			// This eliminates blocking I/O for 99% of source files
			const content = await FileUtils.readFile(filePath);
			const options: Parser.Options = {
      bufferSize: 1024 * 1024, // Set the bufferSize to 1 MB (1024 KB)
    };
			return parser.parse(content, undefined, options);
		} else {
			// Large files (>10MB): Use streaming with callback
			// Tree-sitter's API requires sync callbacks, so we minimize blocking
			return this.parseWithStream(parser, filePath, stats.size);
		}
	}

	/**
	 * Parses large files using streaming to avoid memory exhaustion.
	 * Uses Tree-sitter's callback-based parsing with 64KB chunks.
	 * Minimizes blocking by using async operations where possible.
	 * @param parser Configured Tree-sitter parser instance
	 * @param filePath Path to the large file to parse
	 * @param fileSize Size of the file in bytes for progress tracking
	 * @returns Parsed Tree-sitter Tree object
	 * @throws Error if file cannot be opened or parsing fails
	 */
	private async parseWithStream(
		parser: Parser,
		filePath: string,
		fileSize: number
	): Promise<Tree> {
		let fileHandle: fsPromises.FileHandle | null = null;

		try {
			// Open file asynchronously to avoid initial blocking
			fileHandle = await fsPromises.open(filePath, 'r');
			const fd = fileHandle.fd;
			const bufferSize = 64 * 1024; // 64KB chunks
			const readBuffer = Buffer.alloc(bufferSize);

			// Track progress for large files
			let lastProgress = 0;

			// Tree-sitter requires synchronous callback - unavoidable limitation
			// But we've already opened the file asynchronously
			const tree = parser.parse((index: number) => {
				// Progress reporting for files over 50MB
				if (fileSize > 50 * 1024 * 1024) {
					const progress = Math.round((index / fileSize) * 100);
					if (progress > lastProgress + 10) {
						console.log(`  Parsing large file: ${progress}%...`);
						lastProgress = progress;
					}
				}

				// Read chunk starting at the requested byte index
				// Note: readSync is required here due to Tree-sitter's sync callback API
				const bytesRead = fs.readSync(fd, readBuffer, 0, bufferSize, index);

				// Return null when we've reached EOF
				if (bytesRead === 0) {
					return null;
				}

				// Return the chunk as a string (tree-sitter accepts Buffer or string)
				return readBuffer.subarray(0, bytesRead).toString("utf-8");
			});

			return tree;
		} catch (error) {
			// Ensure file is closed even if parsing fails
			if (fileHandle) {
				try {
					await fileHandle.close();
				} catch (closeError) {
					// Log but don't mask the original error
					console.error(`Warning: Failed to close file handle for ${filePath}:`, closeError);
				}
			}
			throw error;
		} finally {
			// Final cleanup - close file handle if still open
			if (fileHandle) {
				try {
					await fileHandle.close();
				} catch (closeError) {
					// Suppress errors during final cleanup to avoid masking original errors
					// File handle will be released when process ends
				}
			}
		}
	}
}
