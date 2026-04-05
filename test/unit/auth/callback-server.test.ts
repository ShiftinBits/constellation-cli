import { describe, it, expect, afterEach } from '@jest/globals';
import {
	startCallbackServer,
	type CallbackServerResult,
} from '../../../src/auth/callback-server';

describe('callback-server', () => {
	let result: CallbackServerResult | undefined;

	afterEach(() => {
		if (result) {
			result.close();
			result = undefined;
		}
	});

	describe('startCallbackServer', () => {
		it('should return an object with a numeric port and waitForCallback function', async () => {
			result = await startCallbackServer();

			expect(typeof result.port).toBe('number');
			expect(result.port).toBeGreaterThan(0);
			expect(typeof result.waitForCallback).toBe('function');
		});
	});

	describe('valid callback', () => {
		it('should resolve with the key when state and key are valid', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce');

			const resp = await fetch(
				`http://127.0.0.1:${result.port}/callback?key=ak:00112233445566778899aabbccddeeff&state=test-nonce`,
			);

			expect(resp.status).toBe(200);
			expect(resp.headers.get('content-type')).toContain('text/html');

			const key = await promise;
			expect(key).toBe('ak:00112233445566778899aabbccddeeff');
		});
	});

	describe('state mismatch', () => {
		it('should respond 400 and not resolve the promise', async () => {
			result = await startCallbackServer();
			let resolved = false;
			const promise = result.waitForCallback('correct-state', 500).then((k) => {
				resolved = true;
				return k;
			});

			const resp = await fetch(
				`http://127.0.0.1:${result.port}/callback?key=ak:00112233445566778899aabbccddeeff&state=wrong`,
			);
			expect(resp.status).toBe(400);

			// Give a tick to confirm promise did not resolve
			await new Promise((r) => setTimeout(r, 50));
			expect(resolved).toBe(false);

			// Let the timeout reject so the server closes
			await expect(promise).rejects.toThrow('Authentication timed out');
		});
	});

	describe('invalid key format', () => {
		it('should respond 400 when key does not match pattern', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce', 500);

			const resp = await fetch(
				`http://127.0.0.1:${result.port}/callback?key=badkey&state=test-nonce`,
			);
			expect(resp.status).toBe(400);

			await expect(promise).rejects.toThrow('Authentication timed out');
		});
	});

	describe('missing params', () => {
		it('should respond 400 when query params are missing', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce', 500);

			const resp = await fetch(`http://127.0.0.1:${result.port}/callback`);
			expect(resp.status).toBe(400);

			await expect(promise).rejects.toThrow('Authentication timed out');
		});
	});

	describe('non-callback path', () => {
		it('should respond 404 for unknown paths', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce', 500);

			const resp = await fetch(`http://127.0.0.1:${result.port}/other`);
			expect(resp.status).toBe(404);

			await expect(promise).rejects.toThrow('Authentication timed out');
		});
	});

	describe('timeout', () => {
		it('should reject with timeout error when no valid callback arrives', async () => {
			result = await startCallbackServer();
			await expect(result.waitForCallback('x', 100)).rejects.toThrow(
				'Authentication timed out',
			);
		});
	});

	describe('return_url redirect', () => {
		it('should respond with 302 redirect when return_url is provided', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce');

			const resp = await fetch(
				`http://127.0.0.1:${result.port}/callback?key=ak:00112233445566778899aabbccddeeff&state=test-nonce&return_url=${encodeURIComponent('http://localhost:4200/auth/cli?success=true')}`,
				{ redirect: 'manual' },
			);

			expect(resp.status).toBe(302);
			expect(resp.headers.get('location')).toBe(
				'http://localhost:4200/auth/cli?success=true',
			);

			const key = await promise;
			expect(key).toBe('ak:00112233445566778899aabbccddeeff');
		});

		it('should respond with HTML when return_url is not provided', async () => {
			result = await startCallbackServer();
			const promise = result.waitForCallback('test-nonce');

			const resp = await fetch(
				`http://127.0.0.1:${result.port}/callback?key=ak:00112233445566778899aabbccddeeff&state=test-nonce`,
			);

			expect(resp.status).toBe(200);
			expect(resp.headers.get('content-type')).toContain('text/html');
			await promise;
		});
	});

	describe('server lifecycle', () => {
		it('should close the server after a successful callback', async () => {
			result = await startCallbackServer();
			const { port } = result;
			const promise = result.waitForCallback('done-state');

			await fetch(
				`http://127.0.0.1:${port}/callback?key=ak:aabbccddeeff00112233445566778899&state=done-state`,
			);
			await promise;

			// Server should be closed — next fetch should fail
			await expect(
				fetch(`http://127.0.0.1:${port}/callback`),
			).rejects.toThrow();
			result = undefined; // already closed
		});
	});
});
