# Redis Pub/Sub Publisher

Bounded-retry wrapper around Redis `PUBLISH` with structured logging.

## Usage

```ts
import { Redis, type Redis as RedisType } from "ioredis";
import { createLogger } from "@delego/utils";
import { RedisPublisher } from "./pubsub/index.js";

const client = new Redis(REDIS_URL);
const log = createLogger("orchestrator");

const publisher = new RedisPublisher(client, log, 3, 100);

const result = await publisher.publish("orders:created", JSON.stringify(event));
// result: { channel: "orders:created", delivered: true, attempts: 1 }
```

## `PublishResult`

| Field     | Type     | Description                              |
|-----------|----------|------------------------------------------|
| channel   | string   | Redis channel name                       |
| delivered | boolean  | true when publish succeeded              |
| attempts  | number   | number of attempts made                  |
| error?    | string   | error message on failure                 |

## Retry Behaviour

- Transient errors (`ECONNRESET`, `ETIMEDOUT`, `READONLY`, `LOADING`, etc.) are retried with exponential backoff: `baseDelayMs * 2^(attempt-1)`
- Non-transient errors return immediately without retry
- After all retries are exhausted the final result has `delivered: false`
