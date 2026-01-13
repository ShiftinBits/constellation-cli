import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir(
	prefix = 'constellation-test-',
): Promise<string> {
	const tempDir = await fs.mkdtemp(path.join(tmpdir(), prefix));
	return tempDir;
}

/**
 * Cleans up a temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
	try {
		await fs.rm(dirPath, { recursive: true, force: true });
	} catch (error) {
		console.error(`Failed to cleanup temp dir ${dirPath}:`, error);
	}
}

/**
 * Creates a test file with content
 */
export async function createTestFile(
	dirPath: string,
	fileName: string,
	content: string,
): Promise<string> {
	const filePath = path.join(dirPath, fileName);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf-8');
	return filePath;
}
