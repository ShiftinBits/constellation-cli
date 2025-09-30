/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src', '<rootDir>/test'],
	testMatch: ['**/*.test.ts', '**/*.spec.ts'],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
		'!src/index.ts', // CLI entry point
		'!src/types/**', // Type definitions
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	coverageThreshold: {
		global: {
			branches: 70,
			functions: 70,
			lines: 75,
			statements: 75,
		},
	},
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@test/(.*)$': '<rootDir>/test/$1',
	},
	setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
	testTimeout: 10000,
	verbose: true,
	transform: {
		'^.+\\.tsx?$': 'ts-jest',
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
	transformIgnorePatterns: [
		'node_modules/(?!(@scure/base)/)',
	],
};