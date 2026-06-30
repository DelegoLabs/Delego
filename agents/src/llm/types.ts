/** Shared types for LLM client runtimes (issue #9). */

export type LLMProvider = "openai" | "anthropic";

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface LLMRequestOptions {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Hard cap on tokens that can be spent across this request (budget enforcement). */
  tokenBudget?: number;
}

export interface LLMResponse {
  provider: LLMProvider;
  model: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: "stop" | "length" | "error";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMClientConfig {
  apiKey: string;
  /** Max attempts before giving up (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential back-off (default: 1000). */
  baseDelayMs?: number;
  /** Per-request timeout in ms (default: 30_000). */
  timeoutMs?: number;
}

export interface LLMClient {
  provider: LLMProvider;
  chat(options: LLMRequestOptions): Promise<LLMResponse>;
}
