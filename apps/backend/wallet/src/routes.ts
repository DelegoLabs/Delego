import type { IncomingMessage } from "node:http";
import { route, json, isValidStellarPublicKey, validatePublicKeyMiddleware, type Route } from "@delego/utils";
import { accountService } from "../stellar/account.js";
import { transactionService } from "../transactions/index.js";
import { vaultService } from "./vault.js";
import type { StellarNetwork } from "@delego/types";
import { Asset, Networks, Horizon, TransactionBuilder, Transaction } from "@stellar/stellar-sdk";
import { getRedisConnection, getJobStatus } from "./queue/txQueue.js";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:routes", process.env.LOG_LEVEL ?? "info");

interface TokenBalance {
  assetCode: string;
  assetIssuer: string;
  balance: string;                    // in stroops
  balanceFormatted: string;           // with decimal places
  contractId: string | null;          // Soroban token contract ID if SAC
}

interface BalanceResponse {
  address: string;
  network: "testnet" | "mainnet";
  nativeBalance: string;              // XLM in stroops
  nativeBalanceFormatted: string;     // XLM with 7 decimal places
  tokenBalances: TokenBalance[];
  lastUpdated: string;                // ISO 8601
}

interface TransactionEntry {
  id: string;
  hash: string;
  ledger: number;
  type: "payment" | "contract_invocation" | "create_account" | "other";
  direction: "incoming" | "outgoing";
  amount: string | null;
  assetCode: string | null;
  counterparty: string | null;
  memo: string | null;
  timestamp: string;
  successful: boolean;
}

interface TransactionHistoryResponse {
  address: string;
  transactions: TransactionEntry[];
  cursor: string | null;              // for pagination
  hasMore: boolean;
}

function xlmToStroops(xlmStr: string): string {
  const parts = xlmStr.split(".");
  const whole = parts[0];
  let fraction = parts[1] || "";
  fraction = fraction.padEnd(7, "0").slice(0, 7);
  const combined = whole + fraction;
  const trimmed = combined.replace(/^0+/, "");
  return trimmed === "" ? "0" : trimmed;
}

// Helper to parse JSON body from incoming Node.js request
async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) as T : {} as T);
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

export function registerRoutes(): Route[] {
  const validateAddress = validatePublicKeyMiddleware("address");

  return [
    // Create new Stellar wallet (Master or Delegate keypair)
    route("POST", "/wallets/create", async (req, res) => {
      try {
        const body = await readJsonBody<{ network?: StellarNetwork }>(req);
        const network = body.network ?? "testnet";

        const account = await accountService.createAccount(network);
        json(res, 201, { data: account, error: null });
      } catch (err: any) {
        json(res, 400, {
          data: null,
          error: { code: "CREATE_WALLET_FAILED", message: err.message },
        });
      }
    }),

    // Retrieve details for a specific wallet address
    route("GET", "/wallets/:address", async (_req, res, params) => {
      try {
        await validateAddress(_req, res, params);
        if (res.writableEnded) return;

        const address = params.address;
        if (!address) {
          throw new Error("Address parameter is required");
        }
        const account = await accountService.getAccount(address);
        if (!account) {
          json(res, 404, {
            data: null,
            error: { code: "NOT_FOUND", message: `Wallet not found: ${address}` },
          });
          return;
        }
        json(res, 200, { data: account, error: null });
      } catch (err: any) {
        json(res, 400, {
          data: null,
          error: { code: "GET_WALLET_FAILED", message: err.message },
        });
      }
    }),

    // List all public addresses managed by this wallet service
    route("GET", "/wallets", async (_req, res) => {
      try {
        const publicKeys = await vaultService.listPublicKeys();
        json(res, 200, { data: publicKeys, error: null });
      } catch (err: any) {
        json(res, 500, {
          data: null,
          error: { code: "LIST_WALLETS_FAILED", message: err.message },
        });
      }
    }),

    // Simulate Soroban contract call
    route("POST", "/transactions/simulate", async (req, res) => {
      try {
        const body = await readJsonBody<{
          sourceAddress: string;
          contractId: string;
          method: string;
          args: unknown[];
          memo?: string;
        }>(req);

        if (!body.sourceAddress || !body.contractId || !body.method || !body.args) {
          throw new Error("Missing required transaction simulation parameters");
        }
        if (!isValidStellarPublicKey(body.sourceAddress)) {
          throw new Error("Malformed Stellar public key address");
        }

        const simResult = await transactionService.simulate({
          sourceAddress: body.sourceAddress,
          contractId: body.contractId,
          method: body.method,
          args: body.args,
          memo: body.memo ?? "Simulating transaction",
        });

        json(res, 200, { data: simResult, error: null });
      } catch (err: any) {
        json(res, 400, {
          data: null,
          error: { code: "SIMULATION_FAILED", message: err.message },
        });
      }
    }),

    // Sign and submit a transaction to Soroban
    route("POST", "/transactions/submit", async (req, res) => {
      try {
        const body = await readJsonBody<{
          sourceAddress: string;
          contractId: string;
          method: string;
          args: unknown[];
          memo?: string;
        }>(req);

        if (!body.sourceAddress || !body.contractId || !body.method || !body.args) {
          throw new Error("Missing required transaction submission parameters");
        }
        if (!isValidStellarPublicKey(body.sourceAddress)) {
          throw new Error("Malformed Stellar public key address");
        }

        const txResult = await transactionService.submit({
          sourceAddress: body.sourceAddress,
          contractId: body.contractId,
          method: body.method,
          args: body.args,
          memo: body.memo ?? "Submitting transaction",
        });

        json(res, 200, { data: txResult, error: null });
      } catch (err: any) {
        json(res, 400, {
          data: null,
          error: { code: "SUBMISSION_FAILED", message: err.message },
        });
      }
    }),

    // Get native XLM and token balances
    route("GET", "/api/v1/wallet/:address/balance", async (_req, res, params) => {
      try {
        await validateAddress(_req, res, params);
        if (res.writableEnded) return;

        const address = params.address;

        if (!isValidStellarPublicKey(address)) {
          json(res, 400, {
            data: null,
            error: { code: "BAD_REQUEST", message: "Invalid Stellar address format" },
          });
          return;
        }

        const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase() as "testnet" | "mainnet";
        const horizonUrl = network === "mainnet"
          ? (process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org")
          : (process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org");
        const networkPassphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

        const redis = getRedisConnection();
        const cacheKey = `cache:balance:${address}`;
        
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(cached);
            return;
          }
        } catch (cacheErr: any) {
          log.warn("Redis read failed during balance query", { error: cacheErr.message });
        }

        const server = new Horizon.Server(horizonUrl);
        let account;
        try {
          account = await server.loadAccount(address);
        } catch (err: any) {
          if (err.response?.status === 404) {
            json(res, 404, {
              data: null,
              error: { code: "NOT_FOUND", message: "Account not found on the network" }
            });
            return;
          }
          if (err.response?.status === 429) {
            const retryAfter = err.response?.headers?.["retry-after"] || "30";
            res.writeHead(503, {
              "Content-Type": "application/json",
              "Retry-After": retryAfter
            });
            res.end(JSON.stringify({
              data: null,
              error: { code: "SERVICE_UNAVAILABLE", message: "Horizon server is currently rate limiting requests" }
            }));
            return;
          }
          throw err;
        }

        const nativeBalanceLine = account.balances.find((b: any) => b.asset_type === "native");
        const nativeBalance = nativeBalanceLine ? xlmToStroops(nativeBalanceLine.balance) : "0";
        const nativeBalanceFormatted = nativeBalanceLine ? nativeBalanceLine.balance : "0.0000000";

        const tokenBalances: TokenBalance[] = [];
        for (const b of account.balances) {
          if (b.asset_type === "native" || b.asset_type === "liquidity_pool_shares") {
            continue;
          }
          const code = b.asset_code;
          const issuer = b.asset_issuer;
          
          let contractId: string | null = null;
          try {
            const asset = new Asset(code, issuer);
            contractId = asset.contractId(networkPassphrase);
          } catch (err) {
            log.error("Failed to compute contractId for asset", { code, issuer, error: err });
          }

          tokenBalances.push({
            assetCode: code,
            assetIssuer: issuer,
            balance: xlmToStroops(b.balance),
            balanceFormatted: b.balance,
            contractId
          });
        }

        const balanceResponse: BalanceResponse = {
          address,
          network,
          nativeBalance,
          nativeBalanceFormatted,
          tokenBalances,
          lastUpdated: new Date().toISOString()
        };

        const responsePayload = { data: balanceResponse, error: null };
        const responseString = JSON.stringify(responsePayload);

        try {
          await redis.set(cacheKey, responseString, "EX", 10);
        } catch (cacheErr: any) {
          log.warn("Redis write failed during balance query", { error: cacheErr.message });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(responseString);
      } catch (err: any) {
        log.error("GET balance error", { error: err.message });
        json(res, 500, {
          data: null,
          error: { code: "INTERNAL_ERROR", message: err.message }
        });
      }
    }),

    // Get queue job status by job ID
    route("GET", "/api/v1/queue/jobs/:jobId", async (_req, res, params) => {
      try {
        const jobId = params.jobId;
        if (!jobId) {
          json(res, 400, {
            data: null,
            error: { code: "BAD_REQUEST", message: "jobId parameter is required" },
          });
          return;
        }

        const status = await getJobStatus(jobId);
        if (!status) {
          json(res, 404, {
            data: null,
            error: { code: "NOT_FOUND", message: `Job not found: ${jobId}` },
          });
          return;
        }

        json(res, 200, { data: status, error: null });
      } catch (err: any) {
        log.error("GET job status error", { error: err.message });
        json(res, 500, {
          data: null,
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    }),

    // Get recent transaction history
    route("GET", "/api/v1/wallet/:address/transactions", async (req, res, params) => {
      try {
        await validateAddress(req, res, params);
        if (res.writableEnded) return;

        const address = params.address;

        const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
        const cursorParam = url.searchParams.get("cursor");

        const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase() as "testnet" | "mainnet";
        const horizonUrl = network === "mainnet"
          ? (process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org")
          : (process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org");
        const networkPassphrase = network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

        const server = new Horizon.Server(horizonUrl);
        
        let txResponse;
        try {
          // Verify account exists before retrieving history
          await server.loadAccount(address);
          
          let builder = server.transactions().forAccount(address).limit(20).order("desc");
          if (cursorParam) {
            builder = builder.cursor(cursorParam);
          }
          txResponse = await builder.call();
        } catch (err: any) {
          if (err.response?.status === 404) {
            json(res, 404, {
              data: null,
              error: { code: "NOT_FOUND", message: "Account not found on the network" }
            });
            return;
          }
          if (err.response?.status === 429) {
            const retryAfter = err.response?.headers?.["retry-after"] || "30";
            res.writeHead(503, {
              "Content-Type": "application/json",
              "Retry-After": retryAfter
            });
            res.end(JSON.stringify({
              data: null,
              error: { code: "SERVICE_UNAVAILABLE", message: "Horizon server is currently rate limiting requests" }
            }));
            return;
          }
          throw err;
        }

        const transactions: TransactionEntry[] = txResponse.records.map((tx: any) => {
          let operations: any[] = [];
          try {
            const parsedTx = TransactionBuilder.fromXDR(tx.envelope_xdr, networkPassphrase);
            if (parsedTx instanceof Transaction) {
              operations = parsedTx.operations;
            } else if ("innerTransaction" in parsedTx) {
              operations = parsedTx.innerTransaction.operations;
            }
          } catch (err) {
            log.error("Failed to parse transaction XDR", { hash: tx.hash, error: err });
          }

          const op = operations[0];
          let type: "payment" | "contract_invocation" | "create_account" | "other" = "other";
          let direction: "incoming" | "outgoing" = "outgoing";
          let amount: string | null = null;
          let assetCode: string | null = null;
          let counterparty: string | null = null;

          if (op) {
            if (op.type === "payment" || op.type === "pathPaymentStrictReceive" || op.type === "pathPaymentStrictSend") {
              type = "payment";
              amount = op.amount ? xlmToStroops(op.amount) : null;
              if (op.asset) {
                assetCode = op.asset.isNative() ? "XLM" : op.asset.getCode();
              }
              if (op.destination === address) {
                direction = "incoming";
                counterparty = op.source || tx.source_account;
              } else {
                direction = "outgoing";
                counterparty = op.destination;
              }
            } else if (op.type === "createAccount") {
              type = "create_account";
              amount = op.startingBalance ? xlmToStroops(op.startingBalance) : null;
              assetCode = "XLM";
              if (op.destination === address) {
                direction = "incoming";
                counterparty = op.source || tx.source_account;
              } else {
                direction = "outgoing";
                counterparty = op.destination;
              }
            } else if (op.type === "invokeHostFunction") {
              type = "contract_invocation";
              direction = tx.source_account === address ? "outgoing" : "incoming";
              counterparty = op.source || tx.source_account;
            } else {
              type = "other";
              direction = tx.source_account === address ? "outgoing" : "incoming";
              counterparty = op.source || tx.source_account;
            }
          } else {
            direction = tx.source_account === address ? "outgoing" : "incoming";
          }

          return {
            id: tx.id,
            hash: tx.hash,
            ledger: tx.ledger_attr || tx.ledger,
            type,
            direction,
            amount,
            assetCode,
            counterparty,
            memo: tx.memo || null,
            timestamp: tx.created_at,
            successful: tx.successful
          };
        });

        const nextRecord = txResponse.records[txResponse.records.length - 1];
        const nextCursor = nextRecord ? nextRecord.paging_token : null;
        const hasMore = txResponse.records.length === 20;

        const historyResponse: TransactionHistoryResponse = {
          address,
          transactions,
          cursor: nextCursor,
          hasMore
        };

        json(res, 200, { data: historyResponse, error: null });
      } catch (err: any) {
        log.error("GET transactions history error", { error: err.message });
        json(res, 500, {
          data: null,
          error: { code: "INTERNAL_ERROR", message: err.message }
        });
      }
    }),
  ];
}
