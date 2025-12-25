---
name: cli-auth-setup
description: Configures CLI authentication with Constellation Core API. Use when setting up the CLI for the first time, running "auth login", rotating access keys, fixing 401 errors, AUTH_ERROR issues, or CONSTELLATION_ACCESS_KEY not working. Triggers include "authenticate CLI", "set up API key", "configure credentials", "fix unauthorized error".
---

# CLI Authentication Setup

Complete guide to configuring authentication for constellation-cli to communicate with the Core API.

## Quick Start

```bash
# Interactive login (opens browser)
npm start -- auth login

# Or set environment variable directly
export CONSTELLATION_ACCESS_KEY=ak_00000000-0000-0000-0000-000000000000
export CONSTELLATION_API_URL=http://localhost:3000
```

## Authentication Methods

### Method 1: Interactive Login (Recommended)

```bash
npm start -- auth login
```

**Flow**:

1. Opens browser to authentication page
2. User authenticates (OAuth/SSO)
3. CLI receives access key
4. Key stored in `~/.constellation/config.json`
5. Future commands use stored key automatically

### Method 2: Environment Variable

```bash
# Set access key
export CONSTELLATION_ACCESS_KEY=ak_00000000-0000-0000-0000-000000000000

# Optional: Set API URL (defaults to http://localhost:3000)
export CONSTELLATION_API_URL=http://localhost:3000
```

**Best for**: CI/CD pipelines, Docker containers, automated scripts.

### Method 3: Config File

```bash
# Create or edit config
mkdir -p ~/.constellation
cat > ~/.constellation/config.json << 'EOF'
{
  "accessKey": "ak_00000000-0000-0000-0000-000000000000",
  "apiUrl": "http://localhost:3000"
}
EOF
```

## Priority Order

The CLI reads credentials in this order:

1. `$CONSTELLATION_ACCESS_KEY` environment variable (highest priority)
2. `~/.constellation/config.json` file
3. Prompt for login if neither exists

## Key Format

Access keys follow this format:

```
ak_XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
```

- Prefix: `ak_` (access key)
- Body: UUID v4 format
- Example: `ak_12345678-1234-1234-1234-123456789012`

## Config File Structure

```json
{
	"accessKey": "ak_00000000-0000-0000-0000-000000000000",
	"apiUrl": "http://localhost:3000",
	"defaultProject": "github.com/org/repo"
}
```

**Location**: `~/.constellation/config.json`

## API Headers

The CLI sends authentication via HTTP header:

```
Authorization: Bearer ak_00000000-0000-0000-0000-000000000000
```

## Verification

### Check Current Auth Status

```bash
# Test authentication
curl -H "Authorization: Bearer $CONSTELLATION_ACCESS_KEY" \
  localhost:3000/v1/healthz

# Expected response
{"status":"ok","timestamp":"..."}
```

### Check Config File

```bash
cat ~/.constellation/config.json
```

### Check Environment

```bash
echo $CONSTELLATION_ACCESS_KEY
echo $CONSTELLATION_API_URL
```

## Troubleshooting

### Error: 401 Unauthorized

**Symptoms**: CLI commands fail with 401 error.

**Solutions**:

```bash
# Check if key is set
echo $CONSTELLATION_ACCESS_KEY

# Check if key is valid format
# Should start with "ak_" and be UUID format

# Re-authenticate
npm start -- auth login

# Or set key manually
export CONSTELLATION_ACCESS_KEY=<your-key>
```

### Error: Invalid Access Key

**Symptoms**: Key is set but rejected by server.

**Solutions**:

```bash
# Verify key format (should be ak_UUID)
echo $CONSTELLATION_ACCESS_KEY | grep -E '^ak_[0-9a-f-]{36}$'

# Request new key from admin or re-authenticate
npm start -- auth login
```

### Config File Not Found

**Symptoms**: CLI prompts for login each time.

**Solutions**:

```bash
# Check if config directory exists
ls -la ~/.constellation/

# Create directory if missing
mkdir -p ~/.constellation

# Re-authenticate to create config
npm start -- auth login
```

### Environment Variable Not Persisting

**Symptoms**: Key works in current session but not after restart.

**Solutions**:

```bash
# Add to shell profile
echo 'export CONSTELLATION_ACCESS_KEY=<your-key>' >> ~/.zshrc
# or ~/.bashrc for bash

# Reload shell
source ~/.zshrc
```

## Security Best Practices

1. **Never commit keys**: Add to `.gitignore`:

   ```
   .constellation/
   ```

2. **Use environment variables in CI**:

   ```yaml
   # GitHub Actions
   env:
     CONSTELLATION_ACCESS_KEY: ${{ secrets.CONSTELLATION_ACCESS_KEY }}
   ```

3. **Rotate keys periodically**: Request new key from admin panel.

4. **Limit key scope**: Use project-specific keys when available.

## Related Skills

- `/cli-indexing-workflow` - Requires authentication before indexing
- `/cli-debugging` - Diagnose AUTH_ERROR issues
