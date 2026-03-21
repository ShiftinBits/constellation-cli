---
name: cli-indexing-workflow
description: Indexes a codebase with the CLI, processing files through the Scan-Parse-Serialize-Compress-Upload pipeline. Use when running "npm start -- index", troubleshooting indexing errors, understanding AST generation, adding file type support, fixing "index shows 0 files", optimizing indexing performance, or implementing watch mode. Triggers include "re-index codebase", "full index", "index --full", "why aren't files indexed".
---

# CLI Indexing Workflow

Complete guide to indexing codebases with constellation-cli. Transforms source code into privacy-preserving AST metadata and uploads to Core.

## Quick Start

```bash
# Basic index (incremental - only changed files)
npm start -- index

# Full re-index (clear + reindex all files)
npm start -- index --full

# Index with dirty working directory (skip git check)
npm start -- index --dirty

# Custom concurrency
npm start -- index --concurrency 8
```

## The 6-Step Pipeline

### Step 1: Scan

**Purpose**: Find all supported source files

**Extensions**: `.js`, `.ts`, `.tsx`, `.jsx`

**Behavior**:

- Respects `.gitignore` patterns
- Skips `node_modules/`, `dist/`, `.git/`
- Uses incremental mode by default (only changed files)
- `--full` flag forces full scan

### Step 2: Parse

**Purpose**: Generate AST with Tree-sitter

**Files**:

- `src/parsers/source.parser.ts` - Main parser
- `src/languages/language.registry.ts` - Language support

**Behavior**:

- Small files (<10MB): Async read + sync parse
- Large files (>10MB): Streaming with 64KB chunks
- Concurrent parsing via promise pool

```typescript
// Parser flow
const parser = languageRegistry.getParser('typescript');
const tree = await sourceParser.parseFile(filePath, 'typescript');
```

### Step 3: Serialize

**Purpose**: Convert AST to JSON, stripping source code

**CRITICAL - Privacy Rules**:

```typescript
interface SerializedAST {
	symbols: Symbol[]; // Names, types, locations
	dependencies: Dependency[]; // Relationships
	structure: FileStructure; // Hierarchy
	// NO source code text
	// NO string literals
	// NO identifiable content
}
```

**Verification**: Run with `--dry-run` to inspect serialized output without uploading.

### Step 4: Compress

**Purpose**: Reduce payload size for upload

**Method**: gzip + base64 encoding

```typescript
const json = JSON.stringify(serializedAst);
const compressed = gzipSync(json);
const encoded = compressed.toString('base64');
// 70-90% size reduction
```

### Step 5: Upload

**Purpose**: Send compressed AST to Core API

**Endpoint**: `POST /api/v1/projects/{projectId}/ast`

**Headers**:

```
Authorization: Bearer $CONSTELLATION_ACCESS_KEY
Content-Type: application/x-ndjson
```

**Features**:

- NDJSON streaming for large uploads
- Automatic retry with exponential backoff + jitter
- Configurable timeout via AbortController

### Step 6: Store

**Purpose**: Core extracts intelligence and stores in Neo4j

**Server-side flow**:

1. Decompress AST payload
2. Extract symbols, relationships, metrics
3. Store in Neo4j with branch namespace isolation
4. Update project state

## Command Flags Reference

| Flag              | Purpose                                       | Example                 |
| ----------------- | --------------------------------------------- | ----------------------- |
| `--full`          | Clear existing data + full re-index           | `index --full`          |
| `--dirty`         | Skip git status check (for CI)                | `index --dirty`         |
| `--concurrency N` | Parallel file processing (default: CPU cores) | `index --concurrency 4` |
| `--dry-run`       | Parse but don't upload                        | `index --dry-run`       |

## Project Identification

The CLI automatically detects project identity:

```bash
# CLI reads:
git remote get-url origin

# Normalizes to:
github.com/org/repo

# Used as projectId for API calls
```

**Branch Isolation**: Each git branch gets a separate Neo4j namespace. Switching branches and re-indexing creates isolated data.

## Troubleshooting

### Index Appears Empty

```bash
# Verify files are being scanned
npm start -- index --dry-run | head -20

# Force full re-index
npm start -- index --full

# Check supported extensions
ls -la *.ts *.js *.tsx *.jsx
```

### Slow Indexing

```bash
# Reduce concurrency for memory-constrained systems
npm start -- index --concurrency 2

# Check for very large files (>10MB)
find . -name "*.ts" -size +10M
```

### Upload Failures

```bash
# Check authentication
echo $CONSTELLATION_ACCESS_KEY

# Test API connectivity
curl -H "Authorization: Bearer $CONSTELLATION_ACCESS_KEY" \
  localhost:3000/v1/healthz

# Debug mode
DEBUG=* npm start -- index
```

## Performance Tuning

**Concurrency**: Defaults to CPU cores. Reduce for memory-constrained systems.

**Large File Threshold**: 10MB - files above this use streaming parser.

**Retry Strategy**: Exponential backoff + jitter for 5xx errors.

**Incremental Indexing**: Only processes files changed since last index (default behavior).

## Integration Points

- **Parser**: `src/parsers/source.parser.ts`
- **Language Registry**: `src/languages/language.registry.ts`
- **API Client**: `src/api/client.ts`
- **Promise Pool**: `src/utils/promise-pool.ts`

## Related Skills

- `/cli-auth-setup` - Configure authentication before indexing
- `/cli-debugging` - Troubleshoot indexing errors
- `/implementing-language-support` - Add support for new languages
