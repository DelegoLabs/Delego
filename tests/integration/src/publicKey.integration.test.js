import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerRoutes } from "../../../apps/backend/wallet/dist/src/routes.js";

describe("Integration: public key validation at route boundaries", () => {
  it("rejects secret keys in transaction submission body", async () => {
    const routes = registerRoutes();
    const submitRoute = routes.find(r => r.method === "POST" && r.pattern.test("/transactions/submit"));
    if (!submitRoute) throw new Error("Submit route not found");

    const req = { headers: { host: "localhost" }, url: "/transactions/submit" };
    let status = 200;
    let body = "";
    const res = {
      writeHead(s, _h) { status = s; },
      end(b) { body = b; }
    };

    // Use an obviously invalid secret as sourceAddress
    const badBody = JSON.stringify({ sourceAddress: "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", contractId: "C", method: "m", args: [] });

    // Simulate req.on data/end to deliver JSON
    req.on = (ev, cb) => {
      if (ev === "data") cb(badBody);
      if (ev === "end") cb();
    };

    await submitRoute.handler(req, res, {});

    assert.equal(status, 400);
    const parsed = body ? JSON.parse(body) : null;
    // The route wraps errors as { data: null, error: { code: "SUBMISSION_FAILED"|... }}
    assert.ok(parsed && parsed.error && parsed.error.message);
  });
});
