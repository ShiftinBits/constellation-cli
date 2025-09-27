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

/**
 * Sanitizes a namespace string to contain only safe characters.
 * Removes all characters except alphanumeric, hyphens, and underscores.
 * @param ns Namespace string to sanitize
 * @returns Sanitized namespace containing only [a-zA-Z0-9-_] characters
 */
export function sanitizeNamespace(ns: string): string {
	return ns.replaceAll(/[^a-zA-Z0-9-_]/g, '');
}
