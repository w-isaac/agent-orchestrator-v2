/**
 * Standard result shape returned by all adapters after normalizing
 * the provider-specific response.
 */
export interface AgentResult {
  output: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  raw?: unknown;
}

/**
 * Configuration for building a prompt payload.
 */
export interface PromptInput {
  systemPrompt: string;
  userMessage: string;
  context?: string;
  model?: string;
  maxOutputTokens?: number;
}

/**
 * Reference to a submitted job, used for polling.
 */
export interface JobReference {
  jobId: string;
  operationName?: string;
}

/**
 * AgentAdapter interface contract.
 * All adapters (Claude, Gemini, etc.) must implement these methods.
 */
export interface AgentAdapter {
  readonly name: string;
  readonly maxContextTokens: number;

  /** Build the prompt payload for the provider's API format. */
  buildPrompt(input: PromptInput): unknown;

  /** Submit the prompt and return a job reference or direct result. */
  submit(prompt: unknown): Promise<{ result?: AgentResult; jobRef?: JobReference }>;

  /** Poll for completion given a job reference. Returns the result when done. */
  poll(jobRef: JobReference): Promise<AgentResult>;

  /** Normalize a raw provider response into the standard AgentResult shape. */
  normalizeResult(raw: unknown): AgentResult;
}
