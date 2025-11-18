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
npm run dev                    # Development mode
```

**Testing**:
```bash
npm test                       # All tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage
npm run test:ci                # CI mode
```

## Key Files

```
src/
├── commands/
│   ├── index.command.ts       Main index command
│   ├── auth.command.ts        Authentication
│   ├── init.command.ts        Project initialization
│   └── base.command.ts        Base class for commands
├── parsers/
│   └── source.parser.ts       SourceParser class (NOT base-parser!)
├── languages/
│   ├── language.registry.ts   Language plugin registry
│   └── plugins/               JS/TS language plugins
├── types/
│   └── api.ts                 API types (sync with Core manually)
├── utils/
│   └── promise-pool.ts        Concurrent processing (NOT worker-pool!)
├── scanners/                  File system scanning
├── extractors/                AST extraction logic
├── api/                       HTTP client for Core API
└── index.ts                   CLI entry point
```

## Parser Pattern

**SourceParser** (NOT base-parser):
```typescript
// src/parsers/source.parser.ts
export class SourceParser {
  parse(sourceCode: string, language: Language): SerializedAST {
    const tree = this.languageRegistry.parse(sourceCode, language);
    const ast = this.extractAST(tree);
    return this.serialize(ast);  // NO source code in output
  }
}
```

**Language Registry**:
```typescript
// src/languages/language.registry.ts
export class LanguageRegistry {
  private parsers: Map<Language, TreeSitterParser>;

  parse(code: string, lang: Language): Tree {
    const parser = this.parsers.get(lang);
    return parser.parse(code);
  }
}
```

## AST Serialization (CRITICAL)

**Must strip all source code**:
```typescript
interface SerializedAST {
  symbols: Symbol[];           // ✓ Names, types, locations
  dependencies: Dependency[];  // ✓ Relationships
  structure: FileStructure;    // ✓ Hierarchy
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
- Concurrent parsing via promise-pool.ts (NOT worker-pool)
- Incremental indexing (only changed files)
- Batch uploads (multiple files per request)
- Compression reduces payload 70-90%

**Tuning**:
```typescript
// src/config/constants.ts
export const INDEX_BATCH_SIZE = 50;  // Files per upload
export const MAX_CONCURRENCY = os.cpus().length;
```

## File Conventions

**Naming**:
```
{name}.command.ts          Oclif commands
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

**Command Structure** (Oclif):
```typescript
export default class IndexCommand extends BaseCommand {
  static description = 'Index project';
  static flags = { full: Flags.boolean() };

  async run(): Promise<void> {
    const { flags } = await this.parse(IndexCommand);
    // Command logic
  }
}
```

**Error Codes**: Same as Core (see workspace CLAUDE.md)

**Logging**: console.log/console.error (no winston in CLI)

## Extended Docs

- `../CLAUDE.md` - Workspace architecture, Neo4j access, type sync
- `../TROUBLESHOOTING.md` - Error codes: PARSE_ERROR, AUTH_ERROR, NETWORK_ERROR
- `../COMMANDS.md` - Full CLI command reference
- `../ADR.md` - ADR-001 (Privacy), ADR-007 (Tree-sitter), ADR-011 (Oclif), ADR-015 (Compression)
