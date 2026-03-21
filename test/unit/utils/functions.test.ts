import { describe, it, expect, jest } from '@jest/globals';
import { base32Encode, base32Decode } from '../../../src/utils/functions';

// Mock @scure/base to avoid ESM issues
jest.mock('@scure/base', () => ({
	base32: {
		encode: jest.fn((buffer: Buffer) => {
			// Simple base32-like encoding for testing
			return buffer.toString('base64').replace(/=/g, '');
		}),
		decode: jest.fn((str: string) => {
			// Simple base32-like decoding for testing
			return Buffer.from(str, 'base64');
		}),
	},
}));

describe('functions utilities', () => {
	describe('base32Encode', () => {
		it('should encode string to base32', () => {
			const input = 'hello';
			const encoded = base32Encode(input);
			expect(encoded).toBeTruthy();
			expect(typeof encoded).toBe('string');
		});

		it('should encode empty string', () => {
			const encoded = base32Encode('');
			expect(encoded).toBe('');
		});

		it('should encode string with special characters', () => {
			const input = 'hello@world!';
			const encoded = base32Encode(input);
			expect(encoded).toBeTruthy();
		});

		it('should encode unicode characters', () => {
			const input = '你好世界';
			const encoded = base32Encode(input);
			expect(encoded).toBeTruthy();
		});

		it('should produce consistent output for same input', () => {
			const input = 'test-value';
			const encoded1 = base32Encode(input);
			const encoded2 = base32Encode(input);
			expect(encoded1).toBe(encoded2);
		});
	});

	describe('base32Decode', () => {
		it('should decode base32 string back to original', () => {
			const original = 'hello';
			const encoded = base32Encode(original);
			const decoded = base32Decode(encoded);
			expect(decoded).toBe(original);
		});

		it('should decode empty string', () => {
			const decoded = base32Decode('');
			expect(decoded).toBe('');
		});

		it('should round-trip encode/decode string with special characters', () => {
			const original = 'hello@world!';
			const encoded = base32Encode(original);
			const decoded = base32Decode(encoded);
			expect(decoded).toBe(original);
		});

		it('should round-trip encode/decode unicode characters', () => {
			const original = '你好世界';
			const encoded = base32Encode(original);
			const decoded = base32Decode(encoded);
			expect(decoded).toBe(original);
		});

		it('should handle long strings', () => {
			const original = 'a'.repeat(1000);
			const encoded = base32Encode(original);
			const decoded = base32Decode(encoded);
			expect(decoded).toBe(original);
		});
	});
});
