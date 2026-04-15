import {
  AgentAdapter,
  AgentResult,
  PromptInput,
  JobReference,
} from './adapter-interface';
import {
  GeminiConfig,
  GeminiPrompt,
  buildGeminiPrompt,
  submitToGemini,
  pollGeminiOperation,
  normalizeGeminiResponse,
} from './gemini-runner';

export class GeminiAdapter implements AgentAdapter {
  readonly name = 'gemini';
  readonly maxContextTokens: number;
  private config: GeminiConfig;
  private fetchFn: typeof fetch;

  constructor(config: GeminiConfig, maxContextTokens = 1048576, fetchFn?: typeof fetch) {
    this.config = config;
    this.maxContextTokens = maxContextTokens;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  buildPrompt(input: PromptInput): GeminiPrompt {
    return buildGeminiPrompt(
      input.systemPrompt,
      input.userMessage,
      input.context,
      input.model ?? this.config.model,
      input.maxOutputTokens,
    );
  }

  async submit(prompt: unknown): Promise<{ result?: AgentResult; jobRef?: JobReference }> {
    const geminiPrompt = prompt as GeminiPrompt;
    const { response, operationName } = await submitToGemini(
      geminiPrompt,
      this.config.apiKey,
      this.fetchFn,
    );

    if (operationName) {
      return { jobRef: { jobId: operationName, operationName } };
    }

    return { result: this.normalizeResult(response) };
  }

  async poll(jobRef: JobReference): Promise<AgentResult> {
    const raw = await pollGeminiOperation(
      jobRef.operationName ?? jobRef.jobId,
      this.config,
      this.fetchFn,
    );
    return this.normalizeResult(raw);
  }

  normalizeResult(raw: unknown): AgentResult {
    return normalizeGeminiResponse(raw, this.config.model);
  }
}
