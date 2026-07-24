import { createLogger } from "@delego/utils";
import { getTokenRegistry, type TokenPrice } from "./tokenRegistry.js";

const log = createLogger(
  "payments:price-feeder",
  process.env.LOG_LEVEL ?? "info"
);

export interface PriceFeederConfig {
  updateIntervalMs: number;
  maxRetryAttempts: number;
  retryDelayMs: number;
}

export interface PriceUpdate {
  symbol: string;
  price: TokenPrice;
  timestamp: number;
}

const DEFAULT_CONFIG: PriceFeederConfig = {
  updateIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
};

export class PriceFeeder {
  private config: PriceFeederConfig;
  private updateTimer: NodeJS.Timeout | null = null;
  private priceCallbacks: Array<(update: PriceUpdate) => void> = [];
  private isRunning = false;

  constructor(config: Partial<PriceFeederConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.isRunning) {
      log.warn("Price feeder is already running");
      return;
    }

    this.isRunning = true;
    log.info("Starting price feeder", {
      updateIntervalMs: this.config.updateIntervalMs,
    });

    // Initial fetch
    this.fetchAllPrices().catch((err) => {
      log.error("Initial price fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Schedule periodic updates
    this.updateTimer = setInterval(() => {
      this.fetchAllPrices().catch((err) => {
        log.error("Periodic price fetch failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.updateIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    log.info("Price feeder stopped");
  }

  onPriceUpdate(callback: (update: PriceUpdate) => void): () => void {
    this.priceCallbacks.push(callback);
    return () => {
      this.priceCallbacks = this.priceCallbacks.filter((cb) => cb !== callback);
    };
  }

  private async fetchAllPrices(): Promise<void> {
    const registry = getTokenRegistry();
    const symbols = await registry.getSupportedSymbols();

    for (const symbol of symbols) {
      if (symbol === "XLM") {
        // XLM is the native asset, price is usually 1 XLM = 1 XLM
        continue;
      }

      try {
        const price = await this.fetchPriceForSymbol(symbol);
        if (price) {
          await registry.updateTokenPrice(symbol, price);
          this.notifyCallbacks({ symbol, price, timestamp: Date.now() });
        }
      } catch (err) {
        log.error("Failed to fetch price for token", {
          symbol,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async fetchPriceForSymbol(symbol: string): Promise<TokenPrice | null> {
    // In production, this would call external price APIs like CoinGecko, CoinMarketCap, etc.
    // For now, we'll simulate price fetching with mock data
    
    let retries = 0;
    while (retries < this.config.maxRetryAttempts) {
      try {
        // Mock price data - in production, replace with actual API calls
        const mockPrice = this.getMockPrice(symbol);
        return mockPrice;
      } catch (err) {
        retries++;
        if (retries < this.config.maxRetryAttempts) {
          log.warn("Retrying price fetch", {
            symbol,
            attempt: retries,
            maxAttempts: this.config.maxRetryAttempts,
          });
          await this.delay(this.config.retryDelayMs);
        } else {
          throw err;
        }
      }
    }

    return null;
  }

  private getMockPrice(symbol: string): TokenPrice {
    // Mock prices for development/testing
    const mockPrices: Record<string, { usd: number; xlm: number }> = {
      USDC: { usd: 1.0, xlm: 0.12 },
      BTC: { usd: 45000.0, xlm: 5400.0 },
      ETH: { usd: 2500.0, xlm: 300.0 },
    };

    const mock = mockPrices[symbol] || { usd: 0, xlm: 0 };
    return {
      tokenSymbol: symbol,
      priceInUsd: mock.usd,
      priceInXlm: mock.xlm,
      lastUpdated: Date.now(),
      source: "mock",
    };
  }

  private notifyCallbacks(update: PriceUpdate): void {
    for (const callback of this.priceCallbacks) {
      try {
        callback(update);
      } catch (err) {
        log.error("Price update callback failed", {
          symbol: update.symbol,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let feederInstance: PriceFeeder | null = null;

export function getPriceFeeder(config?: Partial<PriceFeederConfig>): PriceFeeder {
  if (!feederInstance) {
    feederInstance = new PriceFeeder(config);
  }
  return feederInstance;
}

export function resetPriceFeederForTesting(): void {
  if (feederInstance) {
    feederInstance.stop();
    feederInstance = null;
  }
}

export async function convertBetweenTokens(
  amount: string,
  fromSymbol: string,
  toSymbol: string,
  maxSlippagePercent: number = 1.0
): Promise<{ convertedAmount: string; exchangeRate: number; slippage: number } | null> {
  const registry = getTokenRegistry();
  const result = await registry.convertAmount(amount, fromSymbol, toSymbol);
  
  if (!result) {
    log.warn("Token conversion not available", { fromSymbol, toSymbol });
    return null;
  }

  // Calculate slippage (simplified - in production, compare with market rate)
  const slippage = 0; // Would be calculated against market rate
  
  if (slippage > maxSlippagePercent) {
    log.warn("Exchange rate slippage exceeds maximum", {
      fromSymbol,
      toSymbol,
      slippage,
      maxSlippagePercent,
    });
    return null;
  }

  return {
    convertedAmount: result.amount,
    exchangeRate: result.rate,
    slippage,
  };
}