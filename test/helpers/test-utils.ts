import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { Tree } from 'tree-sitter';
import { jest, expect } from '@jest/globals';

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir(prefix = 'constellation-test-'): Promise<string> {
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
	content: string
): Promise<string> {
	const filePath = path.join(dirPath, fileName);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, 'utf-8');
	return filePath;
}

/**
 * Creates multiple test files
 */
export async function createTestFiles(
	dirPath: string,
	files: Record<string, string>
): Promise<Record<string, string>> {
	const filePaths: Record<string, string> = {};
	for (const [fileName, content] of Object.entries(files)) {
		filePaths[fileName] = await createTestFile(dirPath, fileName, content);
	}
	return filePaths;
}

/**
 * Creates a mock git repository
 */
export async function createMockGitRepo(dirPath: string): Promise<void> {
	const gitDir = path.join(dirPath, '.git');
	await fs.mkdir(gitDir, { recursive: true });

	// Create minimal git structure
	await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
	await fs.mkdir(path.join(gitDir, 'refs', 'heads'), { recursive: true });
	await fs.writeFile(path.join(gitDir, 'refs', 'heads', 'main'), 'mock-commit-hash\n');

	// Create config with remote
	const config = `[core]
	repositoryformatversion = 0
[remote "origin"]
	url = https://github.com/test/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main`;

	await fs.writeFile(path.join(gitDir, 'config'), config);
}

/**
 * Creates a mock .gitignore file
 */
export async function createGitignore(dirPath: string, patterns: string[]): Promise<void> {
	const content = patterns.join('\n');
	await fs.writeFile(path.join(dirPath, '.gitignore'), content);
}

/**
 * Helper to wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Asserts that a promise rejects with specific error
 */
export async function expectToReject(
	promise: Promise<any>,
	errorMessage?: string | RegExp
): Promise<void> {
	try {
		await promise;
		throw new Error('Expected promise to reject, but it resolved');
	} catch (error: any) {
		if (errorMessage) {
			if (typeof errorMessage === 'string') {
				expect(error.message).toContain(errorMessage);
			} else {
				expect(error.message).toMatch(errorMessage);
			}
		}
	}
}

/**
 * Creates a mock Tree-sitter Tree object for testing
 */
export function createMockTree(): Partial<Tree> {
	return {
		rootNode: {
			type: 'program',
			startPosition: { row: 0, column: 0 },
			endPosition: { row: 10, column: 0 },
			startIndex: 0,
			endIndex: 100,
			childCount: 2,
			children: [],
			namedChildCount: 2,
			namedChildren: [],
			parent: null,
			text: 'mock program',
			descendantForIndex: jest.fn(),
			namedDescendantForIndex: jest.fn(),
			descendantForPosition: jest.fn(),
			namedDescendantForPosition: jest.fn(),
			descendantsOfType: jest.fn(() => []),
			walk: jest.fn(),
		} as any,
		walk: jest.fn(),
		getChangedRanges: jest.fn(() => []),
		getIncludedRanges: jest.fn(() => []),
		getLanguage: jest.fn(),
		copy: jest.fn(),
		delete: jest.fn(),
		edit: jest.fn(),
	} as Partial<Tree>;
}

/**
 * Sample code snippets for testing
 */
export const sampleCode = {
	typescript: `
export class TestClass {
	private value: string;

	constructor(value: string) {
		this.value = value;
	}

	getValue(): string {
		return this.value;
	}
}

function testFunction(param: number): boolean {
	return param > 0;
}

export const testConstant = 42;
`,
	javascript: `
class TestClass {
	constructor(value) {
		this.value = value;
	}

	getValue() {
		return this.value;
	}
}

function testFunction(param) {
	return param > 0;
}

module.exports = { TestClass, testFunction };
`,
	malformed: `
class BrokenClass {
	constructor() {
		this.value =
	}
	// Missing closing brace
`,
};