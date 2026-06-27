/** OpenAI GPT-4 client runtime (issue #9). */

import type {
  LLMClient,
  LLMClientConfig,
  LLMRequestOptions,
  LLMResponse,
} from "./types.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Rate-limit and server-error status codes that warrant a retry. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface OpenAIChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenAIChatCompletionChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface OpenAIChatCompletionResponse {
  usage?: OpenAIChatCompletionUsage;
  choices?: OpenAIChatCompletionChoice[];
}

export class OpenAIClient implements LLMClient {
  readonly provider = "openai" as const;

  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly timeoutMs: number;

  constructor(config: LLMClientConfig) {
    this.apiKey = config.apiKey;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || DEFAULT_MODEL;

    const messages = options.systemPrompt
      ? [{ role: "system", content: options.systemPrompt }, ...options.messages]
      : options.messages;

    const body = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
    };

    const response = (await this.requestWithRetry(
      "https://api.openai.com/v1/chat/completions",
      body
    )) as OpenAIChatCompletionResponse;

    const inputTokens: number =
      (response.usage as Record<string, number>)?.prompt_tokens ?? 0;
    const outputTokens: number =
      (response.usage as Record<string, number>)?.completion_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    if (options.tokenBudget && totalTokens > options.tokenBudget) {
      throw new Error(
        `Token budget exceeded: used ${totalTokens}, budget ${options.tokenBudget}`
      );
    }

    const choice = (response.choices as Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>)?.[0];
    return {
      provider: "openai",
      model,
      content: choice?.message?.content ?? "",
      inputTokens,
      outputTokens,
      totalTokens,
      finishReason: choice?.finish_reason === "length" ? "length" : "stop",
    };
  }

  private async requestWithRetry(
    url: string,
    body: unknown,
    attempt = 1
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      if (RETRYABLE_STATUS.has(res.status) && attempt <= this.maxRetries) {
        const delay = this.baseDelayMs * 2 ** (attempt - 1);
        await sleep(delay);
        return this.requestWithRetry(url, body, attempt + 1);
      }
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
