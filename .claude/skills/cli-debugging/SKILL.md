---
name: cli-debugging
description: Diagnoses and resolves CLI errors including PARSE_ERROR, AUTH_ERROR, NETWORK_ERROR, and VALIDATION_ERROR. Use when CLI commands fail, indexing produces unexpected results, troubleshooting connectivity issues, or enabling debug mode. Triggers include "CLI error", "debug index", "parse failed", "connection refused", "enable verbose logging", "DEBUG=*", "dry-run mode".
---

# CLI Debugging

Systematic approach to diagnosing and resolving constellation-cli errors.

## Error Codes Reference

| Error Code         | Meaning               | Common Causes                         |
| ------------------ | --------------------- | ------------------------------------- |
| `PARSE_ERROR`      | AST parsing failed    | Invalid syntax, unsupported construct |
| `AUTH_ERROR`       | Authentication failed | Missing/invalid access key            |
| `NETWORK_ERROR`    | API unreachable       | Server down, wrong port, firewall     |
| `VALIDATION_ERROR` | Invalid payload       | Malformed AST, schema mismatch        |

## Debug Mode

Enable verbose logging for all CLI operations:

```bash
DEBUG=* npm start -- index
```

For specific debug categories:

```bash
DEBUG=constellation:parser npm start -- index
DEBUG=constellation:api npm start -- index
DEBUG=constellation:* npm start -- index
```

## Dry Run Mode

Parse files without uploading (inspect output locally):

```bash
npm start -- index --dry-run
```

## Diagnostic Sequence

When any CLI command fails, run this diagnostic sequence:

### Step 1: Check Authentication

```bash
# Verify key is set
echo $CONSTELLATION_ACCESS_KEY

# Test API connectivity with auth
curl -H "Authorization: Bearer $CONSTELLATION_ACCESS_KEY" \
  localhost:3000/v1/healthz
```

**Expected**: `{"status":"ok",...}`

### Step 2: Check Infrastructure

```bash
# Verify services are running
docker ps | grep -E "constellation|neo4j|postgres"

# Check ports
lsof -i :3000,3001,7474,7687,5432

# Test Neo4j directly (admin only)
docker exec constellation-graphdb cypher-shell \
  -u neo4j -p CorrectHorseBatteryStaple "RETURN 1"

# Test PostgreSQL
docker exec constellation-postgres pg_isready
```

### Step 3: Check Logs

```bash
# API logs
cd constellation-core && npm run start:intel-api:dev

# Docker container logs
docker compose logs -f neo4j
docker compose logs -f postgres
```

### Step 4: Verify Project Detection

```bash
# Check git remote (used for project ID)
git remote get-url origin

# Expected format: github.com/org/repo
```

---

## Error-Specific Troubleshooting

### PARSE_ERROR

**Symptoms**: File fails to parse, AST generation stops.

**Diagnostic**:

```bash
# Parse single file to isolate issue
DEBUG=constellation:parser npm start -- index --dry-run

# Check Tree-sitter can parse the file
npx tree-sitter parse problematic-file.ts
```

**Common Causes**:

- Syntax errors in source file
- Unsupported TypeScript/JavaScript features
- Binary or generated files in source tree
- Very large files (>10MB) without streaming

**Solutions**:

```bash
# Exclude problematic files
echo "problematic-file.ts" >> .gitignore

# Or fix syntax errors in the file
npm run lint:fix
```

### AUTH_ERROR

**Symptoms**: 401 Unauthorized responses.

**Diagnostic**:

```bash
# Check key format (should be ak_UUID)
echo $CONSTELLATION_ACCESS_KEY | grep -E '^ak_[0-9a-f-]{36}$'

# Check config file
cat ~/.constellation/config.json

# Test auth directly
curl -I -H "Authorization: Bearer $CONSTELLATION_ACCESS_KEY" \
  localhost:3000/v1/healthz
```

**Solutions**:

```bash
# Re-authenticate
npm start -- auth login

# Or set key directly
export CONSTELLATION_ACCESS_KEY=ak_...
```

See `/cli-auth-setup` for complete authentication guide.

### NETWORK_ERROR

**Symptoms**: Connection refused, timeout, ECONNRESET.

**Diagnostic**:

```bash
# Check API URL
echo $CONSTELLATION_API_URL

# Test connectivity
curl -v localhost:3000/v1/healthz

# Check DNS resolution
ping localhost

# Check firewall
sudo lsof -i :3000
```

**Error Details**: The CLI provides detailed network diagnostics:

```
errno: -61 (ECONNREFUSED)
syscall: connect
address: 127.0.0.1
port: 3000
```

**Solutions**:

```bash
# Start API server
cd constellation-core && npm run start:intel-api:dev

# Or start Docker infrastructure
cd constellation-core && npm run docker:up

# Check correct port
export CONSTELLATION_API_URL=http://localhost:3000
```

### VALIDATION_ERROR

**Symptoms**: Server rejects uploaded AST.

**Diagnostic**:

```bash
# Inspect serialized AST
npm start -- index --dry-run > ast-output.json

# Check for source code leakage (should be none)
grep -E '(function|const|let|var) ' ast-output.json

# Validate JSON structure
cat ast-output.json | jq .
```

**Common Causes**:

- Type mismatch between CLI and Core
- Schema version mismatch
- Corrupted compression

**Solutions**:

```bash
# Update CLI types (manual sync with Core)
# See /syncing-constellation-types skill

# Force full re-index
npm start -- index --full
```

---

## Common Issues

### Index Shows 0 Files

```bash
# Check current directory has source files
ls *.ts *.js *.tsx *.jsx

# Check .gitignore isn't excluding everything
cat .gitignore

# Check git status (dirty check may skip files)
git status
npm start -- index --dirty  # Skip git check
```

### Index Hangs

```bash
# Check for very large files
find . -name "*.ts" -size +10M

# Reduce concurrency
npm start -- index --concurrency 1

# Check memory usage
top -l 1 | grep node
```

### Neo4j Shows No Data After Index

```bash
# Verify upload succeeded
DEBUG=constellation:api npm start -- index

# Check project namespace in Neo4j
# Open http://localhost:7474 and run:
# MATCH (f:File) RETURN count(f)

# Force full re-index
npm start -- index --full
```

---

## Log Analysis

### API Client Logs

Key patterns to look for:

```
[API] POST /api/v1/projects/.../ast -> 200    # Success
[API] POST /api/v1/projects/.../ast -> 401    # Auth error
[API] POST /api/v1/projects/.../ast -> 500    # Server error
[API] Retry attempt 1/3 after 1000ms          # Transient failure
```

### Parser Logs

```
[Parser] Parsing src/index.ts (typescript)    # Normal
[Parser] Streaming src/large.ts (>10MB)       # Large file
[Parser] Failed src/bad.ts: SyntaxError       # Parse error
```

---

## Environment Checklist

Before debugging, verify:

- [ ] `$CONSTELLATION_ACCESS_KEY` is set
- [ ] `$CONSTELLATION_API_URL` is correct (default: http://localhost:3000)
- [ ] Docker containers running: `docker ps`
- [ ] API responding: `curl localhost:3000/v1/healthz`
- [ ] Git remote configured: `git remote -v`
- [ ] Source files exist: `ls *.ts`

---

## Related Skills

- `/cli-auth-setup` - Resolve authentication issues
- `/cli-indexing-workflow` - Understand the indexing pipeline
- `/syncing-constellation-types` - Fix type validation errors
