# @constellation/cli

The Constellation CLI is a powerful command-line utility that parses source code locally, extracts Abstract Syntax Trees (ASTs), and uploads the data to the Constellation service for team-wide code intelligence sharing.

## Overview

The Constellation CLI tool is designed with privacy and security in mind. It parses your source code locally and only transmits serialized AST structures (without the actual source code) to the central Constellation service. This ensures your proprietary code never leaves your local environment while still enabling powerful code intelligence features for your entire team.

## Installation

Install the Constellation CLI utility globally using NPM:

```bash
npm install -g @constellation/cli
```

## Commands

### `constellation init`

Initialize a new Constellation project configuration in your repository.

**Description:**
This command sets up your project for Constellation by creating a `constellation.json` configuration file. It must be run from from the root directory of a project's Git repository.

**Features:**

- Detects Git repository and validates it's properly initialized
- Prompts for project configuration settings
- Automatically detects git repo remote origin URL to suggest a namespace
- Stages the created `constellation.json` file in Git

**Usage:**

```bash
constellation init
```

**Interactive Prompts:**

1. **Project Namespace**: A unique identifier for your project (defaults to remote repository name)
2. **Branch to Index**: Select which Git branch to track and index
3. **Languages**: Multi-select the programming languages used in your project
4. **API URL**: The Constellation service endpoint (defaults to `http://localhost:3000`)

**Supported Languages:**

- C
- C# (C-Sharp)
- C++
- Go
- Java
- JavaScript
- JSON
- PHP
- Python
- Ruby
- Shell (Bash)
- TypeScript

**Requirements:**

- Must be run from from the root directory of a Git repository
- Git must be installed and available in PATH
- Creates `constellation.json` in the current directory

### `constellation auth`

Configure authentication for the Constellation CLI.

**Description:**
Sets up authentication credentials for connecting to your team's Constellation service.
Stores provided Constellation Key in user environment variables.

**Usage:**

```bash
constellation auth
```

**Interactive Prompts:**

1. **Constellation Key**: Prompts for user/developer Constellation Key for authentication to Constellation service

### `constellation index`

Create or update the Constellation data indices for your project.

**Description:**
This is the core command that parses your source code, generates ASTs, and uploads the intelligence to the Constellation service. It supports both full and incremental indexing.

**Features:**

- **Privacy-First**: Parses code locally, only sends AST metadata
- **Incremental Indexing**: Only processes changed files since last index
- **Git Integration**: Synchronizes with Git to ensure consistent state
- **Progress Tracking**: Shows real-time progress during processing
- **Error Recovery**: Continues processing even if individual files fail
- **Compression**: Uses gzip compression to minimize network transfer

**Usage:**

```bash
# Perform smart indexing (incremental if possible)
constellation index

# Force a full project re-index
constellation index --full

# Perform incremental update only
constellation index --incremental
```

**Options:**

- `--full`: Forces a complete re-index of all project files
- `--incremental`: Explicitly requests incremental indexing (default behavior when previous index exists)

**Process Flow:**

1. **Git Branch Validation**: Ensures current branch matches configuration
2. **Repository Synchronization**: Pulls latest changes from remote
3. **Index Scope Determination**: Decides between full or incremental index
4. **File Discovery**: Scans project for files matching configured languages
5. **AST Generation**: Parses each file with Tree-sitter
6. **Data Upload**: Compresses and uploads AST data to service

**What Gets Indexed:**

- All files matching the language extensions configured in `constellation.json`
- Only files tracked by Git (respects `.gitignore`)
- Processes files from the configured branch

**Performance:**

- Processes files individually to optimize memory usage
- Shows progress every 10 files or at completion
- Handles large codebases efficiently
- Continues processing even if individual files fail to parse

**Error Handling:**

- Validates Git repository state before indexing
- Reports parsing errors but continues processing
- Provides detailed error messages for troubleshooting
- Returns non-zero exit code on critical failures

## Configuration

The CLI uses a `constellation.json` file for configuration:

```json
{
	"namespace": "my-project",
	"branch": "main",
	"apiUrl": "http://localhost:3000",
	"languages": {
		"typescript": {
			"fileExtensions": [".ts"]
		},
		"javascript": {
			"fileExtensions": [".js"]
		}
	}
}
```

**Configuration Fields:**

- `namespace`: Unique project identifier
- `branch`: Git branch to track and index
- `apiUrl`: Constellation service endpoint
- `languages`: Language configuration with file extensions

## Architecture

### Privacy & Security

The CLI is designed with a privacy-first architecture:

- **Local Parsing**: All source code parsing happens on your machine
- **No Source Transmission**: Only AST structure is sent, never actual code
- **Compressed Transfer**: AST data is compressed with gzip
- **Git Integration**: Respects your Git configuration and ignore rules

## Requirements

- **Node.js**: Version 18 or higher
- **Git**: Must be installed and available in PATH
- **Repository**: Must be run from the root directory of a Git repository
- **Configuration**: Requires `constellation.json` (can be created by `init` command)

### Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

## Troubleshooting

### Common Issues

1. **"Could not find git client installation"**
   - Ensure Git is installed: https://git-scm.com/downloads
   - Verify Git is in your PATH: `git --version`

2. **"Current directory is not a git repository"**
   - Run the command from within a Git repository
   - Initialize Git if needed: `git init`

3. **"constellation.json already exists"**
   - Project is already initialized
   - Update `constellation.json` if changes are necessary

4. **"Branch not configured for indexing"**
   - Current Git branch doesn't match configuration
   - Switch branches to configured branch or update `branch` in `constellation.json`

5. **Parse errors during indexing**
   - Some files may have syntax errors
   - The CLI continues processing other files
   - Check the reported files for syntax issues

## License

GNU Affero General Public License v3.0 (AGPL-3.0) - See LICENSE file for details

Copyright (C) 2025 ShiftinBits, LLC

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
