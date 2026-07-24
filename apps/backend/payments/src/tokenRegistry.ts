import { createLogger } from "@delego/utils";

const log = createLogger(
  "payments:token-registry",
  process.env.LOG_LEVEL ?? "info"
);

export interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  assetIssuer?: string;
  assetCode?: string;
  logoUrl?: string;
  coingeckoId?: string;
}

export interface TokenPrice {
  tokenSymbol: string;
  priceInUsd: number;
  priceInXlm: number;
  lastUpdated: number;
  source: string;
}

export interface TokenRegistryEntry {
  metadata: TokenMetadata;
  price?: TokenPrice;
  lastMetadataUpdate: number;
  lastPriceUpdate: number;
}

// Default tokens supported by the platform
const DEFAULT_TOKENS: TokenMetadata[] = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
    logoUrl: "https://assets.stellar.org/ingredients/lumens.svg",
    coingeckoId: "stellar",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 7,
    assetIssuer: "GA5ZSEJYB37JDD5G4LYQCI4BSCZMUAPDSPKOZPZVCRAGMSL2S25B7VHL",
    assetCode: "USDC",
    logoUrl: "https://assets.stellar.org/usdc.svg",
    coingeckoId: "usd-coin",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    decimals: 7,
    assetIssuer: "GAUTUYYR6H5IGB2LL6C5AFMAZDFNEWCOVM7NCZ3IBFM3QF4WSMNL6CIF",
    assetCode: "BTC",
    logoUrl: "https://assets.stellar.org/btc.svg",
    coingeckoId: "bitcoin",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 7,
    assetIssuer: "GBVOLZ7R5YWZRE3M6XLCujuMvUaRsTCKMWqvd1ZD26A5ELGUBZBHTLZ4",
    assetCode: "ETH",
    logoUrl: "https://assets.stellar.org/eth.svg",
    coingeckoId: "ethereum",
  },
];

export class TokenRegistry {
  private tokens: Map<string, TokenRegistryEntry> = new Map();
  private cacheTtlMs: number;
  private priceCacheTtlMs: number;

  constructor(
    cacheTtlMs: number = 24 * 60 * 60 * 1000, // 24 hours
    priceCacheTtlMs: number = 5 * 60 * 1000 // 5 minutes
  ) {
    this.cacheTtlMs = cacheTtlMs;
    this.priceCacheTtlMs = priceCacheTtlMs;
    this.initializeDefaultTokens();
  }

  private initializeDefaultTokens(): void {
    for (const token of DEFAULT_TOKENS) {
      this.tokens.set(token.symbol, {
        metadata: token,
        lastMetadataUpdate: Date.now(),
        lastPriceUpdate: 0,
      });
    }
    log.info("Initialized token registry with default tokens", {
      count: DEFAULT_TOKENS.length,
    });
  }

  async getTokenMetadata(symbol: string): Promise<TokenMetadata | null> {
    const entry = this.tokens.get(symbol.toUpperCase());
    if (!entry) {
      return null;
    }

    // Check if metadata is stale
    if (Date.now() - entry.lastMetadataUpdate > this.cacheTtlMs) {
      // In production, fetch from external API
      log.info("Token metadata is stale, would refresh", { symbol });
    }

    return entry.metadata;
  }

  async getTokenPrice(symbol: string): Promise<TokenPrice | null> {
    const entry = this.tokens.get(symbol.toUpperCase());
    if (!entry?.price) {
      return null;
    }

    // Check if price is stale
    if (Date.now() - entry.lastPriceUpdate > this.priceCacheTtlMs) {
      log.info("Token price is stale, would refresh", { symbol });
    }

    return entry.price;
  }

  async updateTokenPrice(symbol: string, price: TokenPrice): Promise<void> {
    const entry = this.tokens.get(symbol.toUpperCase());
    if (!entry) {
      log.warn("Cannot update price for unknown token", { symbol });
      return;
    }

    entry.price = price;
    entry.lastPriceUpdate = Date.now();
    log.info("Updated token price", { symbol, priceInUsd: price.priceInUsd });
  }

  async getAllTokens(): Promise<TokenMetadata[]> {
    return Array.from(this.tokens.values()).map((entry) => entry.metadata);
  }

  async getSupportedSymbols(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  async isTokenSupported(symbol: string): Promise<boolean> {
    return this.tokens.has(symbol.toUpperCase());
  }

  async getTokenDecimals(symbol: string): Promise<number | null> {
    const metadata = await this.getTokenMetadata(symbol);
    return metadata?.decimals ?? null;
  }

  async convertAmount(
    amount: string,
    fromSymbol: string,
    toSymbol: string
  ): Promise<{ amount: string; rate: number } | null> {
    const fromPrice = await this.getTokenPrice(fromSymbol);
    const toPrice = await this.getTokenPrice(toSymbol);

    if (!fromPrice || !toPrice) {
      return null;
    }

    const fromAmount = parseFloat(amount);
    const rate = fromPrice.priceInUsd / toPrice.priceInUsd;
    const convertedAmount = fromAmount * rate;

    return {
      amount: convertedAmount.toString(),
      rate,
    };
  }
}

// Singleton instance
let registryInstance: TokenRegistry | null = null;

export function getTokenRegistry(): TokenRegistry {
  if (!registryInstance) {
    registryInstance = new TokenRegistry();
  }
  return registryInstance;
}

export function resetTokenRegistryForTesting(): void {
  registryInstance = null;
}