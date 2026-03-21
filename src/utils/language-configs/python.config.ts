import type { LanguageSerializerConfig } from './types';

/**
 * Python-specific text-included types.
 * These include Python literals, keywords, and type annotation nodes
 * (subscript, attribute, list, tuple, binary_operator) that should NOT
 * be applied to JS/TS serialization.
 */
const PYTHON_TEXT_TYPES: ReadonlySet<string> = new Set([
	// Python-specific literals
	'true',
	'false',
	'none',
	'None',
	'True',
	'False',

	// Python keywords
	'yield',
	'pass',
	'continue',
	'break',
	'ellipsis',

	// Python imports
	'dotted_name',
	'aliased_import',

	// Python operators
	'not_operator',
	'boolean_operator',
	'comparison_operator',

	// Python type annotations
	'type',

	// Python type annotation nodes - needed for type dependency extraction
	// These would cause side effects if added to the shared JS/TS set
	'subscript',
	'attribute',
	'list',
	'tuple',
	'binary_operator',
	'union_type',

	// Shared type annotation support
	'generic_type',
]);

/**
 * Python field name mappings for Tree-sitter node types.
 *
 * IMPORTANT: Field names must be listed here for the Core extractor to access them
 * via childForFieldName() on serialized AST nodes. Missing entries cause silent failures
 * in type extraction, inheritance detection, etc.
 *
 * Re-exported from ast-serializer.ts for backwards compatibility.
 */
export const PYTHON_FIELD_NAMES: Readonly<Record<string, string[]>> = {
	// Definitions
	function_definition: [
		'name',
		'parameters',
		'return_type',
		'body',
		'type_parameters',
	],
	async_function_definition: [
		'name',
		'parameters',
		'return_type',
		'body',
		'type_parameters',
	],
	class_definition: ['name', 'superclasses', 'body', 'type_parameters'],
	decorated_definition: ['definition'],
	lambda: ['parameters', 'body'],

	// Imports
	import_statement: ['name'],
	import_from_statement: ['module_name', 'name'],
	aliased_import: ['name', 'alias'],

	// Assignments
	assignment: ['left', 'right', 'type'],
	augmented_assignment: ['left', 'right'],
	type_alias_statement: ['name', 'type_parameters', 'value'],

	// Type annotations
	annotated_assignment: ['left', 'right', 'type'],

	// Exception handling
	except_clause: ['cause'],
	except_group_clause: ['cause'],

	// Return/Assert
	return_statement: ['value'],
	assert_statement: ['condition', 'message'],

	// Delete
	delete_statement: ['target'],

	// Scope declarations
	global_statement: ['name'],
	nonlocal_statement: ['name'],

	// Parameters
	typed_parameter: ['name', 'type'],
	default_parameter: ['name', 'value'],
	typed_default_parameter: ['name', 'type', 'value'],
	list_splat_pattern: [],
	dictionary_splat_pattern: [],

	// Expressions
	call: ['function', 'arguments'],
	attribute: ['object', 'attribute'],
	binary_operator: ['left', 'right'],
	unary_operator: ['argument'],
	not_operator: ['argument'],
	boolean_operator: ['left', 'right'],
	comparison_operator: ['operators'],
	named_expression: ['name', 'value'],
	conditional_expression: ['condition', 'consequence', 'alternative'],
	keyword_argument: ['name', 'value'],

	// Control flow
	if_statement: ['condition', 'consequence', 'alternative'],
	while_statement: ['condition', 'body', 'alternative'],
	for_statement: ['left', 'right', 'body'],
	try_statement: ['body'],
	with_statement: ['body'],
	with_item: ['value'],
	finally_clause: ['body'],
	else_clause: ['body'],
	match_statement: ['subject', 'body'],
	case_clause: ['pattern', 'guard'],
	raise_statement: ['cause'],

	// Comprehensions
	list_comprehension: ['body'],
	dictionary_comprehension: ['body', 'key', 'value'],
	set_comprehension: ['body'],
	generator_expression: ['body'],
	for_in_clause: ['left', 'right'],
	if_clause: ['condition'],

	// Other
	pair: ['key', 'value'],
	subscript: ['value', 'subscript'],
	slice: ['start', 'stop', 'step'],
};

/**
 * Python serializer configuration.
 */
export const pythonConfig: LanguageSerializerConfig = {
	language: 'python',
	textIncludedTypes: PYTHON_TEXT_TYPES,
	fieldNames: PYTHON_FIELD_NAMES,
	shouldIncludeText: (node) => {
		// Python compound string guard: `string` with children is a full literal (privacy leak).
		// In Python, `string` is a compound parent node (children: string_start,
		// string_content, string_end) whose .text contains the full literal.
		if (node.type === 'string' && node.childCount > 0) return false;
		return undefined; // fall through to standard check
	},
};
