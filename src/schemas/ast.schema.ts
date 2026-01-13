import { z } from 'zod';

/**
 * Zod schema for validating serialized AST data before transmission.
 * Ensures data structure is correct without expensive content inspection.
 */

// Import resolution schema
const ImportResolutionSchema = z.object({
	source: z.string().min(1, 'Import source cannot be empty'),
	resolvedPath: z.string().optional(),
	isExternal: z.boolean(),
	importType: z.enum(['relative', 'workspace', 'alias', 'external', 'builtin']),
});

// Import resolution metadata - map of line numbers to resolutions
const ImportResolutionMetadataSchema = z.record(
	z.string(), // line number as string
	ImportResolutionSchema,
);

// Validate the shape of serialized AST data
export const SerializedASTSchema = z.object({
	// File path validation
	file: z
		.string()
		.min(1, 'File path cannot be empty')
		.max(1000, 'File path too long'),

	// Language validation - must match ParserLanguage type
	language: z
		.string()
		.regex(
			/^(bash|c|c-sharp|cpp|go|java|javascript|json|php|python|ruby|typescript)$/,
			'Invalid language identifier',
		),

	// Git commit hash validation - must be valid SHA-1
	commit: z.string().regex(/^[a-f0-9]{40}$/, 'Invalid git commit hash'),

	// ISO timestamp validation
	timestamp: z.string().datetime({ message: 'Invalid ISO timestamp' }),

	// Base64-encoded compressed AST validation
	ast: z
		.string()
		.min(1, 'AST data cannot be empty')
		.max(10_000_000, 'AST data exceeds 10MB limit'), // ~10MB base64

	// Optional import resolutions from CLI
	importResolutions: ImportResolutionMetadataSchema.optional(),
});

// Type inference for TypeScript
export type ValidatedSerializedAST = z.infer<typeof SerializedASTSchema>;
