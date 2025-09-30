import { describe, it, expect, jest } from '@jest/globals';

// Mock the functions module to avoid @scure/base import issues
jest.mock('../../../src/utils/functions', () => ({
	base32Encode: jest.fn((input: string) => {
		// Simple base64 encoding as a mock (not actual base32 but sufficient for testing)
		return Buffer.from(input, 'utf8').toString('base64');
	}),
	base32Decode: jest.fn((encoded: string) => {
		// Simple base64 decoding as a mock
		return Buffer.from(encoded, 'base64').toString('utf8');
	}),
}));

import { generateAstId } from '../../../src/utils/id.utils';
import { base32Encode, base32Decode } from '../../../src/utils/functions';

describe('IdUtils', () => {
	describe('generateAstId', () => {
		it('should generate deterministic ID for namespace and branch', () => {
			const namespace = 'test-project';
			const branch = 'main';

			const id1 = generateAstId(namespace, branch);
			const id2 = generateAstId(namespace, branch);

			expect(id1).toBe(id2);
			expect(id1).toBeTruthy();
			expect(typeof id1).toBe('string');
		});

		it('should generate different IDs for different namespaces', () => {
			const branch = 'main';
			const id1 = generateAstId('project-a', branch);
			const id2 = generateAstId('project-b', branch);

			expect(id1).not.toBe(id2);
		});

		it('should generate different IDs for different branches', () => {
			const namespace = 'test-project';
			const id1 = generateAstId(namespace, 'main');
			const id2 = generateAstId(namespace, 'develop');

			expect(id1).not.toBe(id2);
		});

		it('should include file path when provided', () => {
			const namespace = 'test-project';
			const branch = 'main';
			const filePath = 'src/index.ts';

			const idWithoutFile = generateAstId(namespace, branch);
			const idWithFile = generateAstId(namespace, branch, filePath);

			expect(idWithoutFile).not.toBe(idWithFile);
		});

		it('should generate different IDs for different file paths', () => {
			const namespace = 'test-project';
			const branch = 'main';

			const id1 = generateAstId(namespace, branch, 'src/index.ts');
			const id2 = generateAstId(namespace, branch, 'src/utils.ts');

			expect(id1).not.toBe(id2);
		});

		it('should handle special characters in inputs', () => {
			const namespace = 'test-project@2024';
			const branch = 'feature/new-api';
			const filePath = 'src/components/User Component.tsx';

			const id = generateAstId(namespace, branch, filePath);

			expect(id).toBeTruthy();
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});

		it('should handle empty strings', () => {
			const id1 = generateAstId('', '');  // produces ":"
			const id2 = generateAstId('', '', 'file.txt');  // produces ":file.txt"

			expect(id1).toBeTruthy();
			expect(id2).toBeTruthy();
			// These should be different because one has no file path and one has a file path
			expect(id1).not.toBe(id2);
		});

		it('should be consistent with manual encoding', () => {
			const namespace = 'test-project';
			const branch = 'main';
			const filePath = 'src/index.ts';

			const expectedInput = `${namespace}:${branch}:${filePath}`;
			const expectedId = base32Encode(expectedInput);
			const actualId = generateAstId(namespace, branch, filePath);

			expect(actualId).toBe(expectedId);
		});

		it('should create reversible IDs', () => {
			const namespace = 'my-project';
			const branch = 'feature-branch';
			const filePath = 'lib/parser.js';

			const id = generateAstId(namespace, branch, filePath);
			const decoded = base32Decode(id);
			const expectedDecoded = `${namespace}:${branch}:${filePath}`;

			expect(decoded).toBe(expectedDecoded);
		});

		it('should handle long inputs', () => {
			const namespace = 'a'.repeat(100);
			const branch = 'b'.repeat(100);
			const filePath = 'c'.repeat(200);

			const id = generateAstId(namespace, branch, filePath);

			expect(id).toBeTruthy();
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);
		});

		it('should produce consistent identifiers', () => {
			const namespace = 'test/project with spaces & symbols!';
			const branch = 'feature/api@v2#main';
			const filePath = 'src/components/User & Admin.tsx';

			const id = generateAstId(namespace, branch, filePath);

			expect(id).toBeTruthy();
			expect(typeof id).toBe('string');
			expect(id.length).toBeGreaterThan(0);

			// Should not contain problematic characters for URLs since it's encoded
			expect(id).not.toMatch(/[\s&@#!]/);
		});

		it('should handle Unicode characters', () => {
			const namespace = 'プロジェクト';
			const branch = 'ブランチ';
			const filePath = 'ファイル.ts';

			const id = generateAstId(namespace, branch, filePath);

			expect(id).toBeTruthy();
			expect(typeof id).toBe('string');

			// Should be reversible
			const decoded = base32Decode(id);
			expect(decoded).toBe(`${namespace}:${branch}:${filePath}`);
		});

		it('should create different IDs for path variations', () => {
			const namespace = 'project';
			const branch = 'main';

			// These should be treated as different since we don't normalize paths
			const id1 = generateAstId(namespace, branch, './src/index.ts');
			const id2 = generateAstId(namespace, branch, 'src/index.ts');

			// Paths are different strings, so IDs should be different
			expect(id1).not.toBe(id2);
		});

		it('should verify mock functions are called correctly', () => {
			const namespace = 'test';
			const branch = 'main';
			const filePath = 'file.ts';

			const mockEncode = base32Encode as jest.MockedFunction<typeof base32Encode>;
			mockEncode.mockClear();

			generateAstId(namespace, branch, filePath);

			expect(mockEncode).toHaveBeenCalledWith('test:main:file.ts');
			expect(mockEncode).toHaveBeenCalledTimes(1);
		});
	});
});