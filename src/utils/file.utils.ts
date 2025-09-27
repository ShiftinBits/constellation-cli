import { Stats } from 'node:fs';
import fs from 'node:fs/promises';

/**
 * Helper utility for file system operations
 */
export const FileUtils = {
	/**
	 * Check if a directory exists and is accessible
	 * @param dirPath Directory path to check
	 * @returns True if directory exists and is accessible, false otherwise
	 */
	async directoryExists(dirPath: string): Promise<boolean> {
		try {
			const stats = await fs.stat(dirPath);
			return stats.isDirectory();
		} catch {
			return false;
		}
	},

	/**
	 * Check if file exists at path and is readable
	 * @param path File path which to check
	 * @returns True if file exists and is readable, false otherwise
	 */
	async fileIsReadable(path: string): Promise<boolean> {
		try {
			await fs.access(path, fs.constants.R_OK);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Read file contents from path
	 * @param path Path from which to read file contents
	 * @returns File contents as string
	 */
	async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
		const fileContents: string = await fs.readFile(path, { encoding, flag: fs.constants.O_RDONLY });
		return fileContents;
	},

	/**
	 * Write contents to path in UTF-8 encoding
	 * @param path File path which to write data
	 * @param contents File contents which to write to file path
	 */
	async writeFile(path: string, contents: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
		const fileContents: Buffer = Buffer.from(contents, encoding);
		await fs.writeFile(path, fileContents, { encoding, flag: fs.constants.O_WRONLY | fs.constants.O_CREAT });
	},

	/**
	 * Get file stats for a given file
	 * @param filePath Path of file for which to get stats
	 * @returns File stats
	 */
	async getFileStats(filePath: string): Promise<Stats> {
		return await fs.stat(filePath);
	},

	/**
	 * Opens a file and returns a FileHandle for advanced file operations.
	 * @param path Path to the file to open
	 * @param flags File system flags (e.g., 'r', 'w', fs.constants.O_RDONLY)
	 * @param mode Optional file mode permissions (defaults to 0o666)
	 * @returns FileHandle for performing advanced file operations
	 */
	async getFileHandle(path: string, flags: string | number, mode?: number): Promise<fs.FileHandle> {
		return await fs.open(path, flags, mode);
	}
};
