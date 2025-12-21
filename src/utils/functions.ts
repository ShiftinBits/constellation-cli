import { base32 } from '@scure/base';

/**
 * Encodes a string value to base32 format for URL-safe identifiers.
 * @param val String value to encode
 * @returns Base32-encoded string
 */
export function base32Encode(val: string): string {
	return base32.encode(Buffer.from(val));
}

/**
 * Decodes a base32-encoded string back to its original value.
 * @param val Base32-encoded string to decode
 * @returns Original decoded string
 */
export function base32Decode(val: string): string {
	return base32.decode(val).toString();
}
