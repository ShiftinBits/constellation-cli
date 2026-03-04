# constellation-cli

Local code parsing → AST generation → upload to Core. **NO source transmission.**

**Parent**: `../CLAUDE.md` | **ADR**: `../ADR.md`

## Quick Reference

| Task       | Command                                |
| ---------- | -------------------------------------- |
| Run        | `npm start`                            |
| Index      | `npm start -- index [--full\|--dirty]` |
| Init       | `npm start -- init [--skip-mcp]`       |
| Auth       | `npm start -- auth`                    |
| Build      | `npm run build`                        |
| Test       | `npm test` / `npm run test:coverage`   |
| Lint       | `npm run lint` / `npm run lint:fix`    |
| Type-check | `npm run type-check`                   |

**Requirements**: Node `>=24.0.0`, npm `>=11.0.0`

## Architecture

```
src/
├── index.ts              # CLI entry (Commander.js)
├── api/                  # ConstellationClient (NDJSON streaming, retry logic)
├── commands/             # init, auth, index (BaseCommand + manual DI)
├── config/               # constellation.json loader/validator
├── env/                  # CrossPlatformEnvironment (Windows: setx, Unix: shell rc)
├── hooks/                # AI tool hooks configuration (adapter pattern)
│   └── adapters/         # Tool-specific hook format generators (cursor.adapter.ts)
├── languages/            # LanguageRegistry, LanguageDetector
│   └── plugins/          # typescript.plugin.ts, javascript.plugin.ts
│       ├── build-config/ # ts-js-config-manager.ts (tsconfig/jsconfig parsing)
│       └── resolvers/    # ts-js-import-resolver.ts, workspace-package-resolver.ts
├── mcp/                  # MCP tool registry + config writer
├── parsers/              # SourceParser (Tree-sitter, size-adaptive)
├── scanners/             # FileScanner (.gitignore aware, symlink validation)
├── schemas/              # Zod AST validation
├── update/               # Version check, update prompts, cache
└── utils/                # PromisePool, GitClient, AST serializer/compressor
```

**Flow**: `Scan → Parse (Tree-sitter) → Serialize (no source) → Compress (gzip) → Base64 → Upload`

## Language Support

| Language   | Status      | Extensions |
| ---------- | ----------- | ---------- |
| TypeScript | ✓           | .ts, .tsx  |
| JavaScript | ✓           | .js, .jsx  |
| Python     | CLI parsing | .py, .pyi  |

Plugins: `src/languages/plugins/{typescript,javascript,python}.plugin.ts`

12 languages defined in `ParserLanguage` type (`src/languages/language.registry.ts`), only TS/JS implemented.

## Critical Patterns

### Privacy-Preserving AST

`src/utils/ast-serializer.ts` — `TEXT_INCLUDED_TYPES` (`ReadonlySet<string>`, single source of truth used by both streaming and legacy serializers). Only these node types include text:

- Identifiers: `identifier`, `property_identifier`, `type_identifier`, `shorthand_property_identifier`
- Literals: `string`, `number`, `true`, `false`, `null`, `undefined`
- Keywords: `*_keyword`, `*_operator`
- Modifiers: `accessibility_modifier`, `readonly`, `static`, `async`, `const`, `let`, `var`
- Decorators: `decorator`
- Type annotations: `type_annotation`, `return_type`, `type_arguments`, `generic_type`, etc.

**Never transmitted**: function bodies, comments, source code

### Field Name Workaround (`src/utils/ast-serializer.ts`)

`getCommonFieldNames()` returns field-to-node-type mappings as a Tree-sitter workaround. Fields are organized by language (`JS_TS_FIELD_NAMES`, `PYTHON_FIELD_NAMES`) and merged via `mergeFieldMaps()` into `COMMON_FIELD_NAMES` at module load. Missing entries cause **silent failures** in Core type extraction, inheritance detection, etc.

### Command DI (`src/commands/command.deps.ts`)

Manual DI without framework. Commands extend `BaseCommand`, receive only needed deps. Config loaded lazily — only `index` command needs it (see `src/index.ts` index action).

### Adaptive Concurrency (`src/commands/index.command.ts`)

```typescript
const concurrency = totalFiles > 10000 ? 5 : totalFiles > 5000 ? 7 : 10;
```

Prevents OOM on large projects by reducing parallel file processing.

### Size-Adaptive Parsing (`src/parsers/source.parser.ts`)

| File Size | Strategy                                                    |
| --------- | ----------------------------------------------------------- |
| `<10MB`   | Async read → sync parse (1MB buffer)                        |
| `>10MB`   | 64KB chunk streaming (Tree-sitter sync callback limitation) |
| `>50MB`   | + progress reporting every 10%                              |

## Error Handling (`src/api/constellation-client.ts`)

| Error                 | Trigger | Behavior                                      |
| --------------------- | ------- | --------------------------------------------- |
| `AuthenticationError` | 401     | Never retry, propagate immediately            |
| `RetryableError`      | 5xx     | Exponential backoff: 1s→2s→4s + ±250ms jitter |
| `NotFoundError`       | 404     | Project not indexed yet                       |

Retry logic in `sendRequest()`: 3 attempts, auth errors skip retry entirely.

**Debug**: `DEBUG=* npm start -- index` | See `/cli-debugging` skill

## Import Resolution

CLI resolves path aliases locally (Core cannot access build configs):

| File                                                            | Purpose                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| `src/languages/plugins/resolvers/ts-js-import-resolver.ts`      | tsconfig/jsconfig path alias resolution |
| `src/languages/plugins/resolvers/workspace-package-resolver.ts` | Monorepo workspace package resolution   |
| `src/languages/plugins/build-config/ts-js-config-manager.ts`    | Config discovery and parsing            |

**Resolution priority**: Workspace packages → path aliases → baseUrl → relative imports. Workspace-first is critical — prevents monorepo packages from being treated as external.

## Validation (`src/schemas/ast.schema.ts`)

Zod validates all AST data before transmission:

- File path length capped at 1000 chars
- Base64 AST capped at 10MB
- Commit must be valid SHA-1 (40 hex chars)
- Language must match `ParserLanguage` enum
- Import resolutions typed: `relative | workspace | alias | external | builtin`

## Type Sync

Shared types via `@constellationdev/types` package (GitHub: `ShiftinBits/constellation-types#main`). Local dev uses `npm link`; CI uses GitHub source. See `../CLAUDE.md` Section 3 and `/syncing-constellation-types` skill.

## Testing

```
test/
├── unit/           # Mirrors src/ structure (includes hooks/, mcp/)
├── fixtures/       # Sample code + configs for tests
├── helpers/        # test-utils.ts (createTempDir, createTestFile, cleanupTempDir)
└── setup.ts        # Jest config, ESM mocks
```

**Coverage target**: 50%+ | **Test naming**: `{name}.test.ts` (in test/unit/)

**Key test files**:

- `test/unit/mcp/config-writer.test.ts` — MCP server configuration
- `test/unit/hooks/hooks-writer.test.ts` — Hooks file I/O and merging
- `test/unit/hooks/adapters/cursor.adapter.test.ts` — Cursor hook format generation

## File Conventions

| Pattern             | Purpose               |
| ------------------- | --------------------- |
| `{name}.command.ts` | CLI commands          |
| `{name}.parser.ts`  | Parsers               |
| `{name}.plugin.ts`  | Language plugins      |
| `{name}.test.ts`    | Tests (in test/unit/) |

**Imports**: Relative paths only (no `@` aliases) | **Module**: ESM (`"type": "module"`)

## Index Flags

| Flag      | Effect                                      |
| --------- | ------------------------------------------- |
| `--full`  | Re-index entire project                     |
| `--dirty` | Skip git validation (branch + working tree) |

`--incremental` is the default when previous index exists.

See `/cli-indexing-workflow` skill for complete guide.

## AI Tool Configuration

The `init` command configures AI coding assistants in two phases:

1. **MCP Server Configuration** — Adds Constellation MCP server to tool config files
2. **Hooks Configuration** — Injects Constellation awareness prompts (tools that support hooks)

### MCP Configuration (`src/mcp/`)

| File               | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `tool-registry.ts` | `AI_TOOLS[]` array defining 11 supported tools and their config paths |
| `config-writer.ts` | `ConfigWriter` class for reading/merging/writing tool configs         |
| `types.ts`         | `AITool` interface with `hooksConfig` for hook-enabled tools          |

### Hooks Configuration (`src/hooks/`)

Hooks inject Constellation guidance into AI assistants at lifecycle events (session start, subagent spawn, context compaction). Only tools with `hooksConfig` in their `AITool` definition get hooks configured.

| File                | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `types.ts`          | `CanonicalHook`, `HookAdapter`, `ToolHooksConfig` interfaces                            |
| `hooks-registry.ts` | `CONSTELLATION_HOOKS[]` — canonical hook definitions with `{MCP_TOOL_NAME}` placeholder |
| `hooks-writer.ts`   | `HooksWriter` class for hook file I/O and config merging                                |
| `adapters/*.ts`     | Tool-specific format generators (event name mapping, MCP tool name substitution)        |

**Adapter pattern**: Canonical events (PascalCase: `SessionStart`) map to tool-specific events (Cursor uses camelCase: `sessionStart`). Each adapter also substitutes the `{MCP_TOOL_NAME}` placeholder with the tool's MCP naming convention.

**Adding hook support for a new tool**:

1. Create adapter in `src/hooks/adapters/{tool}.adapter.ts` implementing `HookAdapter`
2. Register adapter in `src/hooks/adapters/index.ts`
3. Add `hooksConfig` to tool's entry in `src/mcp/tool-registry.ts`

**Currently supported**: Cursor (`.cursor/hooks.json`)

## Security

- **Symlink validation**: `src/scanners/file-scanner.ts` — `fs.realpath()` validates symlinks stay within project boundaries in `walkDirectory()`
- **Shell escaping**: `src/env/env-manager.ts` — `escapeShellValue()` escapes `\ ' " $ \`` for shell values; Windows uses `spawn()` without shell
- **Input validation**: `src/env/env-manager.ts` — `validateInput()` validates env var names (`/^[A-Z_][A-Z0-9_]*$/i`), rejects null bytes and newlines
- **CI auth blocked**: `auth` command rejects in CI environments (both `WindowsEnvironmentManager` and `UnixEnvironmentManager`) — use `CONSTELLATION_ACCESS_KEY` env var
- **AST validation**: Zod validates before transmission (`src/schemas/ast.schema.ts`)

## Gotchas

- **CI auth rejection**: `auth` exits with instructions for CI secrets
- **Missing config fallback**: If `constellation.json` missing extensions, language defaults used silently (see `LanguageRegistry` computed properties)
- **Incremental requires API**: Falls back to full index if API unreachable, except `AuthenticationError` which is re-thrown
- **Tree-sitter sync callback**: Large file parsing uses `fs.readSync` inside async callback — unavoidable due to Tree-sitter API (see `parseWithStream()`)
- **Path normalization**: All paths stored without leading `./` via `normalizeGraphPath()` in `src/utils/path.utils.ts`
- **POSIX paths only**: Use `toPosixPath()` for cross-platform compatibility (`src/utils/path.utils.ts`)
- **Field name registry**: Missing entries in `getCommonFieldNames()` cause silent Core extraction failures — add new language fields to the appropriate `*_FIELD_NAMES` map in `ast-serializer.ts` (auto-merged into `COMMON_FIELD_NAMES`)

## Extended Docs

See `../CLAUDE.md` Section 9 for workspace architecture, ADRs, and troubleshooting.
