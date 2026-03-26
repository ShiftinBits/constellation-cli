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
│   └── adapters/         # Tool-specific hook format generators (cursor, cline, gemini)
├── languages/            # LanguageRegistry, LanguageDetector
│   └── plugins/          # typescript.plugin.ts, javascript.plugin.ts, python.plugin.ts
│       ├── build-config/ # ts-js-config-manager.ts (tsconfig/jsconfig parsing)
│       └── resolvers/    # ts-js-import-resolver.ts, python-import-resolver.ts, workspace-package-resolver.ts
├── mcp/                  # MCP tool registry + config writer
├── parsers/              # SourceParser (Tree-sitter, size-adaptive)
├── scanners/             # FileScanner (.gitignore aware, symlink validation)
├── schemas/              # Zod AST validation
├── update/               # Version check, update prompts, cache
└── utils/
    ├── ast-serializer.ts     # AST→JSON with privacy filtering
    ├── ast-compressor.ts     # gzip compression
    ├── ndjson-streamwriter.ts # Backpressure-aware NDJSON Readable stream
    ├── import-extractor.ts   # Import metadata extraction (visitor pattern)
    ├── import-handlers/      # Per-language import node processors
    ├── language-configs/     # Per-language serialization rules (text types, field names)
    ├── environment-detector.ts # CI/TTY detection
    ├── promise-pool.ts       # Concurrency limiter
    ├── git-client.ts         # Git operations via simple-git
    └── path.utils.ts         # POSIX normalization, graph path helpers
```

**Flow**: `Scan → Parse (Tree-sitter) → Serialize (no source) → Compress (gzip) → NDJSON stream → Upload`

## Language Support

| Language   | Status      | Extensions |
| ---------- | ----------- | ---------- |
| TypeScript | ✓           | .ts, .tsx  |
| JavaScript | ✓           | .js, .jsx  |
| Python     | CLI parsing | .py, .pyi  |

Plugins: `src/languages/plugins/{typescript,javascript,python}.plugin.ts`

12 languages defined in `ParserLanguage` type (`src/languages/language.registry.ts`), only TS/JS/Python have plugins.

## Critical Patterns

### Privacy-Preserving AST

`src/utils/ast-serializer.ts` — `TEXT_INCLUDED_TYPES` (`ReadonlySet<string>`, used by both streaming and legacy serializers). Only identifiers, keywords, operators, literals, type annotations, and modifiers include text. **Never transmitted**: function bodies, comments, source code.

Per-language overrides in `src/utils/language-configs/` — `LanguageSerializerConfig` interface controls which node types preserve text and which Tree-sitter field names are tracked per language.

### Language Config System (`src/utils/language-configs/`)

Centralized language-specific serialization rules extracted from `ast-serializer.ts`:

| File                   | Contents                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| `types.ts`             | `LanguageSerializerConfig` interface                                          |
| `javascript.config.ts` | JS/TS text types + `JS_TS_FIELD_NAMES`                                        |
| `python.config.ts`     | Python text types + `PYTHON_FIELD_NAMES`                                      |
| `index.ts`             | `getLanguageConfig()`, `getTextIncludedTypes()`, `getFieldNamesForLanguage()` |

The serializer uses language-specific configs when language is known, falls back to merged `COMMON_FIELD_NAMES` (in `ast-serializer.ts`) when unknown.

**Adding a new language**: Create `{lang}.config.ts` with `LanguageSerializerConfig`, register in `LANGUAGE_CONFIGS` map in `index.ts`.

### Field Name Registry (`src/utils/ast-serializer.ts`)

`getCommonFieldNames()` returns field-to-node-type mappings as a Tree-sitter workaround. `COMMON_FIELD_NAMES` merges `JS_TS_FIELD_NAMES` + `PYTHON_FIELD_NAMES` via `mergeFieldMaps()`. Missing entries cause **silent failures** in Core type extraction, inheritance detection, etc.

### Import Extraction (`src/utils/import-extractor.ts` + `import-handlers/`)

Visitor pattern over AST to extract import metadata without modifying the tree:

| File                            | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `import-extractor.ts`           | `ImportExtractor` class — walks AST, dispatches to handlers               |
| `import-handlers/types.ts`      | `ImportNodeProcessor`, `ImportTypeClassifier`, `LanguageImportHandlers`   |
| `import-handlers/javascript.ts` | JS/TS import node processors                                              |
| `import-handlers/python.ts`     | Python import node processors                                             |
| `import-handlers/utils.ts`      | `resolveAndStore()`, `isExternalPackage()`, `defaultClassifyImportType()` |
| `import-handlers/index.ts`      | `DEFAULT_HANDLERS` registry (JS, TS, Python)                              |

Handler factories: `createJavaScriptHandlers()`, `createTypeScriptHandlers()`, `createPythonHandlers()` — each returns `LanguageImportHandlers` with a `Map<nodeType, processor>`.

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

### NDJSON Streaming (`src/utils/ndjson-streamwriter.ts`)

`NdJsonStreamWriter<T>` extends `Readable` — wraps async generators with Node.js backpressure. Data never fully loaded in memory. Used for AST upload to API.

## Error Handling (`src/api/constellation-client.ts`)

| Error                    | Trigger      | Behavior                                                                                |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------- |
| `AuthenticationError`    | 401          | Never retry, propagate immediately                                                      |
| `RetryableError`         | 5xx          | Exponential backoff: 1s→2s→4s + ±250ms jitter                                           |
| `NotFoundError`          | 404          | Project not indexed yet                                                                 |
| `ProjectValidationError` | Custom codes | `PROJECT_NOT_REGISTERED`, `PROJECT_INACTIVE`, `INVALID_PROJECT_ID`, `PROJECT_NOT_FOUND` |

Retry logic in `sendRequest()`: 3 attempts, auth errors skip retry entirely.

**Debug**: `DEBUG=* npm start -- index` | See `/cli-debugging` skill

## Import Resolution

CLI resolves path aliases locally (Core cannot access build configs):

| File                                                            | Purpose                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| `src/languages/plugins/resolvers/ts-js-import-resolver.ts`      | tsconfig/jsconfig path alias resolution |
| `src/languages/plugins/resolvers/python-import-resolver.ts`     | Python module resolution                |
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
├── unit/           # Mirrors src/ structure
├── integration/    # Vertical slice tests (e.g., python-vertical-slice.test.ts)
├── fixtures/       # Sample code + configs for tests
├── helpers/        # test-utils.ts (createTempDir, createTestFile, cleanupTempDir)
└── setup.ts        # Jest config, ESM mocks, console mocking
```

**Coverage target**: 50%+ | **Test naming**: `{name}.test.ts` (in test/unit/)

## File Conventions

| Pattern             | Purpose               |
| ------------------- | --------------------- |
| `{name}.command.ts` | CLI commands          |
| `{name}.parser.ts`  | Parsers               |
| `{name}.plugin.ts`  | Language plugins      |
| `{name}.adapter.ts` | Hook adapters         |
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

**Supported tools**: Claude Code, Cline, Codex CLI, Copilot CLI, Cursor, Gemini CLI, JetBrains, Kilo Code, OpenCode, Tabnine, VSCode

### Hooks Configuration (`src/hooks/`)

Hooks inject Constellation guidance into AI assistants at lifecycle events (session start, subagent spawn, context compaction). Only tools with `hooksConfig` in their `AITool` definition get hooks configured.

| File                | Purpose                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `types.ts`          | `CanonicalHook`, `HookAdapter`, `ToolHooksConfig` interfaces                              |
| `hooks-registry.ts` | `CONSTELLATION_HOOKS[]` — 3 canonical hook definitions with `{MCP_TOOL_NAME}` placeholder |
| `hooks-writer.ts`   | `HooksWriter` class for hook file I/O and config merging                                  |
| `adapters/*.ts`     | Tool-specific format generators (event name mapping, MCP tool name substitution)          |

**Adapter pattern**: Canonical events (PascalCase: `SessionStart`) map to tool-specific events. Each adapter substitutes the `{MCP_TOOL_NAME}` placeholder with the tool's MCP naming convention.

| Adapter | Config Output           | Auxiliary Files                       | MCP Tool Name               |
| ------- | ----------------------- | ------------------------------------- | --------------------------- |
| Cursor  | `.cursor/hooks.json`    | None                                  | `constellation__code_intel` |
| Cline   | _(empty, scripts only)_ | `.clinerules/hooks/*.sh` bash scripts | `code_intel`                |
| Gemini  | `.gemini/settings.json` | `.gemini/hooks/*.sh` bash scripts     | `code_intel`                |

**Adding hook support for a new tool**:

1. Create adapter in `src/hooks/adapters/{tool}.adapter.ts` implementing `HookAdapter`
2. Register in `ADAPTERS` map in `src/hooks/adapters/index.ts`
3. Add `hooksConfig` to tool's entry in `src/mcp/tool-registry.ts`

## Security

- **Symlink validation**: `src/scanners/file-scanner.ts` — `fs.realpath()` validates symlinks stay within project boundaries in `walkDirectory()`
- **Shell escaping**: `src/env/env-manager.ts` — `escapeShellValue()` escapes `\ ' " $ \`` for shell values; Windows uses `spawn()` without shell
- **Input validation**: `src/env/env-manager.ts` — `validateInput()` validates env var names (`/^[A-Z_][A-Z0-9_]*$/i`), rejects null bytes and newlines
- **CI auth blocked**: `auth` command rejects in CI environments — use `CONSTELLATION_ACCESS_KEY` env var
- **AST validation**: Zod validates before transmission (`src/schemas/ast.schema.ts`)

## Gotchas

- **CI auth rejection**: `auth` exits with instructions for CI secrets
- **Missing config fallback**: If `constellation.json` missing extensions, language defaults used silently (see `LanguageRegistry` computed properties)
- **Incremental requires API**: Falls back to full index if API unreachable, except `AuthenticationError` which is re-thrown
- **Tree-sitter sync callback**: Large file parsing uses `fs.readSync` inside async callback — unavoidable due to Tree-sitter API (see `parseWithStream()` in `source.parser.ts`)
- **Path normalization**: All paths stored without leading `./` via `normalizeGraphPath()` in `src/utils/path.utils.ts`
- **POSIX paths only**: Use `toPosixPath()` for cross-platform compatibility (`src/utils/path.utils.ts`)
- **Field name registry**: Missing entries in language config `fieldNames` cause silent Core extraction failures — add new language fields to the appropriate config in `src/utils/language-configs/`
- **Dual field name locations**: Field names exist in both `ast-serializer.ts` (merged `COMMON_FIELD_NAMES`) and `language-configs/` (per-language). Keep both in sync when modifying.
- **Auxiliary hook files**: Cline and Gemini adapters generate executable bash scripts, not just JSON config — `generateAuxiliaryFiles()` method

## Extended Docs

See `../CLAUDE.md` Section 9 for workspace architecture, ADRs, and troubleshooting.
