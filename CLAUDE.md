# constellation-cli

**Role**: Local code parsing, AST generation, upload to Core. NO source transmission.
**See**: `../CLAUDE.md` for workspace architecture, `../ADR.md` for privacy rationale.

## Purpose

Parse source code locally with Tree-sitter → Generate compressed AST → Upload to constellation-core → Never transmit source code.

## Architecture

```
Local Code → Tree-sitter Parser → AST → Compress (gzip) → Base64 → Upload to Core:3000
              ↑
         source.parser.ts
         language.registry.ts
```

**Security**: Source code NEVER leaves local machine. Only compressed AST metadata uploaded.

## Commands

**Development**:

```bash
npm start                      # Run CLI (tsx)
npm start -- index             # Index current directory
npm start -- index --full      # Full re-index (clear + reindex)
npm start -- init              # Initialize new project
npm start -- auth login        # Authenticate
npm run build                  # Build with tsup
```

**Testing**:

```bash
npm test                       # All tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage
npm run test:ci                # CI mode
```

**Code Quality**:

```bash
npm run lint                   # ESLint check
npm run lint:fix               # Auto-fix lint issues
npm run type-check             # TypeScript type checking
```

## Key Files

```
src/
├── commands/
│   ├── base.command.ts        # Base class with DI pattern
│   ├── command.deps.ts        # Dependency injection interface
│   ├── index.command.ts       # Main index command
│   ├── auth.command.ts        # Authentication
│   └── init.command.ts        # Project initialization
├── parsers/
│   └── source.parser.ts       # Tree-sitter AST parsing
├── languages/
│   ├── language.registry.ts   # Language parser registry
│   ├── language.detector.ts   # File extension → language mapping
│   └── plugins/
│       ├── base-plugin.ts     # Plugin interface
│       ├── javascript.plugin.ts
│       ├── typescript.plugin.ts
│       ├── build-config/      # tsconfig/jsconfig managers
│       └── resolvers/         # Import path resolution
├── config/
│   └── config.ts              # ConstellationConfig loader
├── env/
│   └── env-manager.ts         # Cross-platform env handling
├── schemas/
│   └── ast.schema.ts          # Zod validation schemas
├── types/
│   └── api.ts                 # API types (sync with Core)
├── api/
│   └── constellation-client.ts # HTTP client with NDJSON streaming
├── scanners/
│   └── file-scanner.ts        # File system scanning
├── utils/
│   ├── ast-compressor.ts      # gzip + base64 encoding
│   ├── ast-serializer.ts      # AST serialization
│   ├── git-client.ts          # Git operations
│   ├── promise-pool.ts        # Concurrent processing
│   └── ...                    # Other utilities
└── index.ts                   # CLI entry point (Commander.js)
```

## Parser Pattern

**SourceParser** parses files with Tree-sitter, handling large files with streaming:

```typescript
// src/parsers/source.parser.ts
export class SourceParser {
	constructor(private languageRegistry: LanguageRegistry) {}

	async parseFile(filePath: string, language: ParserLanguage): Promise<Tree> {
		const parser = this.languageRegistry.getParser(language);
		const stats = await FileUtils.getFileStats(filePath);

		// Small files: async read + sync parse
		if (stats.size <= LARGE_FILE_THRESHOLD) {
			const content = await FileUtils.readFile(filePath);
			return parser.parse(content);
		}
		// Large files (>10MB): streaming with 64KB chunks
		return this.parseWithStream(parser, filePath, stats.size);
	}
}
```

**Language Registry** manages Tree-sitter parsers and plugins:

```typescript
// src/languages/language.registry.ts
export class LanguageRegistry {
  private parsers: Map<ParserLanguage, Parser>;
  private plugins: Map<ParserLanguage, LanguagePlugin>;

  getParser(language: ParserLanguage): Parser { ... }
  getPlugin(language: ParserLanguage): LanguagePlugin | undefined { ... }
}
```

## AST Serialization (CRITICAL)

**Must strip all source code**:

```typescript
interface SerializedAST {
	symbols: Symbol[]; // ✓ Names, types, locations
	dependencies: Dependency[]; // ✓ Relationships
	structure: FileStructure; // ✓ Hierarchy
	// ✗ NO source code text
	// ✗ NO string literals
	// ✗ NO identifiable content
}
```

**Compression before upload**:

```typescript
const ast = parser.parse(code, 'typescript');
const json = JSON.stringify(ast);
const compressed = gzipSync(json);
const encoded = compressed.toString('base64');
// Upload encoded to Core
```

## Authentication

**Environment Variable** (required):

```bash
export CONSTELLATION_ACCESS_KEY=ak_00000000-...
export CONSTELLATION_API_URL=http://localhost:3000
```

**Auth Flow**:

1. `npm start -- auth login` → Opens browser, authenticates
2. Stores key in `~/.constellation/config.json`
3. CLI reads key from config or `$CONSTELLATION_ACCESS_KEY`
4. Sends as `Authorization: Bearer <key>` header

## Project Identification

**Automatic via git remote**:

```bash
# CLI automatically detects:
git remote get-url origin
# Normalizes to: github.com/org/repo
# Used as projectId
```

**Branch isolation**: Each git branch gets separate Neo4j namespace.

## Index Workflow

```bash
npm start -- index
```

**Steps**:

1. Scan: Find all supported files (.js, .ts, .jsx, .tsx)
2. Parse: Generate AST with source.parser.ts
3. Serialize: Strip source code, keep structure
4. Compress: gzip + base64 encode
5. Upload: POST to constellation-core:3000/api/v1/projects/{id}/ast
6. Core: Extracts intelligence, stores in Neo4j

**Flags**:

- `--full`: Clear existing data + full re-index
- `--dirty`: Skip git status check (useful for CI)
- `--watch`: Watch mode (re-index on file changes)
- `--concurrency N`: Parallel file processing (default: CPU cores)

## Type Sync (MANUAL)

**CLI types** (`src/types/api.ts`) must match Core DTOs:

```typescript
// Core: constellation-core/apps/client-api/src/dto/project-state.dto.ts
export interface ProjectState { ... }

// CLI: constellation-cli/src/types/api.ts (MUST MATCH)
export interface ProjectState { ... }
```

**Check sync**:

```bash
# See workspace CLAUDE.md Section 3 for diff command
```

## Error Handling

**Common Errors**:

- `PARSE_ERROR`: Invalid syntax, unsupported construct
- `AUTH_ERROR`: Missing/invalid CONSTELLATION_ACCESS_KEY
- `NETWORK_ERROR`: Cannot reach constellation-core:3000
- `VALIDATION_ERROR`: Invalid AST format

**Debug**:

```bash
DEBUG=* npm start -- index  # Verbose logging
npm start -- index --dry-run  # Parse but don't upload
```

## Language Support

**Currently Supported**:

- JavaScript (.js)
- TypeScript (.ts, .tsx)
- JSX (.jsx)

**Future** (via Tree-sitter grammars):

- Python, Go, Rust, Java, C#, etc.

**Add Language**:

1. Install Tree-sitter grammar: `npm install tree-sitter-{lang}`
2. Create plugin: `src/languages/plugins/{lang}.plugin.ts`
3. Register in `language.registry.ts`
4. Add to supported extensions

## Performance

**Optimization**:

- Concurrent parsing via `promise-pool.ts`
- Incremental indexing (only changed files)
- NDJSON streaming for large uploads
- Compression reduces payload 70-90%

**Configuration**:

- Concurrency: CPU cores (configurable via `--concurrency N`)
- Large file threshold: 10MB (uses streaming parser)
- Retry: Exponential backoff + jitter for 5xx errors

## File Conventions

**Naming**:

```
{name}.command.ts          CLI commands
{name}.parser.ts           Parsers
{name}.plugin.ts           Language plugins
{name}.spec.ts             Tests (co-located)
```

**Imports**:

```typescript
✓ import { X } from './utils/x';  // Relative paths OK (no @aliases)
✓ import Parser from 'tree-sitter';
✗ import { X } from 'src/utils/x';  // No absolute from src/
```

## Key Patterns

**Command Structure** (Commander.js with DI):

```typescript
// Base command with dependency injection
export abstract class BaseCommand {
	protected readonly git?: GitClient;
	protected readonly config?: ConstellationConfig;
	protected readonly langRegistry?: LanguageRegistry;

	constructor(deps: CommandDeps) {
		this.git = deps.GitClient;
		this.config = deps.Config;
		this.langRegistry = deps.LanguageRegistry;
	}

	abstract run(options: unknown): Promise<void>;
}

// CLI entry (src/index.ts)
program
	.command('index')
	.option('--full', 'Full re-index')
	.option('--dirty', 'Skip git status check')
	.action(async (options) => {
		const cmd = new IndexCommand(deps);
		await cmd.run(options);
	});
```

**Error Codes**: Same as Core (see workspace CLAUDE.md)

**Logging**: console.log/console.error (no winston in CLI)

## Import Resolution

CLI resolves import paths using plugin-based resolvers:

- tsconfig.json/jsconfig.json path aliases
- Monorepo workspace package resolution
- Relative and node_modules imports

**Plugins**:

- `src/languages/plugins/resolvers/ts-js-import-resolver.ts` - Path alias resolution
- `src/languages/plugins/resolvers/workspace-package-resolver.ts` - Monorepo support
- `src/languages/plugins/build-config/ts-js-config-manager.ts` - Config parsing

## API Client

**Features**:

- NDJSON streaming for large AST uploads
- Automatic retry with exponential backoff + jitter (5xx errors)
- Configurable timeouts with AbortController
- Detailed network error diagnostics (errno, syscall, address, port)

**Custom Errors**:

- `AuthenticationError`: Invalid or missing API key
- `RetryableError`: Temporary failures (auto-retry)
- `NotFoundError`: Resource not found

## Extended Docs

- `../CLAUDE.md` - Workspace architecture, Neo4j access, type sync
- `../TROUBLESHOOTING.md` - Error codes: PARSE_ERROR, AUTH_ERROR, NETWORK_ERROR
- `../COMMANDS.md` - Full CLI command reference
- `../ADR.md` - ADR-001 (Privacy), ADR-007 (Tree-sitter), ADR-011 (Commander), ADR-015 (Compression)
