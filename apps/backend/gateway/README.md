# @delego/gateway

Delego **gateway** service.

## Development

```bash
pnpm --filter @delego/gateway dev
```

## Health Check

Health check endpoint: `GET http://localhost:3000/health`

### Response Format

```json
{
  "data": {
    "status": "ok" | "degraded",
    "service": "gateway",
    "version": "0.0.1",
    "timestamp": "2026-06-24T12:00:00.000Z",
    "dependencies": [
      {
        "name": "postgresql",
        "status": "ok" | "degraded",
        "latencyMs": 15
      }
    ]
  },
  "error": null
}
```

### Dependency Checks

- **PostgreSQL**: Performs a lightweight `SELECT 1` query with a 5-second timeout
  - Status: `ok` when database responds successfully
  - Status: `degraded` when database is unavailable or times out
  - `latencyMs`: Query response time in milliseconds (0 when degraded)

### Overall Status

- `ok`: All dependencies are healthy
- `degraded`: One or more dependencies are unhealthy

The endpoint always returns HTTP 200, even when degraded, to distinguish between endpoint unavailability and service degradation.

## API v1 JSON Body Size Limit

`bodyLimitMiddleware` in `routes/api-v1.ts` rejects oversized JSON payloads on `/api/v1` routes before handlers run.

| Setting | Default | Environment variable |
|---|---|---|
| `jsonLimit` | `100kb` | `GATEWAY_API_V1_JSON_BODY_LIMIT` |
| `routePrefix` | `/api/v1` | (fixed) |

Oversized bodies receive HTTP **413** with the standard error envelope:

```json
{
  "data": null,
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "JSON body exceeds limit of 100kb",
    "details": { "limit": "100kb", "maxBytes": 102400 }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

The limit is checked via `Content-Length` when present and by streaming byte count otherwise. Invalid limit strings fall back to `100kb`.
