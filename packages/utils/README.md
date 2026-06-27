# @delego/utils

Shared utilities: logging, currency conversion, ID generation, and API boundary parsers.

## Parsers (Issues #218, #219)

- `parseBigIntString(input, options?)` — validates bigint-safe amount strings for gateway, wallet, and payments services. Rejects decimals, non-string inputs, and optionally negatives or values above `max`.
- `parseIsoDate(input, options?)` — validates strict ISO-8601 date-time strings for auth, delegation, and workflow APIs. Supports `rejectFuture` and `rejectPast` options.
