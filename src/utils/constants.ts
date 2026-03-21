import ansiColors from 'ansi-colors';

export function printBanner(cmdName?: string) {
	console.log(`╭──────────────────────────────────────────────────────────────────────────────╮
│   ${ansiColors.gray("'")}  ${ansiColors.blueBright('.')}       ${ansiColors.dim('`')}      ${ansiColors.yellowBright("'")}   ${ansiColors.blueBright('+')}      ${ansiColors.whiteBright('.')}       ${ansiColors.gray('.')}       ${ansiColors.yellowBright("'")}   ${ansiColors.yellowBright('*')}    ${ansiColors.whiteBright("'")}   ${ansiColors.blueBright('+')}   ${ansiColors.gray('.')}    ${ansiColors.yellowBright('*')}  ${ansiColors.whiteBright(',')}   ${ansiColors.gray.dim('.')}│
│    _____  ${ansiColors.yellowBright('*')}      ${ansiColors.dim('`')}    __${ansiColors.whiteBright('.')}  ${ansiColors.whiteBright("'")}  ____  ${ansiColors.dim('.')}  __  _ ${ansiColors.gray('`')}     .   .         ${ansiColors.yellowBright('o')}       ${ansiColors.blueBright('+')}   │
│ ${ansiColors.blueBright('.')} / ___/__  ___  ___ / /____ / / /__ _/ /_(_)__  ___ ${ansiColors.gray('.')}   ${ansiColors.yellowBright("'")}  ${ansiColors.gray('+')}     ${ansiColors.gray('\\')}      ${ansiColors.gray('`')}   │
│  / /__/ _ \\/ _ \\(_-</ __/ -_) / / _ \`/ __/ / _ \\/ _ \\  ${ansiColors.gray("'")}      ${ansiColors.blueBright('o')}${ansiColors.gray('————')}${ansiColors.yellowBright('o')}     ${ansiColors.whiteBright('o')} ${ansiColors.whiteBright('.')} │
│  \\___/\\___/_//_/___/\\__/\\__/_/_/\\_,_/\\__/_/\\___/_//_/ ${ansiColors.gray('.')}     ${ansiColors.whiteBright('*')} ${ansiColors.gray(' \\    \\   ')}${ansiColors.gray('/')}    │
│      ${ansiColors.whiteBright("'")}        ${ansiColors.blueBright('.')}  ${ansiColors.gray("'")}   ${ansiColors.whiteBright('.')}         ${ansiColors.blueBright('.')}                    ${ansiColors.gray('.')}  ${ansiColors.yellowBright('*')}   ${ansiColors.blueBright.dim('+')}    ${ansiColors.whiteBright('o    o')}${ansiColors.gray('—')}${ansiColors.blueBright('o')}   ${ansiColors.yellowBright('*')} │
│${ansiColors.yellowBright("'")}  ${ansiColors.whiteBright('*')}   ${ansiColors.blueBright('+')}      ${ansiColors.yellowBright('*')}     ${ansiColors.gray(',')}    ${ansiColors.whiteBright("'")} +     ${ansiColors.whiteBright('constellationdev.io')}  ${ansiColors.whiteBright("' .")}    ${ansiColors.gray(',')}    ${ansiColors.blueBright('*')}   ${ansiColors.yellowBright('.')}   ${ansiColors.whiteBright('+')}   │`);

	if (cmdName && cmdName.length > 0) {
		console.log(`├─────────────────${'─'.repeat(cmdName.length)}─┬${'─'.repeat(59 - cmdName.length)}╯
│ ${ansiColors.bold(`constellation › ${cmdName}`)} │
╰─────────────────${'─'.repeat(cmdName.length)}─╯
`);
	} else {
		console.log(
			`╰──────────────────────────────────────────────────────────────────────────────╯`,
		);
	}
}

/** ASCII art banner for the Constellation CLI with colored styling */
export const CONSTELLATION_BANNER = `
╭──────────────────────────────────────────────────────────────────────────────╮
│   ${ansiColors.gray("'")}  ${ansiColors.blueBright('.')}       ${ansiColors.dim('`')}      ${ansiColors.yellowBright("'")}   ${ansiColors.blueBright('+')}      ${ansiColors.whiteBright('.')}       ${ansiColors.gray('.')}       ${ansiColors.yellowBright("'")}   ${ansiColors.yellowBright('*')}    ${ansiColors.whiteBright("'")}   ${ansiColors.blueBright('+')}   ${ansiColors.gray('.')}    ${ansiColors.yellowBright('*')}  ${ansiColors.whiteBright(',')}   ${ansiColors.gray.dim('.')}│
│    _____  ${ansiColors.yellowBright('*')}      ${ansiColors.dim('`')}    __${ansiColors.whiteBright('.')}  ${ansiColors.whiteBright("'")}  ____  ${ansiColors.dim('.')}  __  _ ${ansiColors.gray('`')}     .   .         ${ansiColors.yellowBright('o')}       ${ansiColors.blueBright('+')}   │
│ ${ansiColors.blueBright('.')} / ___/__  ___  ___ / /____ / / /__ _/ /_(_)__  ___ ${ansiColors.gray('.')}   ${ansiColors.yellowBright("'")}  ${ansiColors.gray('+')}     ${ansiColors.gray('\\')}      ${ansiColors.gray('`')}   │
│  / /__/ _ \\/ _ \\(_-</ __/ -_) / / _ \`/ __/ / _ \\/ _ \\  ${ansiColors.gray("'")}      ${ansiColors.blueBright('o')}${ansiColors.gray('————')}${ansiColors.yellowBright('o')}     ${ansiColors.whiteBright('o')} ${ansiColors.whiteBright('.')} │
│  \\___/\\___/_//_/___/\\__/\\__/_/_/\\_,_/\\__/_/\\___/_//_/ ${ansiColors.gray('.')}     ${ansiColors.whiteBright('*')} ${ansiColors.gray(' \\    \\   ')}${ansiColors.gray('/')}    │
│      ${ansiColors.whiteBright("'")}        ${ansiColors.blueBright('.')}  ${ansiColors.gray("'")}   ${ansiColors.whiteBright('.')}         ${ansiColors.blueBright('.')}                    ${ansiColors.gray('.')}  ${ansiColors.yellowBright('*')}   ${ansiColors.blueBright.dim('+')}    ${ansiColors.whiteBright('o    o')}${ansiColors.gray('—')}${ansiColors.blueBright('o')}   ${ansiColors.yellowBright('*')} │
│${ansiColors.yellowBright("'")}  ${ansiColors.whiteBright('*')}   ${ansiColors.blueBright('+')}      ${ansiColors.yellowBright('*')}     ${ansiColors.gray(',')}    ${ansiColors.whiteBright("'")} +     ${ansiColors.whiteBright('constellationdev.io')}  ${ansiColors.whiteBright("' .")}    ${ansiColors.gray(',')}    ${ansiColors.blueBright('*')}   ${ansiColors.yellowBright('.')}   ${ansiColors.whiteBright('+')}   │
╰──────────────────────────────────────────────────────────────────────────────╯
`;

/** Simplified ASCII logo for compact display */
export const ASCII_LOGO = `
${ansiColors.yellowBright('       o')}
${ansiColors.gray('        \\')}
${ansiColors.blueBright('    o')}${ansiColors.blueBright('----')}${ansiColors.yellowBright('o')}     ${ansiColors.gray('o')}
${ansiColors.gray('     \\    \\   ')}${ansiColors.blueBright('/')}
${ansiColors.whiteBright('      o    o')}${ansiColors.blueBright('-')}${ansiColors.blueBright('o')}
`;

/**
 * Enumeration of supported programming languages for Tree-sitter parsing.
 * Maps short identifiers to full language names used by the parser registry.
 */
export enum SupportedLanguages {
	/** C programming language */
	c = 'c',
	/** C# programming language */
	csharp = 'c-sharp',
	/** C++ programming language */
	cpp = 'cpp',
	/** Go programming language */
	gp = 'go',
	/** JSON data format */
	json = 'json',
	/** Java programming language */
	java = 'java',
	/** JavaScript programming language */
	js = 'javascript',
	/** PHP programming language */
	php = 'php',
	/** Python programming language */
	python = 'python',
	/** Ruby programming language */
	ruby = 'ruby',
	/** Bash shell scripting language */
	bash = 'bash',
	/** TypeScript programming language */
	ts = 'typescript',
}

export const ACCESS_KEY_ENV_VAR = 'CONSTELLATION_ACCESS_KEY';
