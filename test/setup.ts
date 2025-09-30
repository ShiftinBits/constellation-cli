import { jest, afterEach } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.CONSTELLATION_ENV = 'test';

// Increase timeout for integration tests
if (process.env.INTEGRATION_TEST) {
	jest.setTimeout(30000);
}

// Mock console methods to reduce noise in tests
global.console = {
	...console,
	log: jest.fn(),
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	// Keep error for debugging failed tests
	error: console.error,
};

// Clean up after each test
afterEach(() => {
	jest.clearAllMocks();
	jest.restoreAllMocks();
});