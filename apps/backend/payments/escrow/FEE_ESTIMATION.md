# Dynamic Fee Estimation

This document describes the dynamic fee estimation system for Stellar transactions in the payments service.

## Overview

The fee estimator fetches current network fees from the Horizon API's `/fee_stats` endpoint, allowing transactions to adapt to network congestion in real-time. This prevents transaction failures during periods of high network activity.

## Architecture

### Components

- **`feeEstimator.ts`**: Core fee estimation logic with Horizon integration and caching
- **`wallet-client.ts`**: Updated to fetch and use dynamic fees before transaction submission
- **`feeEstimator.test.ts`**: Comprehensive test suite covering all scenarios

### Design Principles

1. **Defensive Defaults**: Always falls back to safe minimum fee (100 stroops) when Horizon is unavailable
2. **Efficient Caching**: 30-second TTL reduces API load while keeping fees fresh
3. **Idempotent**: Safe for retries, workers, and schedulers
4. **Observable**: Logs fee source (Horizon or fallback) for monitoring

## Usage

### Basic Usage

```typescript
import { estimateTransactionFee } from "./feeEstimator.js";

// Get fee estimate with p95 percentile (default, good for most cases)
const estimate = await estimateTransactionFee(
  "https://horizon-testnet.stellar.org",
);
console.log(`Recommended fee: ${estimate.recommendedFeeStroops} stroops`);

// Get more aggressive fee for high congestion (p99)
const aggressiveEstimate = await estimateTransactionFee(
  "https://horizon-testnet.stellar.org",
  "p99",
);
```

### Integration with Wallet Service

The wallet-client automatically fetches fee estimates before transaction submission:

```typescript
import { submitContractCall } from "./wallet-client.js";

// Fee estimation happens automatically
const result = await submitContractCall({
  sourceAddress: "GXYZ...",
  contractId: "CXYZ...",
  method: "transfer",
  args: [
    /* ... */
  ],
  memo: "Payment for order 123",
});
```

The fee estimate is passed to the wallet service via the request body for final transaction building.

### Percentile Selection

- **`p50`**: Median fee, suitable for low-traffic periods (not recommended for production)
- **`p95`**: High percentile, provides good reliability during normal conditions (default)
- **`p99`**: Highest percentile, ensures confirmation during peak congestion (use for critical transactions)

## Fee Estimation Flow

```
submitContractCall()
  ↓
getTransactionFeeEstimate()
  ↓
estimateTransactionFee() → Check cache
  ├─ Cache valid → Return cached estimate
  └─ Cache expired → Fetch from Horizon
    ├─ Success + valid data → Cache & return
    ├─ Success + invalid data → Return fallback
    └─ Network error → Return fallback
  ↓
Pass feeEstimate to wallet service
```

## Caching Strategy

### Cache TTL

- **30 seconds** by default
- Balances between API load and fee freshness
- Configurable by adjusting `CACHE_TTL_MS` in `feeEstimator.ts`

### Cache Invalidation

```typescript
import { clearFeeCache } from "./feeEstimator.js";

// Force fresh fee fetch (useful for testing or emergency situations)
clearFeeCache();
```

### Cache Inspection

```typescript
import { getCachedFeeEstimate } from "./feeEstimator.js";

// Check current cached estimate without fetching
const cached = getCachedFeeEstimate();
if (cached) {
  console.log(`Cached fee: ${cached.recommendedFeeStroops} stroops`);
}
```

## Fallback Behavior

When Horizon is unavailable or returns invalid data, the estimator returns a safe fallback:

- **Fallback fee**: 100 stroops (0.0001 XLM)
- **Source**: Marked as "fallback" for visibility
- **Error handling**: Logged but doesn't throw - transactions continue with safe defaults

### Fallback Scenarios

1. Network unreachable (connection timeout)
2. Horizon service unavailable (5xx errors)
3. Malformed response (missing required fields)
4. Invalid percentile data
5. Zero or negative fees returned

## Environment Configuration

Required environment variables:

```bash
# Network selection (default: testnet)
STELLAR_NETWORK=testnet|mainnet|futurenet

# Horizon endpoint (optional with intelligent defaults)
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

The system automatically selects appropriate Horizon URLs based on `STELLAR_NETWORK`:

| Network   | Default Horizon URL                   |
| --------- | ------------------------------------- |
| testnet   | https://horizon-testnet.stellar.org   |
| mainnet   | https://horizon.stellar.org           |
| futurenet | https://horizon-futurenet.stellar.org |

## Monitoring & Observability

### Log Events

All fee operations are logged with structured data:

```typescript
// Successful fetch
log.info("Fee estimate fetched from Horizon", {
  percentile: "p95",
  baseFee: 100,
  recommendedFee: 1100,
  capacityUsage: 0.78,
});

// Fallback usage
log.warn("Failed to fetch fee estimate from Horizon, using fallback", {
  error: "Network timeout",
  percentile: "p95",
});
```

### Key Metrics to Monitor

1. **Fee source distribution**: Track ratio of Horizon vs fallback estimates
2. **Horizon availability**: Alert on frequent fallback usage
3. **Fee volatility**: Monitor percentile differences (p95 vs p50)
4. **Transaction success rate**: Correlate with fee estimates used

## Testing

### Run Tests

```bash
# Run all tests once
npm run test

# Watch mode (continuous testing)
npm run test:watch

# Run specific test file
npm run test -- feeEstimator.test.ts
```

### Test Coverage

The test suite covers:

- ✅ Successful fee fetching with all percentiles (p50, p95, p99)
- ✅ Minimum fee enforcement (never below 100 stroops)
- ✅ Horizon unavailability handling
- ✅ Malformed response handling
- ✅ Cache hit/miss scenarios
- ✅ Cache TTL expiration
- ✅ Network spike detection (medium and high congestion)
- ✅ Error scenarios (timeout, 503, null/undefined responses)
- ✅ Type safety validation

### Example: Testing High Congestion

```typescript
// Simulates high network congestion
mockFeeStats.max_fee = {
  p10: 5000,
  p20: 8000,
  p30: 10000,
  // ... full percentile distribution
  p99: 50000,
};
mockFeeStats.ledger_capacity_usage = 0.95;

const estimate = await estimateTransactionFee(
  "https://horizon-testnet.stellar.org",
  "p99",
);
expect(estimate.recommendedFeeStroops).toBe(50000);
```

## Wallet Service Integration

The wallet service receives the fee estimate and should use `recommendedFeeStroops` to build transactions:

```typescript
// Inside wallet service transaction builder
const feeEstimate = request.feeEstimate; // From payments service
const tx = new TransactionBuilder(account, {
  fee: String(feeEstimate.recommendedFeeStroops),
  networkPassphrase,
});
```

## Best Practices

### For Users of This Module

1. **Always await the estimate**: Fee fetching is async and should not block UI
2. **Use p95 for most cases**: Provides good reliability without excessive fees
3. **Monitor Horizon health**: Set up alerts for frequent fallback usage
4. **Cache appropriately**: Let the 30-second cache work; don't clear unnecessarily
5. **Log the source**: Always log whether fees came from Horizon or fallback

### For Operators

1. **Monitor fee trends**: Track p50/p95/p99 over time to understand network patterns
2. **Set appropriate percentiles**: Consider your transaction priorities
3. **Handle Horizon outages**: Ensure fallback fees are reasonable for your use case
4. **Track transaction success**: Correlate failures with fee estimates

## Troubleshooting

### High Transaction Failure Rate

1. Check if Horizon is accessible and healthy
2. Verify correct network is configured (`STELLAR_NETWORK`)
3. Check recent fee trends via [Stellar Dashboard](https://dashboard.stellar.org/)
4. Consider using p99 percentile for more reliable confirmation

### Frequent Fallback Usage

1. Horizon service may be down or slow
2. Check network connectivity
3. Verify `STELLAR_HORIZON_URL` is correct and accessible
4. Review logs for specific errors

### Unexpected Fee Values

1. Check network capacity usage in Horizon response
2. Verify percentile selection matches your needs
3. Review recent network activity
4. Cache may have old data (can clear with `clearFeeCache()`)

## Future Enhancements

Potential improvements for future versions:

- [ ] Multi-percentile strategy (retry with higher percentile on failure)
- [ ] Dynamic percentile selection based on transaction priority
- [ ] Fee history tracking for trend analysis
- [ ] Integration with alerting system for anomalies
- [ ] Redis-backed distributed cache (for multi-process deployments)
- [ ] Fee estimation for Stellar payments (non-contract transactions)

## References

- [Stellar Horizon API - Fee Stats](https://developers.stellar.org/api/introduction/pagination/#fee-stats)
- [Stellar Fees Overview](https://developers.stellar.org/docs/encyclopedia/fees-surge-pricing)
- [Soroban Transaction Fees](https://developers.stellar.org/docs/soroban/learn/storing-data#fees)

## Related Files

- `feeEstimator.ts` - Core implementation
- `feeEstimator.test.ts` - Test suite
- `wallet-client.ts` - Integration point
- `types.ts` - Type definitions
