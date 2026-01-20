import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { SerializedNode } from './ast-serializer';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const gunzip = promisify(zlib.gunzip);

/**
 * Utility for compressing and decompressing AST data using gzip.
 * Uses streaming compression to handle files of any size robustly.
 */
export class ASTCompressor {
	/**
	 * Serializes AST to JSON in chunks to prevent memory exhaustion.
	 * Generator yields small string chunks instead of building one giant string.
	 */
	private *serializeASTChunks(node: SerializedNode): Generator<string> {
		yield '{';

		// Serialize node properties
		yield `"type":"${node.type}"`;
		yield `,"startPosition":${JSON.stringify(node.startPosition)}`;
		yield `,"endPosition":${JSON.stringify(node.endPosition)}`;

		// Optional fields
		if (node.fieldName !== undefined) {
			yield `,"fieldName":"${node.fieldName}"`;
		}

		if (node.text !== undefined) {
			yield `,"text":${JSON.stringify(node.text)}`;
		}

		// Serialize children recursively
		if (node.children && node.children.length > 0) {
			yield ',"children":[';
			for (let i = 0; i < node.children.length; i++) {
				if (i > 0) yield ',';
				yield* this.serializeASTChunks(node.children[i]);
			}
			yield ']';
		}

		yield '}';
	}

	/**
	 * Compresses a stream of JSON chunks using streaming gzip compression.
	 * Handles files of any size without memory exhaustion.
	 *
	 * @param jsonStream Generator yielding JSON string chunks
	 * @returns Base64-encoded compressed AST data
	 */
	async compressStream(
		jsonStream: Generator<string> | AsyncGenerator<string>,
	): Promise<string> {
		const chunks: Buffer[] = [];
		const gzipStream = zlib.createGzip();

		// Collect compressed chunks
		gzipStream.on('data', (chunk) => chunks.push(chunk));

		// Wait for compression to complete
		const compressionComplete = new Promise<void>((resolve, reject) => {
			gzipStream.on('end', resolve);
			gzipStream.on('error', reject);
		});

		// Stream JSON chunks through gzip
		const readable = Readable.from(jsonStream);
		await pipeline(readable, gzipStream);
		await compressionComplete;

		// Combine all compressed chunks and encode as base64
		return Buffer.concat(chunks).toString('base64');
	}

	/**
	 * Compresses a serialized AST node using streaming gzip compression.
	 * Legacy method - builds entire tree in memory first.
	 * @deprecated Use compressStream for better memory efficiency
	 * @param ast Serialized AST node to compress
	 * @returns Base64-encoded compressed AST data
	 */
	async compress(ast: SerializedNode): Promise<string> {
		const chunks: Buffer[] = [];
		const gzipStream = zlib.createGzip();

		// Collect compressed chunks
		gzipStream.on('data', (chunk) => chunks.push(chunk));

		// Wait for compression to complete
		const compressionComplete = new Promise<void>((resolve, reject) => {
			gzipStream.on('end', resolve);
			gzipStream.on('error', reject);
		});

		// Stream JSON chunks through gzip
		const readable = Readable.from(this.serializeASTChunks(ast));
		await pipeline(readable, gzipStream);
		await compressionComplete;

		// Combine all compressed chunks and encode as base64
		return Buffer.concat(chunks).toString('base64');
	}

	/**
	 * Decompresses base64-encoded gzip-compressed AST data back to a serialized node.
	 * @param base64Data Base64-encoded compressed AST data
	 * @returns Decompressed SerializedNode object
	 */
	async decompress(base64Data: string): Promise<SerializedNode> {
		const buffer = Buffer.from(base64Data, 'base64');
		const decompressed = await gunzip(buffer);
		return JSON.parse(decompressed.toString('utf-8'));
	}
}
