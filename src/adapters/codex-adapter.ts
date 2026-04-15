import {
  AgentAdapter,
  AgentResult,
  PromptInput,
  JobReference,
} from './adapter-interface';
import {
  CodexConfig,
} from '../config/codex-config';
import {
  CodexPrompt,
  buildCodexPrompt,
  submitToOpenAI,
  pollOpenAIResponse,
  normalizeCodexResponse,
} from './codex-runner';

export class CodexAdapter implements AgentAdapter {
  readonly name = 'codex';
  readonly maxContextTokens: number;
  private config: CodexConfig;
  private fetchFn: typeof fetch;

  constructor(config: CodexConfig, maxContextTokens = 128000, fetchFn?: typeof fetch) {
    this.config = config;
    this.maxContextTokens = maxContextTokens;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  buildPrompt(input: PromptInput): CodexPrompt {
    return buildCodexPrompt(
      input.systemPrompt,
      input.userMessage,
      input.context,
      input.model ?? this.config.model,
    );
  }

  async submit(prompt: unknown): Promise<{ result?: AgentResult; jobRef?: JobReference }> {
    const codexPrompt = prompt as CodexPrompt;
    const { responseId, status, immediate } = await submitToOpenAI(
      codexPrompt,
      this.config.apiKey,
      this.fetchFn,
    );

    // If the response completed synchronously
    if (status === 'completed' && immediate) {
      return { result: this.normalizeResult(immediate) };
    }

    return { jobRef: { jobId: responseId } };
  }

  async poll(jobRef: JobReference): Promise<AgentResult> {
    const raw = await pollOpenAIResponse(
      jobRef.jobId,
      this.config,
      this.fetchFn,
    );
    return this.normalizeResult(raw);
  }

  normalizeResult(raw: unknown): AgentResult {
    return normalizeCodexResponse(raw, this.config.model);
  }
}
