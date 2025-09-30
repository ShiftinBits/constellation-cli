<div align="center">

# 🌟 Constellation CLI

**Connecting your code's stars into intelligent patterns**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

[Installation](#-installation) •
[Quick Start](#-quick-start) •
[Commands](#-commands) •
[Configuration](#-configuration) •
[Development](#-development)

</div>

---

## 📖 Overview

The Constellation CLI parses your source code locally using Tree-sitter and uploads Abstract Syntax Tree (AST) metadata to the Constellation service. This creates a shared code intelligence graph that powers AI development tools via the Constellation MCP server.

**What it does**: Keeps a centralized code intelligence graph up-to-date so your team's AI assistants (like Claude) can access instant, consistent codebase understanding without local indexing overhead.

**Key benefits**:

- **Privacy-First**: Parse locally, transmit only AST metadata—never your source code
- **Team-Wide Intelligence**: One shared graph serves all developers' AI tools
- **Always Current**: Incremental indexing keeps intelligence synchronized with your codebase
- **Zero Local Overhead**: AI assistants get instant context via MCP without indexing delays

## ✨ Features

### 🚀 Smart Indexing

- **Incremental Updates**: Only processes files changed since last index
- **Full Re-indexing**: Force complete project re-analysis when needed
- **Git-Aware**: Automatically tracks changes using Git history
- **CI/CD Ready**: Integrate into pipelines to keep intelligence current

### 🌐 Multi-Language Support

Currently supports:

- **JavaScript**
- **TypeScript**

_Additional languages (C, C++, C#, Go, Java, JSON, PHP, Python, Ruby, Shell) coming soon_

### 🔒 Security

- Local parsing with Tree-sitter—source code never transmitted
- Only AST metadata sent (compressed with gzip)
- API key-based authentication
- Respects `.gitignore` and Git configuration

## 📦 Installation

### Globally Install NPM Package

```bash
npm install -g @constellation/cli
```

### Requirements

- Node.js 20.0.0 or higher
- Git installed and available in PATH
- Git repository

## 🚀 Quick Start

### 1. Initialize Your Project

```bash
constellation init
```

Creates `constellation.json` configuration file with interactive prompts:

- Project namespace (auto-suggested from Git remote)
- Branch to track
- Programming languages used

### 2. Configure Authentication

```bash
constellation auth
```

Stores your Constellation access key in environment variables.

**Alternative**: Set manually:

```bash
export CONSTELLATION_ACCESS_KEY="your-access-key"
```

### 3. Index Your Project

```bash
# Smart indexing (incremental if possible)
constellation index

# Force complete re-index
constellation index --full
```

## 📚 Commands

### `constellation init`

Initialize project configuration.

```bash
constellation init
```

**Creates**: `constellation.json` file in current directory
**Requires**: Git repository
**Interactive**: Prompts for namespace, branch, and languages

---

### `constellation auth`

Configure authentication credentials.

```bash
constellation auth
```

**Stores**: Access key in `CONSTELLATION_ACCESS_KEY` environment variable
**Interactive**: Prompts for Constellation access key

---

### `constellation index`

Parse codebase and upload intelligence to Constellation service.

```bash
constellation index [options]
```

**Options**:

- `--full`: Force complete re-index
- `--incremental`: Explicitly request incremental (default when previous index exists)

**Process**:

1. Validates Git branch and status
2. Pulls latest changes from remote
3. Determines index scope (full vs incremental)
4. Scans and parses relevant files
5. Compresses and uploads AST data

**What gets indexed**:

- Files matching configured language extensions
- Git-tracked files only (respects `.gitignore`)
- Files from configured branch

## ⚙️ Configuration

The `constellation.json` file controls indexing:

```json
{
	"namespace": "project-identifier",
	"branch": "main",
	"languages": {
		"typescript": {
			"fileExtensions": [".ts", ".tsx"]
		},
		"javascript": {
			"fileExtensions": [".js", ".jsx"]
		}
	},
	"exclude": ["**/node_modules/**", "**/dist/**"]
}
```

**Fields**:

- **`namespace`** (required): Unique project identifier
- **`branch`** (required): Git branch to track
- **`languages`** (required): Language config with file extensions
- **`exclude`** (optional): Glob patterns to exclude

### Supported Languages

| Language   | Identifier   | Default Extensions            |
| ---------- | ------------ | ----------------------------- |
| JavaScript | `javascript` | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | `typescript` | `.ts`, `.tsx`                 |

**Coming Soon**: C, C++, C#, Go, Java, JSON, PHP, Python, Ruby, Shell, and more!

## 🔧 Advanced Usage

### Environment Variables

- **`CONSTELLATION_ACCESS_KEY`**: API authentication key

### CI/CD Integration (Highly Recommended)

**We strongly recommend setting up Constellation indexing in your CI/CD pipeline.** This enables "set it and forget it" automation, whenever code is pushed or merged into your configured branch, the index automatically updates. Your team's AI development tools stay current without any manual intervention or developer overhead.

**Benefits of CI/CD Automation:**

- **Zero Developer Overhead**: Indexing triggers automatically
- **Always Up-to-Date**: Intelligence graph stays synchronized with your codebase
- **Team Confidence**: Developers trust their AI assistants to have current context
- **Autopilot Mode**: Configure once, never worry about indexing again

#### GitHub Actions Example

```yaml
name: Constellation Auto-Index
on:
  push:
    branches: [main] # Match your configured branch
  pull_request:
    branches: [main]
    types: [closed]

jobs:
  index:
    # Only run on merged PRs or direct pushes
    if: github.event_name == 'push' || github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install Constellation CLI
        run: npm install -g @constellation/cli
      - name: Run Incremental Index
        run: constellation index --incremental
        env:
          CONSTELLATION_ACCESS_KEY: ${{ secrets.CONSTELLATION_ACCESS_KEY }}
```

**Setup Steps:**

1. Add `CONSTELLATION_ACCESS_KEY` to your CI/CD secrets/environment variables
2. Configure pipeline to run on pushes/merges to your configured branch
3. Install CLI and run `constellation index --incremental`
4. Let automation handle the rest, keeping your code intelligence data current

### Incremental vs Full Indexing

**Incremental** (default when previous index exists):

- Processes only changed files since last index
- Faster for regular updates
- Tracks added, modified, renamed, and deleted files

**Full** (triggered with `--full` or no previous index):

- Processes all project files
- Use after significant configuration changes or first-time setup

## 🐛 Troubleshooting

| Issue                          | Solution                                                           |
| ------------------------------ | ------------------------------------------------------------------ |
| "Could not find git client"    | Install Git from [git-scm.com](https://git-scm.com/downloads)      |
| "Not a git repository"         | Run from within a Git repository or `git init`                     |
| "Branch not configured"        | Switch branches or update `branch` in `constellation.json`         |
| "Outstanding changes detected" | Commit or stash changes: `git add . && git commit` or `git stash`  |
| "Access key not found"         | Run `constellation auth` or set `CONSTELLATION_ACCESS_KEY`         |
| Parse errors                   | Some files may have syntax errors; CLI continues processing others |

**Get Help**:

- Documentation: `constellation --help`
- Issues: [GitHub Issues](https://github.com/ShiftinBits/constellation-cli/issues)
- Website: [constellationdev.io](https://constellationdev.io)

## 📄 License

GNU Affero General Public License v3.0 (AGPL-3.0)

Copyright (C) 2025 ShiftinBits Inc.

See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for fast, reliable parsing
- [Commander.js](https://github.com/tj/commander.js) for CLI framework
- [simple-git](https://github.com/steveukx/git-js) for Git operations
