import type { LanguageSerializerConfig } from './types';

/**
 * Shared text-included types used by ALL languages.
 * These are identifiers, keywords, operators, and structural elements
 * that every language needs for intelligence extraction.
 */
export const SHARED_TEXT_TYPES: ReadonlySet<string> = new Set([
	// Identifiers
	'identifier',
	'property_identifier',
	'type_identifier',
	'shorthand_property_identifier',

	// Literals and values
	'string',
	'string_literal',
	'template_string',
	'number',

	// Import/Export related
	'import_specifier',
	'export_specifier',

	// Small structural elements
	'accessibility_modifier',
	'readonly',
	'static',
	'async',
	'await',
	'const',
	'let',
	'var',

	// Decorators
	'decorator',

	// Operators
	'=',
	'=>',
	'...',
	'?',
	'!',

	// String content (Python string leaf text for __all__ exports, shared for general use)
	'string_content',
]);

/**
 * JS/TS-specific text-included types.
 * These are type annotation nodes and JS/TS-specific literals
 * that should NOT be applied to Python serialization.
 */
const JS_TS_TEXT_TYPES: ReadonlySet<string> = new Set([
	// JS/TS-specific literals
	'true',
	'false',
	'null',
	'undefined',

	// Type-related nodes (basic)
	'predefined_type',
	'type_predicate',
	'type_predicate_annotation',
	'type_alias',

	// Type annotations - needed for extractTypeDependencies to parse type references
	'type_annotation',
	'return_type',
	'type_arguments',
	'type_parameters',
	'array_type',
	'union_type',
	'intersection_type',
	'generic_type',
	'tuple_type',
	'function_type',
	'object_type',
	'mapped_type',
	'conditional_type',
	'infer_type',
]);

/**
 * JS/TS field name mappings for Tree-sitter node types.
 *
 * IMPORTANT: Field names must be listed here for the Core extractor to access them
 * via childForFieldName() on serialized AST nodes. Missing entries cause silent failures
 * in type extraction, inheritance detection, etc.
 *
 * Re-exported from ast-serializer.ts for backwards compatibility.
 */
export const JS_TS_FIELD_NAMES: Readonly<Record<string, string[]>> = {
	// Functions and methods
	function_declaration: [
		'name',
		'parameters',
		'body',
		'return_type',
		'type_parameters',
	],
	function_expression: [
		'name',
		'parameters',
		'body',
		'return_type',
		'type_parameters',
	],
	arrow_function: ['parameters', 'body', 'return_type', 'type_parameters'],
	method_definition: [
		'name',
		'parameters',
		'body',
		'return_type',
		'type_parameters',
	],
	method_signature: ['name', 'parameters', 'return_type', 'type_parameters'],
	function_signature: ['name', 'parameters', 'return_type', 'type_parameters'],

	// Type predicates
	type_predicate: ['name', 'type'],

	// Classes and interfaces
	class_declaration: ['name', 'body', 'type_parameters', 'heritage'],
	interface_declaration: ['name', 'body', 'type_parameters'],
	type_alias_declaration: ['name', 'type_parameters', 'value'],

	// Properties and fields
	property_signature: ['name', 'type'],
	field_definition: ['name', 'type', 'value'],
	public_field_definition: ['name', 'type', 'value'],
	private_field_definition: ['name', 'type', 'value'],

	// Parameters
	required_parameter: ['pattern', 'type', 'value'],
	optional_parameter: ['pattern', 'type', 'value'],
	rest_parameter: ['pattern', 'type'],

	// Variables
	variable_declarator: ['name', 'type', 'value'],
	lexical_declaration: ['kind'],

	// Expressions
	call_expression: ['function', 'arguments', 'type_arguments'],
	new_expression: ['constructor', 'arguments', 'type_arguments'],
	member_expression: ['object', 'property'],
	assignment_expression: ['left', 'right'],
	binary_expression: ['left', 'right', 'operator'],
	unary_expression: ['operator', 'argument'],
	ternary_expression: ['condition', 'consequence', 'alternative'],

	// Imports/Exports
	import_statement: ['source', 'import'],
	import_specifier: ['name', 'alias'],
	export_specifier: ['name', 'alias'],
	export_statement: ['source', 'declaration', 'value'],

	// Control flow
	if_statement: ['condition', 'consequence', 'alternative'],
	for_statement: ['init', 'condition', 'update', 'body'],
	for_in_statement: ['left', 'right', 'body'],
	while_statement: ['condition', 'body'],
	do_statement: ['body', 'condition'],
	switch_statement: ['value', 'body'],
	try_statement: ['body', 'handler', 'finalizer'],
	catch_clause: ['parameter', 'body'],
	return_statement: ['value'],
	throw_statement: ['value'],

	// Type annotations (TypeScript)
	type_annotation: ['type'],
	type_parameter: ['name', 'constraint', 'default'],
	generic_type: ['name', 'type_arguments'],
};

/**
 * JavaScript serializer configuration.
 */
export const javascriptConfig: LanguageSerializerConfig = {
	language: 'javascript',
	textIncludedTypes: JS_TS_TEXT_TYPES,
	fieldNames: JS_TS_FIELD_NAMES,
};

/**
 * TypeScript serializer configuration.
 * Uses the same types and field names as JavaScript.
 */
export const typescriptConfig: LanguageSerializerConfig = {
	language: 'typescript',
	textIncludedTypes: JS_TS_TEXT_TYPES,
	fieldNames: JS_TS_FIELD_NAMES,
};
