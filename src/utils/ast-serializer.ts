import { SyntaxNode } from 'tree-sitter';
import { YELLOW_WARN } from './unicode-chars';

/**
 * Represents a serialized AST node without source code content.
 * Contains only syntax tree metadata for privacy-safe transmission.
 */
export interface SerializedNode {
	/** Node type from the Tree-sitter grammar */
	type: string;
	/** Starting position in the source file */
	startPosition: { row: number; column: number };
	/** Ending position in the source file */
	endPosition: { row: number; column: number };
	/** Child nodes (if any) */
	children?: SerializedNode[];
	/** Node text content (only for identifier nodes, not source code) */
	text?: string;
	/** Field name if this node is a named field in its parent */
	fieldName?: string;
}

/**
 * Node types whose text content should be preserved in the serialized AST.
 * These are identifiers, keywords, operators, literals, and type annotations
 * that extractors need for intelligence extraction — NOT source code bodies.
 *
 * Used by both the streaming serializer (serializeASTStream) and the legacy
 * serializer (serializeAST) as a single source of truth.
 *
 * Note: Nodes ending with `_keyword` or `_operator` are also included via
 * suffix checks in the serialization functions (not in this Set).
 */
export const TEXT_INCLUDED_TYPES: ReadonlySet<string> = new Set([
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
	'true',
	'false',
	'null',
	'undefined',

	// Import/Export related
	'import_specifier',
	'export_specifier',

	// Type-related nodes (basic)
	'predefined_type',
	'type_predicate',
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
	'decorator', // Decorator nodes (e.g., @Injectable())

	// Operators
	'=',
	'=>',
	'...',
	'?',
	'!',

	// Python-specific identifiers and keywords
	'dotted_name', // Python dotted imports (os.path)
	'aliased_import', // import X as Y
	'not_operator', // Python 'not' keyword
	'boolean_operator', // Python 'and'/'or'
	'comparison_operator', // Python 'is', 'in', 'not in'
	'yield', // yield keyword (leaf node)
	'pass', // pass statement
	'continue', // continue statement
	'break', // break statement
	'None', // Python None literal
	'True', // Python True literal
	'False', // Python False literal
	'ellipsis', // Python ... literal
	'type', // Python type annotation wrapper
	'string_content', // Python string content (strings are structured)
]);

/**
 * Streams AST serialization as JSON chunks to minimize memory usage.
 * Yields chunks directly without building intermediate objects.
 * @param node Tree-sitter SyntaxNode to serialize
 * @param parentFieldName Optional field name if this node is a named field in its parent
 * @yields JSON string chunks
 */
export function* serializeASTStream(
	node: SyntaxNode,
	parentFieldName?: string,
): Generator<string> {
	yield* serializeNodeToJSON(node, parentFieldName);
}

/**
 * Recursively yields JSON chunks for a node and its children.
 * Uses generators to stream output without accumulating memory.
 */
function* serializeNodeToJSON(
	node: SyntaxNode,
	parentFieldName?: string,
): Generator<string> {
	yield '{';

	// Serialize node properties
	yield `"type":${JSON.stringify(node.type)}`;
	yield `,"startPosition":${JSON.stringify({ row: node.startPosition.row, column: node.startPosition.column })}`;
	yield `,"endPosition":${JSON.stringify({ row: node.endPosition.row, column: node.endPosition.column })}`;

	if (parentFieldName) {
		yield `,"fieldName":${JSON.stringify(parentFieldName)}`;
	}

	// Include text for specific node types
	// IMPORTANT: Type annotation nodes need text preserved for type dependency extraction
	if (
		TEXT_INCLUDED_TYPES.has(node.type) ||
		node.type.endsWith('_keyword') ||
		node.type.endsWith('_operator')
	) {
		yield `,"text":${JSON.stringify(node.text)}`;
	}

	// Serialize children
	if (node.childCount > 0) {
		yield ',"children":[';

		const fieldNames = getCommonFieldNames(node.type);
		const fieldChildrenSeen = new Set<SyntaxNode>();
		let isFirst = true;

		// Process field children first
		for (const fieldName of fieldNames) {
			const fieldChild = node.childForFieldName(fieldName);
			if (fieldChild) {
				if (!isFirst) yield ',';
				isFirst = false;
				fieldChildrenSeen.add(fieldChild);
				yield* serializeNodeToJSON(fieldChild, fieldName);
			}
		}

		// Process remaining children
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child && !fieldChildrenSeen.has(child)) {
				if (!isFirst) yield ',';
				isFirst = false;
				yield* serializeNodeToJSON(child, undefined);
			}
		}

		yield ']';
	}

	yield '}';
}

/**
 * Legacy interface: Serializes a Tree-sitter AST node into a privacy-safe format.
 * Builds entire tree in memory - use serializeASTStream for better memory efficiency.
 * @deprecated Use serializeASTStream for large files
 * @param node Tree-sitter SyntaxNode to serialize
 * @param parentFieldName Optional field name if this node is a named field in its parent
 * @returns Serialized node containing only metadata and identifiers (complete tree)
 */
export async function serializeAST(
	node: SyntaxNode,
	parentFieldName?: string,
): Promise<SerializedNode> {
	// Use iterative approach with explicit stack to prevent recursion-based memory buildup
	// This dramatically reduces memory usage compared to recursive approach
	// IMPORTANT: All data is preserved - we just process it more efficiently
	interface StackFrame {
		treeNode: SyntaxNode;
		serializedNode: SerializedNode;
		fieldName?: string;
		childIndex: number;
		fieldChildren: Set<SyntaxNode>;
	}

	const root = createSerializedNode(node, parentFieldName);
	const stack: StackFrame[] = [
		{
			treeNode: node,
			serializedNode: root,
			fieldName: parentFieldName,
			childIndex: 0,
			fieldChildren: new Set(),
		},
	];

	while (stack.length > 0) {
		const frame = stack[stack.length - 1];

		// If we haven't processed field children yet, do that first
		if (frame.childIndex === 0 && frame.treeNode.childCount > 0) {
			const fieldNames = getCommonFieldNames(frame.treeNode.type);
			for (const fieldName of fieldNames) {
				const fieldChild = frame.treeNode.childForFieldName(fieldName);
				if (fieldChild) {
					frame.fieldChildren.add(fieldChild);
					const childSerialized = createSerializedNode(fieldChild, fieldName);
					if (!frame.serializedNode.children) {
						frame.serializedNode.children = [];
					}
					frame.serializedNode.children.push(childSerialized);

					// Push child onto stack for processing
					stack.push({
						treeNode: fieldChild,
						serializedNode: childSerialized,
						fieldName,
						childIndex: 0,
						fieldChildren: new Set(),
					});
				}
			}
		}

		// Process remaining (non-field) children
		if (frame.childIndex < frame.treeNode.childCount) {
			const child = frame.treeNode.child(frame.childIndex);
			frame.childIndex++;

			if (child && !frame.fieldChildren.has(child)) {
				const childSerialized = createSerializedNode(child, undefined);
				if (!frame.serializedNode.children) {
					frame.serializedNode.children = [];
				}
				frame.serializedNode.children.push(childSerialized);

				// Push child onto stack for processing
				stack.push({
					treeNode: child,
					serializedNode: childSerialized,
					childIndex: 0,
					fieldChildren: new Set(),
				});
			}
		} else {
			// All children processed, pop this frame
			stack.pop();
		}
	}

	return root;
}

/**
 * Creates a serialized node from a Tree-sitter node without children.
 * Helper function to reduce code duplication.
 */
function createSerializedNode(
	node: SyntaxNode,
	parentFieldName?: string,
): SerializedNode {
	const serialized: SerializedNode = {
		type: node.type,
		startPosition: {
			row: node.startPosition.row,
			column: node.startPosition.column,
		},
		endPosition: {
			row: node.endPosition.row,
			column: node.endPosition.column,
		},
		...(parentFieldName && { fieldName: parentFieldName }),
	};

	// Include text for node types that extractors need for intelligence extraction
	// IMPORTANT: Type annotation nodes need text preserved for type dependency extraction
	if (
		TEXT_INCLUDED_TYPES.has(node.type) ||
		node.type.endsWith('_keyword') ||
		node.type.endsWith('_operator')
	) {
		serialized.text = node.text;
	}

	return serialized;
}

/**
 * Get common field names for a node type
 * This is a workaround for tree-sitter versions that don't expose field names directly
 *
 * IMPORTANT: Field names must be listed here for the Core extractor to access them
 * via childForFieldName() on serialized AST nodes. Missing entries cause silent failures
 * in type extraction, inheritance detection, etc.
 */
function getCommonFieldNames(nodeType: string): string[] {
	// Common field names used in many grammars
	const commonFields: { [key: string]: string[] } = {
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
		function_signature: [
			'name',
			'parameters',
			'return_type',
			'type_parameters',
		],

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

		// Imports/Exports (JS: source, import | Python: name)
		import_statement: ['source', 'import', 'name'],
		import_specifier: ['name', 'alias'],
		export_specifier: ['name', 'alias'],
		export_statement: ['source', 'declaration', 'value'],

		// Control flow
		if_statement: ['condition', 'consequence', 'alternative'],
		for_statement: ['init', 'condition', 'update', 'body', 'left', 'right'],
		for_in_statement: ['left', 'right', 'body'],
		while_statement: ['condition', 'body'],
		do_statement: ['body', 'condition'],
		switch_statement: ['value', 'body'],
		try_statement: ['body', 'handler', 'finalizer'],
		// Note: Python try_statement only has 'body' as named field; 'handler'/'finalizer' are JS/TS-specific
		catch_clause: ['parameter', 'body'],
		return_statement: ['value'],
		throw_statement: ['value'],

		// Type annotations (TypeScript)
		type_annotation: ['type'],
		type_parameter: ['name', 'constraint', 'default'],
		generic_type: ['name', 'type_arguments'],

		// Python - Definitions
		function_definition: ['name', 'parameters', 'return_type', 'body'],
		class_definition: ['name', 'superclasses', 'body'],
		decorated_definition: ['definition'],
		lambda: ['parameters', 'body'],

		// Python - Imports
		// import_statement: merged into JS/TS entry above (added 'name' field)
		import_from_statement: ['module_name', 'name'],
		aliased_import: ['name', 'alias'],

		// Python - Assignments
		assignment: ['left', 'right', 'type'],
		augmented_assignment: ['left', 'right'],

		// Python - Parameters
		typed_parameter: ['name', 'type'],
		default_parameter: ['name', 'value'],
		typed_default_parameter: ['name', 'type', 'value'],

		// Python - Expressions
		call: ['function', 'arguments'],
		attribute: ['object', 'attribute'],
		binary_operator: ['left', 'right'],
		unary_operator: ['argument'],
		not_operator: ['argument'],
		boolean_operator: ['left', 'right'],
		comparison_operator: ['operators'],
		named_expression: ['name', 'value'],
		keyword_argument: ['name', 'value'],

		// Python - Control flow
		// if_statement: same fields as JS/TS (condition, consequence, alternative)
		// for_statement: merged into JS/TS entry above (added 'left', 'right')
		// while_statement: same fields as JS/TS (condition, body)
		// try_statement: Python 'body' already covered by JS/TS entry
		with_statement: ['body'],
		finally_clause: ['body'],
		else_clause: ['body'],
		match_statement: ['subject', 'body'],
		case_clause: ['pattern', 'guard'],
		raise_statement: ['cause'],

		// Python - Comprehensions
		list_comprehension: ['body'],
		dictionary_comprehension: ['body', 'key', 'value'],
		set_comprehension: ['body'],
		generator_expression: ['body'],
		for_in_clause: ['left', 'right'],
		if_clause: ['condition'],

		// Python - Other
		pair: ['key', 'value'],
		subscript: ['value', 'subscript'],
		slice: ['start', 'stop', 'step'],
	};

	return commonFields[nodeType] || [];
}
