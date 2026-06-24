/**
 * Unit tests for OAuth2/OpenID Connect integration — issue #66.
 *
 * All tests are fully offline: provider HTTP calls are stubbed via
 * globalThis.fetch mocking, and database model methods are monkey-patched
 * in-process.  No network or database connection is required.
 *
 * Test sections:
 *   1. generateOAuthState / verifyOAuthState  — CSRF state JWT
 *   2. buildAuthorizationUrl                  — redirect URL construction
 *   3. handleOAuthCallback — profile sync     — new user creation path
 *   4. handleOAuthCallback — wallet provision — Stellar key generation
 *   5. handleOAuthCallback — account linking  — existing email merge
 *   6. handleOAuthCallback — returning user   — known OAuthAccount lookup
 *   7. Error paths                            — unsupported provider, bad state, provider errors
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  generateOAuthState,
  verifyOAuthState,
  buildAuthorizationUrl,
  handleOAuthCallback,
  OAuthProviderError,
  OAuthStateMismatchError,
} from "../../../apps/backend/gateway/dist/src/auth/oauthService.js";

import { User } from "../../../apps/backend/gateway/dist/src/models/User.js";
import { Wallet } from "../../../apps/backend/gateway/dist/src/models/Wallet.js";
import { OAuthAccount } from "../../../apps/backend/gateway/dist/src/models/OAuthAccount.js";
import { RefreshToken } from "../../../apps/backend/gateway/dist/src/models/RefreshToken.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock user object that matches the shape authService uses. */
function mockUser(overrides = {}) {
  return {
    id: "user-uuid-001",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: "https://example.com/avatar.png",
    stellarAddress: null,
    passwordHash: null,
    update: async function (fields) {
      Object.assign(this, fields);
      return this;
    },
    reload: async function () { return this; },
    ...overrides,
  };
}

/** Build a minimal mock OAuthAccount object. */
function mockOAuthAccount(userId, provider, providerUserId, overrides = {}) {
  return {
    id: "oauth-uuid-001",
    userId,
    provider,
    providerUserId,
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: null,
    update: async function (fields) {
      Object.assign(this, fields);
      return this;
    },
    destroy: async function () { },
    ...overrides,
  };
}

/** Minimal Sequelize transaction stub — immediately invokes the callback. */
function mockTransaction() {
  let committed = false;
  return {
    _stub: true,
    commit: async () => { committed = true; },
    rollback: async () => { },
    wasCommitted: () => committed,
  };
}

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

before(() => {
  // Set provider credentials so config lookups don't throw OAuthConfigError
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.GITHUB_CLIENT_ID = "test-github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
  process.env.OAUTH_CALLBACK_BASE_URL = "http://localhost:3000";
  process.env.JWT_SECRET = "unit-test-secret";
  process.env.STELLAR_NETWORK = "testnet";
});

// ---------------------------------------------------------------------------
// 1. State JWT — generateOAuthState / verifyOAuthState
// ---------------------------------------------------------------------------

describe("OAuth state parameter (CSRF JWT)", () => {
  it("should generate a non-empty JWT state string", () => {
    const state = generateOAuthState("google");
    assert.ok(typeof state === "string" && state.length > 0);
    // JWT has three dot-separated parts
    assert.equal(state.split(".").length, 3);
  });

  it("should verify a freshly generated state without throwing", () => {
    const state = generateOAuthState("google");
    assert.doesNotThrow(() => verifyOAuthState(state, "google"));
  });

  it("should verify github state for github provider", () => {
    const state = generateOAuthState("github");
    assert.doesNotThrow(() => verifyOAuthState(state, "github"));
  });

  it("should throw OAuthStateMismatchError when provider in state does not match", () => {
    const state = generateOAuthState("google");
    assert.throws(
      () => verifyOAuthState(state, "github"),
      (err) => err instanceof OAuthStateMismatchError
    );
  });

  it("should throw OAuthStateMismatchError for a tampered/invalid state token", () => {
    assert.throws(
      () => verifyOAuthState("totally.invalid.state", "google"),
      (err) => err instanceof OAuthStateMismatchError
    );
  });

  it("should throw OAuthStateMismatchError for an empty state string", () => {
    assert.throws(
      () => verifyOAuthState("", "google"),
      (err) => err instanceof OAuthStateMismatchError
    );
  });
});

// ---------------------------------------------------------------------------
// 2. buildAuthorizationUrl
// ---------------------------------------------------------------------------

describe("buildAuthorizationUrl", () => {
  it("should build a valid Google authorization URL", () => {
    const url = buildAuthorizationUrl("google");
    assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    assert.ok(url.includes("client_id=test-google-client-id"));
    assert.ok(url.includes("response_type=code"));
    assert.ok(url.includes("scope="));
    assert.ok(url.includes("state="));
    assert.ok(url.includes("redirect_uri="));
    assert.ok(url.includes(encodeURIComponent("http://localhost:3000/api/v1/auth/oauth/google/callback")));
  });

  it("should build a valid GitHub authorization URL", () => {
    const url = buildAuthorizationUrl("github");
    assert.ok(url.startsWith("https://github.com/login/oauth/authorize?"));
    assert.ok(url.includes("client_id=test-github-client-id"));
    assert.ok(url.includes("scope="));
    assert.ok(url.includes("state="));
  });

  it("should include access_type=offline for Google", () => {
    const url = buildAuthorizationUrl("google");
    assert.ok(url.includes("access_type=offline"));
  });

  it("should embed a verifiable state JWT in the URL", () => {
    const url = buildAuthorizationUrl("google");
    const params = new URLSearchParams(url.split("?")[1]);
    const state = params.get("state");
    assert.ok(state);
    // Should verify without throwing
    assert.doesNotThrow(() => verifyOAuthState(state, "google"));
  });
});

// ---------------------------------------------------------------------------
// Shared fetch / model stubs for handleOAuthCallback tests
// ---------------------------------------------------------------------------

// We stub sequelize.transaction to run the callback synchronously
import { sequelize } from "../../../apps/backend/gateway/dist/src/db.js";

const originalTransaction = sequelize.transaction.bind(sequelize);
const originalFetch = globalThis.fetch;

// Saved originals for model methods
const orig = {
  userFindOne: User.findOne,
  userFindByPk: User.findByPk,
  userCreate: User.create,
  userUpdate: User.update,
  walletFindOne: Wallet.findOne,
  walletCreate: Wallet.create,
  oauthFindOne: OAuthAccount.findOne,
  oauthCreate: OAuthAccount.create,
  refreshCreate: RefreshToken.create,
};

after(() => {
  // Restore everything
  globalThis.fetch = originalFetch;
  sequelize.transaction = originalTransaction;
  Object.assign(User, {
    findOne: orig.userFindOne,
    findByPk: orig.userFindByPk,
    create: orig.userCreate,
    update: orig.userUpdate,
  });
  Object.assign(Wallet, { findOne: orig.walletFindOne, create: orig.walletCreate });
  Object.assign(OAuthAccount, { findOne: orig.oauthFindOne, create: orig.oauthCreate });
  RefreshToken.create = orig.refreshCreate;
});

/** Install the transaction stub so callbacks execute inline without a real DB. */
function stubTransaction() {
  sequelize.transaction = async (callback) => {
    const t = mockTransaction();
    return callback(t);
  };
}

// ---------------------------------------------------------------------------
// Stub builder for Google provider HTTP calls
// ---------------------------------------------------------------------------

function stubGoogleFetch({ tokenResponse = {}, userInfoResponse = {} } = {}) {
  const defaultToken = { access_token: "goog-access-token" };
  const defaultUserInfo = {
    sub: "google-user-123",
    email: "google@example.com",
    name: "Google User",
    picture: "https://google.com/photo.jpg",
  };

  globalThis.fetch = async (url, _opts) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ ...defaultToken, ...tokenResponse }) };
    }
    if (u.includes("openidconnect.googleapis.com/v1/userinfo")) {
      return { ok: true, json: async () => ({ ...defaultUserInfo, ...userInfoResponse }) };
    }
    throw new Error(`Unexpected fetch to: ${u}`);
  };
}

// ---------------------------------------------------------------------------
// Stub builder for GitHub provider HTTP calls
// ---------------------------------------------------------------------------

function stubGitHubFetch({ tokenResponse = {}, userResponse = {}, emailsResponse = null } = {}) {
  const defaultToken = { access_token: "gh-access-token" };
  const defaultUser = {
    id: 98765,
    login: "ghuser",
    name: "GitHub User",
    email: "gh@example.com",
    avatar_url: "https://github.com/avatar.jpg",
  };

  globalThis.fetch = async (url, _opts) => {
    const u = String(url);
    if (u.includes("github.com/login/oauth/access_token")) {
      return { ok: true, json: async () => ({ ...defaultToken, ...tokenResponse }) };
    }
    if (u.includes("api.github.com/user/emails")) {
      const emails = emailsResponse ?? [
        { email: "gh@example.com", primary: true, verified: true },
      ];
      return { ok: true, json: async () => emails };
    }
    if (u.includes("api.github.com/user")) {
      return { ok: true, json: async () => ({ ...defaultUser, ...userResponse }) };
    }
    throw new Error(`Unexpected fetch to: ${u}`);
  };
}

// ---------------------------------------------------------------------------
// 3. handleOAuthCallback — new user profile sync
// ---------------------------------------------------------------------------

describe("handleOAuthCallback — new user creation (profile sync)", () => {
  beforeEach(() => {
    stubTransaction();
    // No existing OAuth link
    OAuthAccount.findOne = async () => null;
    // No existing user by email
    User.findOne = async () => null;
    // User creation
    const newUser = mockUser();
    User.create = async () => newUser;
    User.update = async () => [1];
    // No existing wallet
    Wallet.findOne = async () => null;
    // Wallet creation
    Wallet.create = async (data) => ({
      id: "wallet-001",
      userId: data.userId,
      stellarAddress: data.stellarAddress,
      publicKey: data.publicKey,
      network: data.network,
    });
    // OAuth link creation
    OAuthAccount.create = async () => ({});
    // Refresh token creation
    RefreshToken.create = async () => ({});
  });

  it("should return a user object with the Google profile fields", async () => {
    stubGoogleFetch();
    const state = generateOAuthState("google");

    const result = await handleOAuthCallback("google", "auth-code-123", state);

    assert.equal(result.user.email, "google@example.com");
    assert.equal(result.user.displayName, "Google User");
    assert.equal(result.user.avatarUrl, "https://google.com/photo.jpg");
    assert.ok(result.isNewUser);
  });

  it("should return a user object with GitHub profile fields", async () => {
    stubGitHubFetch();
    const state = generateOAuthState("github");

    const result = await handleOAuthCallback("github", "gh-code-456", state);

    assert.equal(result.user.email, "gh@example.com");
    assert.ok(result.isNewUser);
  });

  it("should return valid accessToken and refreshToken", async () => {
    stubGoogleFetch();
    const state = generateOAuthState("google");

    const result = await handleOAuthCallback("google", "auth-code-123", state);

    assert.ok(typeof result.accessToken === "string" && result.accessToken.length > 0);
    assert.ok(typeof result.refreshToken === "string" && result.refreshToken.length > 0);
    assert.ok(typeof result.expiresIn === "number" && result.expiresIn > 0);
  });

  it("should mark isNewUser=true for first-time registration", async () => {
    stubGoogleFetch();
    const state = generateOAuthState("google");
    const result = await handleOAuthCallback("google", "code", state);
    assert.equal(result.isNewUser, true);
  });

  it("should use GitHub login as displayName when name is absent", async () => {
    stubGitHubFetch({ userResponse: { name: null, login: "my-gh-handle" } });
    const state = generateOAuthState("github");

    const result = await handleOAuthCallback("github", "code", state);

    assert.equal(result.user.displayName, "my-gh-handle");
  });

  it("should fall back to /user/emails when GitHub email is private", async () => {
    stubGitHubFetch({
      userResponse: { email: null },
      emailsResponse: [
        { email: "private@example.com", primary: true, verified: true },
      ],
    });
    const state = generateOAuthState("github");

    const result = await handleOAuthCallback("github", "code", state);

    assert.equal(result.user.email, "private@example.com");
  });
});

// ---------------------------------------------------------------------------
// 4. handleOAuthCallback — wallet provisioning
// ---------------------------------------------------------------------------

describe("handleOAuthCallback — Stellar wallet provisioning", () => {
  it("should provision a wallet for a brand-new user (valid Stellar public key)", async () => {
    stubTransaction();
    stubGoogleFetch();

    let createdWalletData = null;
    let userUpdatedWithAddress = null;

    OAuthAccount.findOne = async () => null;
    User.findOne = async () => null;
    User.create = async () => mockUser();
    User.update = async (fields) => {
      if (fields.stellarAddress) userUpdatedWithAddress = fields.stellarAddress;
      return [1];
    };
    Wallet.findOne = async () => null;
    Wallet.create = async (data) => {
      createdWalletData = data;
      return { id: "wallet-001", ...data };
    };
    OAuthAccount.create = async () => ({});
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    await handleOAuthCallback("google", "code", state);

    // A wallet must have been created
    assert.ok(createdWalletData !== null, "Wallet.create was not called");

    // Stellar public key starts with 'G' and is 56 chars
    assert.ok(
      typeof createdWalletData.stellarAddress === "string",
      "stellarAddress should be a string"
    );
    assert.equal(createdWalletData.stellarAddress[0], "G");
    assert.equal(createdWalletData.stellarAddress.length, 56);

    // publicKey should equal stellarAddress (as per wallet service pattern)
    assert.equal(createdWalletData.publicKey, createdWalletData.stellarAddress);

    // User record should be updated with the same address
    assert.equal(userUpdatedWithAddress, createdWalletData.stellarAddress);
  });

  it("should NOT create a second wallet if one already exists (idempotent)", async () => {
    stubTransaction();
    stubGoogleFetch();

    let walletCreateCallCount = 0;
    const existingWallet = { id: "wallet-existing", stellarAddress: "GEXISTING123456789012345678901234567890123456" };

    OAuthAccount.findOne = async () => null;
    User.findOne = async () => null;
    User.create = async () => mockUser();
    User.update = async () => [1];
    Wallet.findOne = async () => existingWallet; // wallet already exists
    Wallet.create = async () => {
      walletCreateCallCount++;
      return existingWallet;
    };
    OAuthAccount.create = async () => ({});
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    await handleOAuthCallback("google", "code", state);

    assert.equal(walletCreateCallCount, 0, "Wallet.create should not be called when wallet exists");
  });

  it("should not provision a wallet for returning users", async () => {
    stubTransaction();
    stubGoogleFetch();

    let walletCreateCallCount = 0;
    const existingUser = mockUser({ stellarAddress: "GEXISTING1234567890ABCDEF1234567890ABCDEF12" });
    const existingOAuth = mockOAuthAccount(existingUser.id, "google", "google-user-123");

    OAuthAccount.findOne = async () => existingOAuth;
    User.findByPk = async () => existingUser;
    Wallet.create = async () => {
      walletCreateCallCount++;
    };
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    await handleOAuthCallback("google", "code", state);

    assert.equal(walletCreateCallCount, 0, "Wallet.create must not be called for returning users");
  });
});

// ---------------------------------------------------------------------------
// 5. handleOAuthCallback — account linking (existing email)
// ---------------------------------------------------------------------------

describe("handleOAuthCallback — account linking for existing email", () => {
  it("should link OAuth identity to existing user when email already exists", async () => {
    stubTransaction();
    stubGoogleFetch();

    let oauthCreateCalled = false;
    let oauthCreateArgs = null;

    const existingUser = mockUser({ email: "google@example.com" });

    OAuthAccount.findOne = async () => null;             // no prior OAuth link
    User.findOne = async () => existingUser;             // but user with this email exists
    User.update = async () => [1];
    Wallet.findOne = async () => null;
    Wallet.create = async (d) => ({ id: "w1", ...d });
    OAuthAccount.create = async (data) => {
      oauthCreateCalled = true;
      oauthCreateArgs = data;
      return {};
    };
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    const result = await handleOAuthCallback("google", "code", state);

    assert.ok(oauthCreateCalled, "OAuthAccount.create should be called to link the identity");
    assert.equal(oauthCreateArgs.userId, existingUser.id);
    assert.equal(oauthCreateArgs.provider, "google");
    assert.equal(oauthCreateArgs.providerUserId, "google-user-123");
    assert.equal(result.user.id, existingUser.id);
    // Existing user — isNewUser depends on whether the User row itself was new
    assert.equal(result.isNewUser, false);
  });
});

// ---------------------------------------------------------------------------
// 6. handleOAuthCallback — returning user (known OAuthAccount)
// ---------------------------------------------------------------------------

describe("handleOAuthCallback — returning user (existing OAuthAccount)", () => {
  it("should not create a new user for a returning OAuth user", async () => {
    stubTransaction();
    stubGoogleFetch();

    let userCreateCallCount = 0;
    const existingUser = mockUser({ stellarAddress: "GRETURNING1234567890ABCDEF1234567890ABCDEF" });
    const existingOAuth = mockOAuthAccount(existingUser.id, "google", "google-user-123");

    OAuthAccount.findOne = async () => existingOAuth;
    User.findByPk = async () => existingUser;
    User.create = async () => { userCreateCallCount++; return existingUser; };
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    const result = await handleOAuthCallback("google", "code", state);

    assert.equal(userCreateCallCount, 0, "User.create must not be called for returning users");
    assert.equal(result.user.id, existingUser.id);
    assert.equal(result.isNewUser, false);
  });

  it("should update profile fields on each login (sync display name and avatar)", async () => {
    stubTransaction();
    stubGoogleFetch({
      userInfoResponse: {
        sub: "google-user-123",
        email: "google@example.com",
        name: "Updated Name",
        picture: "https://google.com/new-photo.jpg",
      },
    });

    let oauthUpdateArgs = null;
    const existingUser = mockUser({ displayName: null, avatarUrl: null });
    const existingOAuth = mockOAuthAccount(existingUser.id, "google", "google-user-123", {
      update: async (fields) => {
        oauthUpdateArgs = fields;
        Object.assign(existingOAuth, fields);
        return existingOAuth;
      },
    });

    OAuthAccount.findOne = async () => existingOAuth;
    User.findByPk = async () => existingUser;
    RefreshToken.create = async () => ({});

    const state = generateOAuthState("google");
    await handleOAuthCallback("google", "code", state);

    assert.ok(oauthUpdateArgs !== null, "OAuthAccount.update should have been called");
    assert.equal(oauthUpdateArgs.displayName, "Updated Name");
    assert.equal(oauthUpdateArgs.avatarUrl, "https://google.com/new-photo.jpg");
  });

  it("should issue fresh tokens on each returning login", async () => {
    stubTransaction();
    stubGoogleFetch();

    const existingUser = mockUser({ stellarAddress: "GRETURNING1234567890ABCDEF1234567890ABCDEF" });
    const existingOAuth = mockOAuthAccount(existingUser.id, "google", "google-user-123");

    OAuthAccount.findOne = async () => existingOAuth;
    User.findByPk = async () => existingUser;
    RefreshToken.create = async () => ({});

    const state1 = generateOAuthState("google");
    const result1 = await handleOAuthCallback("google", "code1", state1);

    const state2 = generateOAuthState("google");
    const result2 = await handleOAuthCallback("google", "code2", state2);

    // Each login should issue a new, distinct token pair
    assert.notEqual(result1.accessToken, result2.accessToken);
    assert.notEqual(result1.refreshToken, result2.refreshToken);
  });
});

// ---------------------------------------------------------------------------
// 7. Error paths
// ---------------------------------------------------------------------------

describe("handleOAuthCallback — error paths", () => {
  it("should throw OAuthProviderError for unsupported providers", async () => {
    const state = generateOAuthState("google"); // any valid state
    await assert.rejects(
      handleOAuthCallback("twitter", "code", state),
      (err) => err instanceof OAuthProviderError
    );
  });

  it("should throw OAuthStateMismatchError for an invalid state JWT", async () => {
    await assert.rejects(
      handleOAuthCallback("google", "code", "invalid-state-jwt"),
      (err) => err instanceof OAuthStateMismatchError
    );
  });

  it("should throw OAuthStateMismatchError when state provider mismatches URL provider", async () => {
    const githubState = generateOAuthState("github");
    await assert.rejects(
      handleOAuthCallback("google", "code", githubState),
      (err) => err instanceof OAuthStateMismatchError
    );
  });

  it("should throw OAuthProviderError when token exchange returns an error field", async () => {
    stubTransaction();
    globalThis.fetch = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return {
          ok: true,
          json: async () => ({ error: "invalid_grant", error_description: "Code expired" }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const state = generateOAuthState("google");
    await assert.rejects(
      handleOAuthCallback("google", "expired-code", state),
      (err) => err instanceof OAuthProviderError && err.message.includes("Code expired")
    );
  });

  it("should throw OAuthProviderError when token exchange HTTP request fails", async () => {
    stubTransaction();
    globalThis.fetch = async (url) => {
      if (String(url).includes("oauth2.googleapis.com/token")) {
        return { ok: false, status: 503, text: async () => "Service Unavailable" };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const state = generateOAuthState("google");
    await assert.rejects(
      handleOAuthCallback("google", "code", state),
      (err) => err instanceof OAuthProviderError
    );
  });

  it("should throw OAuthProviderError when Google userinfo has no email", async () => {
    stubTransaction();
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token")) {
        return { ok: true, json: async () => ({ access_token: "tok" }) };
      }
      if (u.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return { ok: true, json: async () => ({ sub: "123" }) }; // missing email
      }
      throw new Error(`Unexpected fetch: ${u}`);
    };

    const state = generateOAuthState("google");
    await assert.rejects(
      handleOAuthCallback("google", "code", state),
      (err) => err instanceof OAuthProviderError && err.message.includes("email")
    );
  });

  it("should throw OAuthProviderError when GitHub account has no accessible email", async () => {
    stubTransaction();
    stubGitHubFetch({
      userResponse: { email: null },
      emailsResponse: [], // no emails at all
    });

    const state = generateOAuthState("github");
    await assert.rejects(
      handleOAuthCallback("github", "code", state),
      (err) => err instanceof OAuthProviderError && err.message.includes("email")
    );
  });

  it("should throw OAuthProviderError when Google userinfo has no sub", async () => {
    stubTransaction();
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token")) {
        return { ok: true, json: async () => ({ access_token: "tok" }) };
      }
      if (u.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return { ok: true, json: async () => ({ email: "a@b.com" }) }; // missing sub
      }
      throw new Error(`Unexpected fetch: ${u}`);
    };

    const state = generateOAuthState("google");
    await assert.rejects(
      handleOAuthCallback("google", "code", state),
      (err) => err instanceof OAuthProviderError && err.message.includes("sub")
    );
  });
});
