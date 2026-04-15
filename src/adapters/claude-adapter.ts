import {
  AgentAdapter,
  AgentResult,
  PromptInput,
  JobReference,
} from './adapter-interface';

/**
 * Thin adapter wrapper around the existing Claude runner path,
 * conforming to the AgentAdapter contract for uniform dispatch.
 */
export class ClaudeAdapter implements AgentAdapter {
  readonly name = 'claude';
  readonly maxContextTokens = 200000;

  buildPrompt(input: PromptInput): unknown {
    return {
      model: input.model ?? 'claude-sonnet-4-20250514',
      system: input.systemPrompt,
      messages: [
        {
          role: 'user',
          content: input.context
            ? `${input.context}\n\n${input.userMessage}`
            : input.userMessage,
        },
      ],
      max_tokens: input.maxOutputTokens ?? 4096,
    };
  }

  async submit(prompt: unknown): Promise<{ result?: AgentResult }> {
    // Claude responses are synchronous — no polling needed.
    // In production this would call the actual Claude API.
    // For now, return a placeholder that the scheduler fills in.
    return { result: this.normalizeResult(prompt) };
  }

  async poll(_jobRef: JobReference): Promise<AgentResult> {
    throw new Error('Claude adapter does not support polling — responses are synchronous');
  }

  normalizeResult(raw: any): AgentResult {
    return {
      output: raw?.content?.[0]?.text ?? '',
      model: raw?.model ?? 'claude-sonnet-4-20250514',
      inputTokens: raw?.usage?.input_tokens ?? 0,
      outputTokens: raw?.usage?.output_tokens ?? 0,
      finishReason: raw?.stop_reason ?? 'end_turn',
      raw,
    };
  }
}
