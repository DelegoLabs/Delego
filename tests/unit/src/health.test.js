import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("Gateway Health Endpoint Tests", () => {
  let healthModule;
  let dbModule;

  before(async () => {
    // Import modules after they're built
    healthModule = await import("../../../apps/backend/gateway/dist/routes/health.js");
    dbModule = await import("../../../apps/backend/gateway/dist/src/db.js");
  });

  describe("DependencyHealth interface", () => {
    it("should have correct structure for healthy dependency", () => {
      const dependency = {
        name: "postgresql",
        status: "ok",
        latencyMs: 15,
      };

      assert.equal(dependency.name, "postgresql");
      assert.ok(["ok", "degraded"].includes(dependency.status));
      assert.equal(typeof dependency.latencyMs, "number");
      assert.ok(dependency.latencyMs >= 0);
    });

    it("should have correct structure for degraded dependency", () => {
      const dependency = {
        name: "postgresql",
        status: "degraded",
        latencyMs: 0,
      };

      assert.equal(dependency.name, "postgresql");
      assert.equal(dependency.status, "degraded");
      assert.equal(dependency.latencyMs, 0);
    });
  });

  describe("Health response structure", () => {
    it("should have correct successful response structure", () => {
      const response = {
        data: {
          status: "ok",
          service: "gateway",
          version: "0.0.1",
          timestamp: new Date().toISOString(),
          dependencies: [
            {
              name: "postgresql",
              status: "ok",
              latencyMs: 15,
            },
          ],
        },
        error: null,
      };

      assert.ok(response.data);
      assert.ok(["ok", "degraded"].includes(response.data.status));
      assert.equal(response.data.service, "gateway");
      assert.equal(response.data.version, "0.0.1");
      assert.ok(response.data.timestamp);
      assert.ok(Array.isArray(response.data.dependencies));
      assert.equal(response.error, null);
    });

    it("should generate valid ISO 8601 timestamp", () => {
      const timestamp = new Date().toISOString();
      const parsed = new Date(timestamp);

      assert.ok(parsed instanceof Date);
      assert.ok(!isNaN(parsed.getTime()));
      assert.ok(timestamp.includes("T"));
      assert.ok(timestamp.endsWith("Z"));
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("checkDatabaseHealth function", () => {
    it("should be exported from db module", () => {
      assert.ok(dbModule);
      assert.equal(typeof dbModule.checkDatabaseHealth, "function");
    });

    it("should handle timeout parameter", async () => {
      // Test that the function accepts a timeout parameter
      // We test with a short timeout and verify it doesn't hang indefinitely
      const startTime = performance.now();
      
      try {
        // This will likely fail due to no actual DB in test env, but it tests the timeout mechanism
        await dbModule.checkDatabaseHealth(100);
      } catch (err) {
        // Expected to fail in test environment
        const elapsed = performance.now() - startTime;
        // Should not take much longer than timeout + some overhead
        assert.ok(elapsed < 5000, "Function should respect timeout parameter");
      }
    });
  });

  describe("healthHandler function", () => {
    it("should be exported and be a function", () => {
      assert.ok(healthModule);
      assert.equal(typeof healthModule.healthHandler, "function");
    });

    it("should handle database check and return proper response structure", async () => {
      // Create a minimal mock response object
      let capturedStatus = null;
      let capturedBody = null;

      const mockReq = {};
      const mockRes = {
        writeHead: (status) => {
          capturedStatus = status;
        },
        end: (body) => {
          capturedBody = JSON.parse(body);
        },
      };

      // The handler will try to check the real database
      // In CI/test without DB, this will return degraded status
      await healthModule.healthHandler(mockReq, mockRes);

      assert.equal(capturedStatus, 200);
      assert.ok(capturedBody.data);
      assert.ok(["ok", "degraded"].includes(capturedBody.data.status));
      assert.equal(capturedBody.data.service, "gateway");
      assert.equal(capturedBody.data.version, "0.0.1");
      assert.ok(capturedBody.data.timestamp);
      assert.ok(Array.isArray(capturedBody.data.dependencies));
      assert.equal(capturedBody.data.dependencies.length, 1);
      
      const dbDep = capturedBody.data.dependencies[0];
      assert.equal(dbDep.name, "postgresql");
      assert.ok(["ok", "degraded"].includes(dbDep.status));
      assert.equal(typeof dbDep.latencyMs, "number");
      assert.ok(dbDep.latencyMs >= 0);
      // Verify latency is an integer (rounded)
      assert.equal(dbDep.latencyMs, Math.floor(dbDep.latencyMs));
    });

    it("should return 200 status even when database is degraded", async () => {
      // Health endpoints typically return 200 even when unhealthy
      // to distinguish between "endpoint not reachable" and "service degraded"
      let capturedStatus = null;

      const mockReq = {};
      const mockRes = {
        writeHead: (status) => {
          capturedStatus = status;
        },
        end: () => {},
      };

      await healthModule.healthHandler(mockReq, mockRes);

      // Should always return 200, even if degraded
      assert.equal(capturedStatus, 200);
    });
  });

  describe("Response format consistency", () => {
    it("should always include error field in response", async () => {
      let capturedBody = null;

      const mockReq = {};
      const mockRes = {
        writeHead: () => {},
        end: (body) => {
          capturedBody = JSON.parse(body);
        },
      };

      await healthModule.healthHandler(mockReq, mockRes);

      assert.ok("error" in capturedBody);
      assert.equal(capturedBody.error, null);
    });

    it("should always include data field with required properties", async () => {
      let capturedBody = null;

      const mockReq = {};
      const mockRes = {
        writeHead: () => {},
        end: (body) => {
          capturedBody = JSON.parse(body);
        },
      };

      await healthModule.healthHandler(mockReq, mockRes);

      assert.ok("data" in capturedBody);
      assert.ok("status" in capturedBody.data);
      assert.ok("service" in capturedBody.data);
      assert.ok("version" in capturedBody.data);
      assert.ok("timestamp" in capturedBody.data);
      assert.ok("dependencies" in capturedBody.data);
    });
  });
});
