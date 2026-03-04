export type {
	ImportNodeProcessor,
	ImportTypeClassifier,
	LanguageImportHandlers,
} from './types';
export {
	createJavaScriptHandlers,
	createTypeScriptHandlers,
} from './javascript';
export { createPythonHandlers } from './python';
export {
	resolveAndStore,
	isExternalPackage,
	defaultClassifyImportType,
} from './utils';

import {
	createJavaScriptHandlers,
	createTypeScriptHandlers,
} from './javascript';
import { createPythonHandlers } from './python';
import type { LanguageImportHandlers } from './types';

export const DEFAULT_HANDLERS: LanguageImportHandlers[] = [
	createJavaScriptHandlers(),
	createTypeScriptHandlers(),
	createPythonHandlers(),
];
