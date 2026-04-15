export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: McpToolDefinition[] = [
  {
    name: 'get_task_context',
    description: 'Retrieve story context, artifacts, and current stage for an agent task',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Story ID to retrieve context for' },
      },
      required: ['story_id'],
    },
  },
  {
    name: 'submit_result',
    description: 'Submit tool output and transition dispatch status to completed',
    inputSchema: {
      type: 'object',
      properties: {
        dispatch_id: { type: 'string', description: 'Dispatch record ID' },
        output: { type: 'object', description: 'Result payload' },
      },
      required: ['dispatch_id', 'output'],
    },
  },
  {
    name: 'query_context',
    description: 'Search stories and artifacts by query string with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filters: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            stage: { type: 'string' },
          },
        },
      },
      required: ['query'],
    },
  },
];

let registered = false;

export function registerTools(): McpToolDefinition[] {
  registered = true;
  return tools;
}

export function getRegisteredTools(): McpToolDefinition[] {
  if (!registered) {
    throw new Error('Tools not registered. Call registerTools() first.');
  }
  return tools;
}

export function isRegistered(): boolean {
  return registered;
}

/** Approximate token count using chars/4 heuristic */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Total token count for all tool definitions combined */
export function totalToolTokens(): number {
  const json = JSON.stringify(tools);
  return countTokens(json);
}

// For testing: reset registration state
export function _resetRegistry(): void {
  registered = false;
}
