import { SyntaxNode } from 'tree-sitter';

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
 * Serializes a Tree-sitter AST node into a privacy-safe format.
 * Recursively processes child nodes while excluding source code content.
 * @param node Tree-sitter SyntaxNode to serialize
 * @param parentFieldName Optional field name if this node is a named field in its parent
 * @returns Serialized node containing only metadata and identifiers
 */
export function serializeAST(node: SyntaxNode, parentFieldName?: string): SerializedNode {
	// Serialize AST node recursively, excluding actual source code
	const serialized: SerializedNode = {
		type: node.type,
		startPosition: {
			row: node.startPosition.row,
			column: node.startPosition.column
		},
		endPosition: {
			row: node.endPosition.row,
			column: node.endPosition.column
		},
		...(parentFieldName && { fieldName: parentFieldName })
	};

	// Include text for node types that extractors need for intelligence extraction
	// This list includes identifiers, literals, and small structural elements
	// but excludes large code blocks to maintain privacy
	const textIncludedTypes = [
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

		// Type-related nodes
		'predefined_type',
		'type_predicate',
		'type_alias',

		// Small structural elements
		'accessibility_modifier',
		'readonly',
		'static',
		'async',
		'await',
		'const',
		'let',
		'var',

		// Operators
		'=',
		'=>',
		'...',
		'?',
		'!',
	];

	if (textIncludedTypes.includes(node.type) ||
	    node.type.endsWith('_keyword') ||
	    node.type.endsWith('_operator')) {
		serialized.text = node.text;
	}

	// Capture all children with their field names
	if (node.childCount > 0) {
		serialized.children = [];

		// Get all possible field names for this node type
		const fieldNames = getCommonFieldNames(node.type);
		const fieldChildrenSeen = new Set<SyntaxNode>();

		// First, add named field children with their field names
		for (const fieldName of fieldNames) {
			const fieldChild = node.childForFieldName(fieldName);
			if (fieldChild) {
				fieldChildrenSeen.add(fieldChild);
				serialized.children.push(serializeAST(fieldChild, fieldName));
			}
		}

		// Then add remaining children without field names (anonymous children)
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i);
			if (child && !fieldChildrenSeen.has(child)) {
				serialized.children.push(serializeAST(child));
			}
		}
	}

	return serialized;
}

/**
 * Get common field names for a node type
 * This is a workaround for tree-sitter versions that don't expose field names directly
 */
function getCommonFieldNames(nodeType: string): string[] {
	// Common field names used in many grammars
	const commonFields: { [key: string]: string[] } = {
		'function_declaration': ['name', 'parameters', 'body', 'return_type', 'type_parameters'],
		'method_definition': ['name', 'parameters', 'body', 'return_type', 'type_parameters'],
		'class_declaration': ['name', 'body', 'type_parameters', 'heritage'],
		'interface_declaration': ['name', 'body', 'type_parameters'],
		'variable_declarator': ['name', 'type', 'value'],
		'call_expression': ['function', 'arguments', 'type_arguments'],
		'member_expression': ['object', 'property'],
		'import_statement': ['source', 'import'],
		'export_statement': ['source', 'declaration', 'value'],
		'if_statement': ['condition', 'consequence', 'alternative'],
		'for_statement': ['init', 'condition', 'update', 'body'],
		'while_statement': ['condition', 'body'],
		'return_statement': ['value'],
		'assignment_expression': ['left', 'right'],
		'binary_expression': ['left', 'right', 'operator'],
		// Add more as needed for different languages
	};

	return commonFields[nodeType] || [];
}
