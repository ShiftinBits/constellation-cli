import type { SyntaxNode } from 'tree-sitter';
import type { ImportResolutionMetadata } from '@constellationdev/types';
import type { ImportResolver } from '../../languages/plugins/base-plugin';
import type { LanguageImportHandlers, ImportTypeClassifier } from './types';
import { resolveAndStore } from './utils';

/** Python import classifier — handles dot-prefixed relative imports, stdlib, and external packages */
export const pythonClassifyImportType: ImportTypeClassifier = (
	specifier: string,
	_resolved: string,
	isExternal: boolean,
): 'relative' | 'workspace' | 'alias' | 'external' | 'builtin' => {
	if (isExternal) return 'external';
	if (/^\.+/.test(specifier)) return 'relative';
	// Check Python stdlib — split on '.' to handle os.path, collections.abc, etc.
	const topLevel = specifier.split('.')[0];
	if (PYTHON_STDLIB_MODULES.has(topLevel)) return 'builtin';
	return 'alias';
};

/**
 * Processes a Python `import` statement (e.g., `import os`, `import os.path as osp`).
 *
 * AST structure:
 *   import_statement → [name] dotted_name | aliased_import
 */
async function processImportStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	const nameNode = node.childForFieldName('name');
	if (!nameNode) return;

	// For aliased imports (`import os.path as osp`), the name field is an aliased_import
	// whose own name sub-field is the dotted_name we want
	let importSpecifier: string;
	if (nameNode.type === 'aliased_import') {
		const innerName = nameNode.childForFieldName('name');
		importSpecifier = innerName ? innerName.text : nameNode.text;
	} else {
		importSpecifier = nameNode.text;
	}

	await resolveAndStore(
		importSpecifier,
		node.startPosition.row,
		resolver,
		resolutions,
		classifier,
	);
}

/**
 * Processes a Python `from ... import ...` statement
 * (e.g., `from pathlib import Path`, `from . import utils`, `from ..core import Base`).
 *
 * AST structure:
 *   import_from_statement → [module_name] (dotted_name | relative_import) + [name] ...
 */
async function processImportFromStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	let importSpecifier: string;

	const moduleNameNode = node.childForFieldName('module_name');
	if (moduleNameNode) {
		// Both relative (`..core`) and absolute (`pathlib`) — use text directly
		importSpecifier = moduleNameNode.text;
	} else {
		// Bare relative import: `from . import utils`
		// Look for relative_import or dot tokens between 'from' and 'import'
		let dots = '';
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (!child) continue;
			if (child.type === 'relative_import') {
				dots = child.text;
				break;
			}
			if (child.type === '.' || child.type === 'import_prefix') {
				dots += child.text;
			}
		}
		importSpecifier = dots || '.';
	}

	await resolveAndStore(
		importSpecifier,
		node.startPosition.row,
		resolver,
		resolutions,
		classifier,
	);
}

/**
 * Processes a Python `from __future__ import ...` statement.
 * These are informational — resolve __future__ as a builtin module.
 */
async function processFutureImportStatement(
	node: SyntaxNode,
	resolver: ImportResolver,
	resolutions: ImportResolutionMetadata,
	classifier: ImportTypeClassifier,
): Promise<void> {
	await resolveAndStore(
		'__future__',
		node.startPosition.row,
		resolver,
		resolutions,
		classifier,
	);
}

export function createPythonHandlers(): LanguageImportHandlers {
	return {
		language: 'python',
		handlers: new Map([
			['import_statement', processImportStatement],
			['import_from_statement', processImportFromStatement],
			['future_import_statement', processFutureImportStatement],
		]),
		classifyImportType: pythonClassifyImportType,
	};
}

/**
 * Python standard library top-level modules (CPython 3.10-3.13).
 * Includes deprecated/removed modules for compatibility with older codebases.
 * Only top-level names — submodules (e.g., collections.abc) are
 * handled by splitting on '.' and checking the top-level.
 */
export const PYTHON_STDLIB_MODULES: Set<string> = new Set([
	'abc',
	'aifc',
	'argparse',
	'array',
	'ast',
	'asynchat',
	'asyncio',
	'asyncore',
	'atexit',
	'audioop',
	'base64',
	'bdb',
	'binascii',
	'bisect',
	'builtins',
	'bz2',
	'cProfile',
	'calendar',
	'cgi',
	'cgitb',
	'chunk',
	'cmath',
	'cmd',
	'code',
	'codecs',
	'codeop',
	'collections',
	'colorsys',
	'compileall',
	'concurrent',
	'configparser',
	'contextlib',
	'contextvars',
	'copy',
	'copyreg',
	'crypt',
	'csv',
	'ctypes',
	'curses',
	'dataclasses',
	'datetime',
	'dbm',
	'decimal',
	'difflib',
	'dis',
	'distutils',
	'doctest',
	'email',
	'encodings',
	'ensurepip',
	'enum',
	'errno',
	'faulthandler',
	'fcntl',
	'filecmp',
	'fileinput',
	'fnmatch',
	'fractions',
	'ftplib',
	'functools',
	'gc',
	'getopt',
	'getpass',
	'gettext',
	'glob',
	'graphlib',
	'grp',
	'gzip',
	'hashlib',
	'heapq',
	'hmac',
	'html',
	'http',
	'idlelib',
	'imaplib',
	'imghdr',
	'imp',
	'importlib',
	'inspect',
	'io',
	'ipaddress',
	'itertools',
	'json',
	'keyword',
	'lib2to3',
	'linecache',
	'locale',
	'logging',
	'lzma',
	'mailbox',
	'mailcap',
	'marshal',
	'math',
	'mimetypes',
	'mmap',
	'modulefinder',
	'msilib',
	'msvcrt',
	'multiprocessing',
	'netrc',
	'nis',
	'nntplib',
	'numbers',
	'operator',
	'optparse',
	'os',
	'ossaudiodev',
	'pathlib',
	'pdb',
	'pickle',
	'pickletools',
	'pipes',
	'pkgutil',
	'platform',
	'plistlib',
	'poplib',
	'posix',
	'posixpath',
	'pprint',
	'profile',
	'pstats',
	'pty',
	'pwd',
	'py_compile',
	'pyclbr',
	'pydoc',
	'queue',
	'quopri',
	'random',
	're',
	'readline',
	'reprlib',
	'resource',
	'rlcompleter',
	'runpy',
	'sched',
	'secrets',
	'select',
	'selectors',
	'shelve',
	'shlex',
	'shutil',
	'signal',
	'site',
	'sitecustomize',
	'smtpd',
	'smtplib',
	'sndhdr',
	'socket',
	'socketserver',
	'spwd',
	'sqlite3',
	'ssl',
	'stat',
	'statistics',
	'string',
	'stringprep',
	'struct',
	'subprocess',
	'sunau',
	'symtable',
	'sys',
	'sysconfig',
	'syslog',
	'tabnanny',
	'tarfile',
	'telnetlib',
	'tempfile',
	'termios',
	'test',
	'textwrap',
	'threading',
	'time',
	'timeit',
	'tkinter',
	'token',
	'tokenize',
	'tomllib',
	'trace',
	'traceback',
	'tracemalloc',
	'tty',
	'turtle',
	'turtledemo',
	'types',
	'typing',
	'unicodedata',
	'unittest',
	'urllib',
	'usercustomize',
	'uu',
	'uuid',
	'venv',
	'warnings',
	'wave',
	'weakref',
	'webbrowser',
	'winreg',
	'winsound',
	'wsgiref',
	'xdrlib',
	'xml',
	'xmlrpc',
	'zipapp',
	'zipfile',
	'zipimport',
	'zlib',
	'zoneinfo',
	'_thread',
	'_tkinter',
	'__future__',
	'__main__',
]);
