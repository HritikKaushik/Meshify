import type { IntegrationContext } from './context.js';

/**
 * Tools: the executable surface of a provider, alongside its knowledge
 * sources. The shape maps 1:1 onto MCP — `tools/list` is the registry ×
 * `listTools()`, `tools/call` is `executeTool()` with the integration-scoped
 * vault context — so a future Meshify MCP server is a thin adapter over the
 * ProviderRegistry with no provider changes.
 */
export interface ToolDefinition {
	/** Tool name, unique within the provider (kebab or snake case). */
	name: string;
	description: string;
	/** JSON Schema (draft 2020-12 subset) describing the arguments object. */
	inputSchema: Record<string, unknown>;
}

export interface ToolResult {
	content: Array<{ type: 'text'; text: string } | { type: 'json'; data: unknown }>;
	isError?: boolean;
}

export interface ToolCapable {
	listTools(): ToolDefinition[];
	/** Execute one tool with integration-scoped credentials. Throws ProviderConfigError for unknown names. */
	executeTool(name: string, args: Record<string, unknown>, ctx: IntegrationContext): Promise<ToolResult>;
}
