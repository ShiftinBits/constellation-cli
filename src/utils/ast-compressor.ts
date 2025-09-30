import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { SerializedNode } from './ast-serializer';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Utility for compressing and decompressing AST data using gzip.
 * Reduces network payload size for efficient transmission to the API.
 */
export class ASTCompressor {
	/**
	 * Compresses a serialized AST node using gzip compression and encodes as base64.
	 * @param ast Serialized AST node to compress
	 * @returns Base64-encoded compressed AST data
	 */
	async compress(ast: SerializedNode): Promise<string> {
		// Convert AST to JSON and compress with gzip
		const jsonString = JSON.stringify(ast);
		const compressed = await gzip(Buffer.from(jsonString, 'utf8'));

		// Return base64-encoded string for API transmission
		return compressed.toString('base64');
	}

	/**
	 * Decompresses base64-encoded gzip-compressed AST data back to a serialized node.
	 * @param base64Data Base64-encoded compressed AST data
	 * @returns Decompressed SerializedNode object
	 */
	async decompress(base64Data: string): Promise<SerializedNode> {
		const buffer = Buffer.from(base64Data, 'base64');
		const decompressed = await gunzip(buffer);
		return JSON.parse(decompressed.toString('utf8'));
	}
}
