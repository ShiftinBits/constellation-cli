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

| Task       | Command                                         |
| ---------- | ----------------------------------------------- |
| Run CLI    | `npm start`                                     |
| Index      | `npm start -- index [--full\|--dirty\|--watch]` |
| Init       | `npm start -- init`                             |
| Auth       | `npm start -- auth login`                       |
| Build      | `npm run build`                                 |
| Test       | `npm test` / `npm run test:coverage`            |
| Lint       | `npm run lint` / `npm run lint:fix`             |
| Type-check | `npm run type-check`                            |

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

Set `CONSTELLATION_ACCESS_KEY` env var or run `npm start -- auth login`.

See `/cli-auth-setup` skill for complete authentication guide.

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

**Pipeline**: Scan → Parse → Serialize → Compress → Upload → Store

**Flags**: `--full` (re-index all), `--dirty` (skip git check), `--watch` (continuous), `--concurrency N`

See `/cli-indexing-workflow` skill for complete indexing guide.

## Type Sync

CLI types (`src/types/api.ts`) must match Core DTOs. See `../CLAUDE.md` Section 3 and `/syncing-constellation-types` skill.

## Error Handling

**Codes**: `PARSE_ERROR` | `AUTH_ERROR` | `NETWORK_ERROR` | `VALIDATION_ERROR`

**Debug**: `DEBUG=* npm start -- index` or `--dry-run` flag

See `/cli-debugging` skill for troubleshooting guide.

## Language Support

**Current**: JavaScript (.js), TypeScript (.ts, .tsx), JSX (.jsx)

**Future**: Python, Go, Rust, Java, C# (via Tree-sitter grammars)

See `/implementing-language-support` skill for adding new languages.

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

See `../CLAUDE.md` Section 9 for complete documentation reference (workspace architecture, ADRs, troubleshooting).
