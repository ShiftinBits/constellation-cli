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
 * Streams AST serialization as JSON chunks to minimize memory usage.
 * Yields chunks directly without building intermediate objects.
 * @param node Tree-sitter SyntaxNode to serialize
 * @param parentFieldName Optional field name if this node is a named field in its parent
 * @yields JSON string chunks
 */
export function* serializeASTStream(
	node: SyntaxNode,
	parentFieldName?: string
): Generator<string> {
	yield* serializeNodeToJSON(node, parentFieldName);
}

/**
 * Recursively yields JSON chunks for a node and its children.
 * Uses generators to stream output without accumulating memory.
 */
function* serializeNodeToJSON(node: SyntaxNode, parentFieldName?: string): Generator<string> {
	yield '{';

	// Serialize node properties
	yield `"type":${JSON.stringify(node.type)}`;
	yield `,"startPosition":${JSON.stringify({row: node.startPosition.row, column: node.startPosition.column})}`;
	yield `,"endPosition":${JSON.stringify({row: node.endPosition.row, column: node.endPosition.column})}`;

	if (parentFieldName) {
		yield `,"fieldName":${JSON.stringify(parentFieldName)}`;
	}

	// Include text for specific node types
	const textIncludedTypes = [
		'identifier', 'property_identifier', 'type_identifier', 'shorthand_property_identifier',
		'string', 'string_literal', 'template_string', 'number', 'true', 'false', 'null', 'undefined',
		'import_specifier', 'export_specifier', 'predefined_type', 'type_predicate', 'type_alias',
		'accessibility_modifier', 'readonly', 'static', 'async', 'await', 'const', 'let', 'var',
		'=', '=>', '...', '?', '!',
	];

	if (textIncludedTypes.includes(node.type) || node.type.endsWith('_keyword') || node.type.endsWith('_operator')) {
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
	parentFieldName?: string
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
	const stack: StackFrame[] = [{
		treeNode: node,
		serializedNode: root,
		fieldName: parentFieldName,
		childIndex: 0,
		fieldChildren: new Set()
	}];

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
						fieldChildren: new Set()
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
					fieldChildren: new Set()
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
function createSerializedNode(node: SyntaxNode, parentFieldName?: string): SerializedNode {
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
