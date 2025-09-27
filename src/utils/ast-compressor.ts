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
	 * Compresses a serialized AST node using gzip compression.
	 * @param ast Serialized AST node to compress
	 * @returns Compressed AST data as a Buffer
	 */
	async compress(ast: SerializedNode): Promise<Buffer> {
		// Convert AST to JSON and compress with gzip
		const jsonString = JSON.stringify(ast);
		const compressed = await gzip(jsonString);

		console.log(`[COMPRESS] Original: ${jsonString.length} bytes, Compressed: ${compressed.length} bytes`);
		return compressed;
	}

	/**
	 * Decompresses gzip-compressed AST data back to a serialized node.
	 * @param buffer Compressed AST data buffer
	 * @returns Decompressed SerializedNode object
	 */
	async decompress(buffer: Buffer): Promise<SerializedNode> {
		const decompressed = await gunzip(buffer);
		return JSON.parse(decompressed.toString());
	}
}
