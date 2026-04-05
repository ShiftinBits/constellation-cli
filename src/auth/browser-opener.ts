import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function openBrowser(url: string): Promise<boolean> {
	if (!url.startsWith('http://') && !url.startsWith('https://')) {
		return false;
	}

	try {
		switch (process.platform) {
			case 'darwin':
				await execFileAsync('open', [url]);
				return true;
			case 'linux':
				await execFileAsync('xdg-open', [url]);
				return true;
			case 'win32':
				await execFileAsync('cmd', ['/c', 'start', '', url]);
				return true;
			default:
				return false;
		}
	} catch {
		return false;
	}
}
