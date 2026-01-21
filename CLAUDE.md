# constellation-cli

Local code parsing → AST generation → upload to Core. **NO source transmission.**

**Parent**: `../CLAUDE.md` | **ADR**: `../ADR.md`

## Quick Reference

| Task       | Command                                         |
| ---------- | ----------------------------------------------- |
| Run        | `npm start`                                     |
| Index      | `npm start -- index [--full\|--dirty\|--watch]` |
| Init       | `npm start -- init [--skip-mcp]`                |
| Auth       | `npm start -- auth`                             |
| Build      | `npm run build`                                 |
| Test       | `npm test` / `npm run test:coverage`            |
| Lint       | `npm run lint` / `npm run lint:fix`             |
| Type-check | `npm run type-check`                            |

**Requirements**: Node `>=24.0.0`, npm `>=11.0.0`

## Architecture

```
src/
├── index.ts              # CLI entry (Commander.js)
├── api/                  # ConstellationClient (NDJSON streaming, retry logic)
├── commands/             # init, auth, index (BaseCommand + manual DI)
├── config/               # constellation.json loader/validator
├── env/                  # CrossPlatformEnvironment (Windows: setx, Unix: shell rc)
├── languages/            # LanguageRegistry, LanguageDetector
│   └── plugins/          # typescript.plugin.ts, javascript.plugin.ts
│       ├── build-config/ # ts-js-config-manager.ts (tsconfig/jsconfig parsing)
│       └── resolvers/    # ts-js-import-resolver.ts, workspace-package-resolver.ts
├── mcp/                  # MCP tool registry + config writer
├── parsers/              # SourceParser (Tree-sitter, size-adaptive)
├── scanners/             # FileScanner (.gitignore aware, symlink validation)
├── schemas/              # Zod AST validation
├── types/                # api.ts (must sync with Core DTOs)
├── update/               # Version check, update prompts, cache
└── utils/                # PromisePool, GitClient, AST serializer/compressor
```

**Flow**: `Scan → Parse (Tree-sitter) → Serialize (no source) → Compress (gzip) → Base64 → Upload`

## Language Support

| Language   | Status | Extensions |
| ---------- | ------ | ---------- |
| TypeScript | ✓      | .ts, .tsx  |
| JavaScript | ✓      | .js, .jsx  |

Plugins: `src/languages/plugins/{typescript,javascript}.plugin.ts`

## Critical Patterns

### Privacy-Preserving AST

`src/utils/ast-serializer.ts:210-255` - Only these node types include text:

- Identifiers: `identifier`, `property_identifier`, `type_identifier`, `shorthand_property_identifier`
- Literals: `string`, `number`, `true`, `false`, `null`, `undefined`
- Keywords: `*_keyword`, `*_operator`
- Modifiers: `accessibility_modifier`, `readonly`, `static`, `async`, `const`, `let`, `var`
- Decorators: `decorator`

**Never transmitted**: function bodies, comments, source code

### Command DI (`src/commands/command.deps.ts:11-22`)

Manual DI without framework. Commands extend `BaseCommand`, receive only needed deps. Config loaded lazily (only `index` needs it).

### Adaptive Concurrency (`src/commands/index.command.ts:456`)

```typescript
const concurrency = totalFiles > 10000 ? 5 : totalFiles > 5000 ? 7 : 10;
```

Prevents OOM on large projects by reducing parallel file processing.

### Size-Adaptive Parsing (`src/parsers/source.parser.ts:41-58`)

| File Size | Strategy                                                    |
| --------- | ----------------------------------------------------------- |
| `<10MB`   | Async read → sync parse                                     |
| `>10MB`   | 64KB chunk streaming (Tree-sitter sync callback limitation) |
| `>50MB`   | + progress reporting every 10%                              |

## Error Handling (`src/api/constellation-client.ts:321-347`)

| Error                 | Trigger | Behavior                                      |
| --------------------- | ------- | --------------------------------------------- |
| `AuthenticationError` | 401     | Never retry, propagate immediately            |
| `RetryableError`      | 5xx     | Exponential backoff: 1s→2s→4s + ±250ms jitter |
| `NotFoundError`       | 404     | Project not indexed yet                       |

**Debug**: `DEBUG=* npm start -- index` | See `/cli-debugging` skill

## Import Resolution

CLI resolves path aliases locally (Core cannot access build configs):

| File                                                            | Purpose                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| `src/languages/plugins/resolvers/ts-js-import-resolver.ts`      | tsconfig/jsconfig path alias resolution |
| `src/languages/plugins/resolvers/workspace-package-resolver.ts` | Monorepo workspace package resolution   |
| `src/languages/plugins/build-config/ts-js-config-manager.ts`    | Config discovery and parsing            |

## Type Sync

`src/types/api.ts` must match Core DTOs. See `../CLAUDE.md` Section 3 and `/syncing-constellation-types` skill.

## Testing

```
test/
├── unit/           # Mirrors src/ structure
├── fixtures/       # Sample code for tests
├── helpers/        # test-utils.ts
└── setup.ts        # Jest config, ESM mocks
```

**Coverage target**: 50%+

## File Conventions

| Pattern             | Purpose               |
| ------------------- | --------------------- |
| `{name}.command.ts` | CLI commands          |
| `{name}.parser.ts`  | Parsers               |
| `{name}.plugin.ts`  | Language plugins      |
| `{name}.test.ts`    | Tests (in test/unit/) |

**Imports**: Relative paths only (no `@` aliases)

## Index Flags

| Flag              | Effect                                      |
| ----------------- | ------------------------------------------- |
| `--full`          | Re-index entire project                     |
| `--dirty`         | Skip git validation (branch + working tree) |
| `--watch`         | Continuous indexing (not yet implemented)   |
| `--concurrency N` | Override concurrency limit                  |

See `/cli-indexing-workflow` skill for complete guide.

## Security

- **Symlink validation**: `src/scanners/file-scanner.ts:287-300` - `fs.realpath()` validates symlinks stay within project
- **Shell escaping**: `src/env/env-manager.ts:97-140` - Uses `spawn()` without shell, escapes special chars
- **CI auth blocked**: `auth` command rejects in CI environments—use `CONSTELLATION_ACCESS_KEY` env var

## Gotchas

- **CI auth rejection**: `auth` exits with instructions for CI secrets
- **Missing config fallback**: If `constellation.json` missing extensions, defaults used silently
- **Incremental requires API**: Falls back to full index if API unreachable (except `AuthenticationError`)
- **Tree-sitter sync callback**: Large file parsing uses `fs.readSync` inside async callback
- **Path normalization**: All paths stored without leading `./` via `normalizeGraphPath()`
- **POSIX paths only**: Use `toPosixPath()` for cross-platform compatibility

## Extended Docs

See `../CLAUDE.md` Section 9 for workspace architecture, ADRs, and troubleshooting.
