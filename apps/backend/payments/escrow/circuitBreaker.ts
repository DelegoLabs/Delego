/**
 * Circuit Breaker for Soroban RPC calls (Issue #353)
 *
 * Protects the payments service from cascading failures when the Soroban RPC
 * is down or experiencing issues. Implements the standard circuit breaker pattern:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: after failure threshold, requests are rejected immediately
 * - HALF_OPEN: after recovery timeout, allows a single test request
 */

import { createLogger } from "@delego/utils";

const log = createLogger("payments:escrow:circuit-breaker", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. Default: 5. */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from open to half-open. Default: 30000 (30s). */
  recoveryTimeoutMs: number;
  /** Number of successful calls in half-open state before closing. Default: 2. */
  halfOpenSuccessThreshold: number;
  /** Time window in ms for counting failures. Default: 60000 (1min). */
  failureWindowMs: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  lastStateChange: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalRejections: number;
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastStateChange: Date = new Date();
  private totalRequests = 0;
  private totalFailures = 0;
  private totalRejections = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      recoveryTimeoutMs: config?.recoveryTimeoutMs ?? 30_000,
      halfOpenSuccessThreshold: config?.halfOpenSuccessThreshold ?? 2,
      failureWindowMs: config?.failureWindowMs ?? 60_000,
    };
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastStateChange.getTime();
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.transitionTo("half_open");
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * @throws {CircuitBreakerOpenError} when the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    this.totalRequests++;

    if (currentState === "open") {
      this.totalRejections++;
      throw new CircuitBreakerOpenError(
        `Circuit breaker is open. Retry after ${this.config.recoveryTimeoutMs}ms.`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err: any) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessAt = new Date();

    if (this.state === "half_open") {
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        log.info("Circuit breaker closed - recovery successful", {
          successCount: this.successCount,
        });
        this.transitionTo("closed");
      }
    } else if (this.state === "closed") {
      // Reset failure count on success within the window
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureAt = new Date();

    if (this.state === "half_open") {
      log.warn("Circuit breaker opened - test request failed", {
        failureCount: this.failureCount,
      });
      this.transitionTo("open");
    } else if (this.state === "closed") {
      if (this.failureCount >= this.config.failureThreshold) {
        log.warn("Circuit breaker opened - failure threshold reached", {
          failureCount: this.failureCount,
          threshold: this.config.failureThreshold,
        });
        this.transitionTo("open");
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const prevState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    if (newState === "closed") {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === "half_open") {
      this.successCount = 0;
    }

    log.info("Circuit breaker state transition", {
      from: prevState,
      to: newState,
    });
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalRejections: this.totalRejections,
    };
  }

  /** Manually reset the circuit breaker to closed state. */
  reset(): void {
    this.transitionTo("closed");
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

// ---------------------------------------------------------------------------
// Singleton circuit breaker for escrow Soroban RPC calls
// ---------------------------------------------------------------------------

let escrowCircuitBreaker: CircuitBreaker | null = null;

export function getEscrowCircuitBreaker(): CircuitBreaker {
  if (!escrowCircuitBreaker) {
    escrowCircuitBreaker = new CircuitBreaker({
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "5", 10),
      recoveryTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS ?? "30000", 10),
      halfOpenSuccessThreshold: parseInt(process.env.CIRCUIT_BREAKER_HALF_OPEN_SUCCESS ?? "2", 10),
      failureWindowMs: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_WINDOW_MS ?? "60000", 10),
    });
  }
  return escrowCircuitBreaker;
}

export function setEscrowCircuitBreaker(breaker: CircuitBreaker): void {
  escrowCircuitBreaker = breaker;
}
