import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
	type Server,
} from 'node:http';

export interface CallbackServerResult {
	port: number;
	waitForCallback(state: string, timeout?: number): Promise<string>;
	close(): void;
}

const KEY_PATTERN = /^ak:[0-9a-f]{32}$/i;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><title>Authentication Successful</title></head>
<body><h1>Authentication successful! You can close this tab.</h1></body></html>`;

export function startCallbackServer(): Promise<CallbackServerResult> {
	return new Promise((resolve, reject) => {
		const server: Server = createServer();

		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				server.close();
				reject(new Error('Failed to bind callback server'));
				return;
			}

			resolve({
				port: addr.port,
				close() {
					server.close();
				},
				waitForCallback(state: string, timeout = 300_000): Promise<string> {
					return new Promise<string>((res, rej) => {
						const timer = setTimeout(() => {
							server.close();
							rej(new Error('Authentication timed out'));
						}, timeout);

						server.on(
							'request',
							(req: IncomingMessage, resp: ServerResponse) => {
								const url = new URL(
									req.url ?? '/',
									`http://127.0.0.1:${addr.port}`,
								);

								if (url.pathname !== '/callback') {
									resp.writeHead(404, { 'Content-Type': 'text/plain' });
									resp.end('Not found');
									return;
								}

								const key = url.searchParams.get('key');
								const reqState = url.searchParams.get('state');

								if (reqState !== state) {
									resp.writeHead(400, { 'Content-Type': 'text/plain' });
									resp.end('Invalid state parameter');
									return;
								}

								if (!key || !KEY_PATTERN.test(key)) {
									resp.writeHead(400, { 'Content-Type': 'text/plain' });
									resp.end('Invalid key format');
									return;
								}

								resp.writeHead(200, {
									'Content-Type': 'text/html; charset=utf-8',
								});
								resp.end(SUCCESS_HTML);

								clearTimeout(timer);
								server.close();
								res(key);
							},
						);
					});
				},
			});
		});

		server.on('error', (err) => {
			reject(err);
		});
	});
}
