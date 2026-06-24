import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// --- Stubs ---
// We stub the compiled dist modules before importing the module under test.

// Stub sendEmail so no SMTP calls are made
import * as emailModule from "../../../apps/backend/notifications/dist/email/index.js";
import * as permissionListenerModule from "../../../apps/backend/notifications/dist/src/permissionListener.js";

describe("permissionListener", () => {
  let sentEmails = [];
  let originalSendEmail;

  before(() => {
    sentEmails = [];
    originalSendEmail = emailModule.sendEmail;
    emailModule.sendEmail = async (msg) => {
      sentEmails.push(msg);
    };
  });

  after(() => {
    emailModule.sendEmail = originalSendEmail;
  });

  it("handlePermissionEvent sends an email for permission_granted", async () => {
    const event = {
      contractId: "CTEST123",
      eventType: "permission_granted",
      owner: "GOWNER",
      delegate: "GDELEGATE",
      limitStroops: "10000000",
      expiresAtLedger: 99999,
      txHash: "TXHASH1",
    };

    await permissionListenerModule.handlePermissionEvent(event);

    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, event.owner); // no USER_SERVICE_URL configured → fallback to address
    assert.ok(sentEmails[0].subject.toLowerCase().includes("granted"));
    assert.ok(sentEmails[0].body.includes("CTEST123"));
    assert.ok(sentEmails[0].body.includes("TXHASH1"));
    assert.ok(sentEmails[0].body.includes("10000000"));
    assert.ok(sentEmails[0].body.includes("99999"));
  });

  it("handlePermissionEvent sends an email for permission_updated", async () => {
    sentEmails = [];
    const event = {
      contractId: "CTEST123",
      eventType: "permission_updated",
      owner: "GOWNER",
      delegate: "GDELEGATE",
      txHash: "TXHASH2",
    };

    await permissionListenerModule.handlePermissionEvent(event);

    assert.equal(sentEmails.length, 1);
    assert.ok(sentEmails[0].subject.toLowerCase().includes("updated"));
    assert.ok(sentEmails[0].body.includes("permission_updated"));
  });

  it("handlePermissionEvent sends an email for permission_revoked", async () => {
    sentEmails = [];
    const event = {
      contractId: "CTEST123",
      eventType: "permission_revoked",
      owner: "GOWNER",
      delegate: "GDELEGATE",
      txHash: "TXHASH3",
    };

    await permissionListenerModule.handlePermissionEvent(event);

    assert.equal(sentEmails.length, 1);
    assert.ok(sentEmails[0].subject.toLowerCase().includes("revoked"));
  });

  it("handlePermissionEvent resolves owner email via USER_SERVICE_URL when set", async () => {
    sentEmails = [];
    const originalFetch = globalThis.fetch;
    process.env.USER_SERVICE_URL = "http://users";

    globalThis.fetch = async (url) => {
      assert.ok(url.includes("GOWNER"));
      return {
        ok: true,
        json: async () => ({ email: "owner@example.com" }),
      };
    };

    try {
      const event = {
        contractId: "CTEST",
        eventType: "permission_granted",
        owner: "GOWNER",
        delegate: "GDELEGATE",
        txHash: "TX4",
      };

      await permissionListenerModule.handlePermissionEvent(event);

      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].to, "owner@example.com");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.USER_SERVICE_URL;
    }
  });

  it("handlePermissionEvent falls back to owner address when user lookup fails", async () => {
    sentEmails = [];
    const originalFetch = globalThis.fetch;
    process.env.USER_SERVICE_URL = "http://users";

    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

    try {
      const event = {
        contractId: "CTEST",
        eventType: "permission_revoked",
        owner: "GOWNER_FALLBACK",
        delegate: "GDELEGATE",
        txHash: "TX5",
      };

      await permissionListenerModule.handlePermissionEvent(event);

      assert.equal(sentEmails[0].to, "GOWNER_FALLBACK");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.USER_SERVICE_URL;
    }
  });

  it("startPermissionEventListener does not throw and schedules polling", async () => {
    // We just verify the function is exported and callable without crashing.
    // Full RPC polling is tested via integration; here we only check the happy-path wiring.
    let pollCount = 0;

    // Override SorobanRpc.Server inside the module via a fake rpcUrl
    // startPermissionEventListener schedules via setTimeout; we just check it doesn't throw sync.
    assert.doesNotThrow(() => {
      // Pass a deliberate bad URL — the first poll will fail asynchronously, not synchronously.
      permissionListenerModule.startPermissionEventListener("http://localhost:9999", "CFAKE");
    });
  });
});
