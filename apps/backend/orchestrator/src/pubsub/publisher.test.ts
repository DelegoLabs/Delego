import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisPublisher } from "./publisher.js";
import type { RedisClient } from "./types.js";
import type { Logger } from "@delego/utils";

function noopLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("RedisPublisher", () => {
  let client: RedisClient;
  let log: Logger;

  beforeEach(() => {
    client = { publish: vi.fn() };
    log = noopLogger();
  });

  describe("publish", () => {
    it("returns delivered=true on first attempt when publish succeeds", async () => {
      vi.mocked(client.publish).mockResolvedValue(1);

      const publisher = new RedisPublisher(client, log);
      const result = await publisher.publish("orders:created", "{}");

      expect(result).toEqual({ channel: "orders:created", delivered: true, attempts: 1 });
    });

    it("retries on transient failure and succeeds on second attempt", async () => {
      vi.mocked(client.publish)
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce(1);

      const publisher = new RedisPublisher(client, log, 3, 10);
      const result = await publisher.publish("orders:created", "{}");

      expect(result).toEqual({ channel: "orders:created", delivered: true, attempts: 2 });
      expect(client.publish).toHaveBeenCalledTimes(2);
    });

    it("returns failure metadata immediately for non-transient errors", async () => {
      vi.mocked(client.publish).mockRejectedValue(new Error("WRONGTYPE"));

      const publisher = new RedisPublisher(client, log);
      const result = await publisher.publish("orders:created", "{}");

      expect(result.delivered).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.error).toBe("WRONGTYPE");
    });

    it("exhausts all retries when transient errors persist", async () => {
      vi.mocked(client.publish).mockRejectedValue(new Error("ETIMEDOUT"));

      const publisher = new RedisPublisher(client, log, 3, 10);
      const result = await publisher.publish("orders:created", "{}");

      expect(result.delivered).toBe(false);
      expect(result.attempts).toBe(3);
      expect(client.publish).toHaveBeenCalledTimes(3);
    });

    it("reports final error message after all retries exhausted", async () => {
      const err = new Error("LOADING Redis is loading the dataset in memory");
      vi.mocked(client.publish).mockRejectedValue(err);

      const publisher = new RedisPublisher(client, log, 2, 10);
      const result = await publisher.publish("test:chan", "{}");

      expect(result.delivered).toBe(false);
      expect(result.error).toBe("publish failed after all retries");
    });

    it("treats unknown errors wrapped in Error as non-transient", async () => {
      vi.mocked(client.publish).mockRejectedValue("some string error");

      const publisher = new RedisPublisher(client, log);
      const result = await publisher.publish("test:chan", "{}");

      expect(result.delivered).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.error).toBe("some string error");
    });
  });
});
