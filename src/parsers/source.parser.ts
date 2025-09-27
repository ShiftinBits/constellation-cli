import * as fs from "fs";
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

		// For large files, use streaming with callback
		const stats = await FileUtils.getFileStats(filePath);
		if (stats.size > 100 * 1024 * 1024) {
			// 100MB threshold
			return this.parseWithStream(parser, filePath);
		} else {
			// Small files can be read entirely
			const content = await FileUtils.readFile(filePath);
			return parser.parse(content);
		}
	}

	/**
	 * Parses large files using streaming to avoid memory exhaustion.
	 * Uses Tree-sitter's callback-based parsing with 64KB chunks.
	 * @param parser Configured Tree-sitter parser instance
	 * @param filePath Path to the large file to parse
	 * @returns Parsed Tree-sitter Tree object
	 */
	private async parseWithStream(
		parser: Parser,
		filePath: string
	): Promise<Tree> {
		const fd = fs.openSync(filePath, 'r');
		const bufferSize = 64 * 1024; // 64KB chunks
		const readBuffer = Buffer.alloc(bufferSize);

		try {
			// Tree-sitter calls this callback repeatedly to get file content
			const tree = parser.parse((index: number) => {
				// Read chunk starting at the requested byte index
				const bytesRead = fs.readSync(fd, readBuffer, 0, bufferSize, index);

				// Return null when we've reached EOF
				if (bytesRead === 0) {
					return null;
				}

				// Return the chunk as a string (tree-sitter accepts Buffer or string)
				return readBuffer.subarray(0, bytesRead).toString("utf-8");
			});

			return tree;
		} finally {
			fs.closeSync(fd);
		}
	}
}
