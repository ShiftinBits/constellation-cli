import { Readable } from 'stream';

export class NdJsonStreamWriter<T> extends Readable {
	private dataSource: AsyncGenerator<T>;
	private sourceIterator: AsyncIterator<T>;
	private reading: boolean = false;

	constructor(dataSource: AsyncGenerator<T>) {
		// Don't set encoding - we'll push Buffers instead of strings for proper size tracking
		super();
		this.dataSource = dataSource;
		this.sourceIterator = this.dataSource[Symbol.asyncIterator]();
	}

	async _read() {
		// Prevent concurrent reads while we're actively reading from the iterator
		if (this.reading) return;
		this.reading = true;

		try {
			// Continue reading until backpressure or source is exhausted
			while (true) {
				const { value, done } = await this.sourceIterator.next();

				if (done) {
					// Signal end of stream only when generator is exhausted
					this.push(null);
					break;
				}

				// Convert to NDJSON and push as Buffer (not string) for proper size tracking
				const line = JSON.stringify(value) + '\n';
				const buffer = Buffer.from(line, 'utf8');

				// push returns false when backpressure is applied
				// Stop reading for now - Node.js will call _read() again when ready
				if (!this.push(buffer)) {
					break;
				}
			}
		} catch (error) {
			this.destroy(error as Error);
		} finally {
			this.reading = false;
		}
	}

	_destroy(error: Error | null, callback: (error?: Error | null) => void) {
		// Clean up the async generator if it has a return method
		if (this.dataSource.return) {
			this.dataSource.return(null).then(
				() => callback(error),
				(err) => callback(error || err),
			);
		} else {
			callback(error);
		}
	}
}
