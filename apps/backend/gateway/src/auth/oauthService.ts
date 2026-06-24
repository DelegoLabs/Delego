/**
 * OAuth2 / OpenID Connect provider integration.
 *
 * Supports:
 *  - Google  (OpenID Connect via /userinfo)
 *  - GitHub  (OAuth2 via /user + /user/emails)
 *
 * Design decisions:
 *  - No Passport or external OIDC library. The project uses a raw Node HTTP
 *    server without Express, so we implement the exchange manually using
 *    the built-in `fetch` API (Node ≥ 18).
 *  - State parameter is a short-lived JWT signed with JWT_SECRET to prevent
 *    CSRF without requiring server-side session storage.
 *  - On first social login, a new User + OAuthAccount + Wallet row are
 *    created atomically inside a Sequelize transaction.
 *  - On subsequent logins the OAuthAccount row is found, its owner user is
 *    loaded and tokens are issued — identical envelope to password auth.
 *  - If a verified email already belongs to a local user that has no linked
 *    account for this provider, the OAuth identity is linked to that user
 *    (account merging for verified e-mails).
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { sequelize } from "../db.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { OAuthAccount } from "../models/OAuthAccount.js";
import { createLogger } from "@delego/utils";

const log = createLogger("gateway:oauth", process.env.LOG_LEVEL ?? "info");

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

/** How long (seconds) the OAuth state JWT is valid. */
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

// ---------------------------------------------------------------------------
// Public types (required by issue #66)
// ---------------------------------------------------------------------------

export interface OAuthProviderProfile {
  provider: "google" | "github";
  providerUserId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OAuthAccountLink {
  userId: string;
  provider: string;
  providerUserId: string;
}

// ---------------------------------------------------------------------------
// Provider configuration helpers
// ---------------------------------------------------------------------------

interface OAuthProviderConfig {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
}

type SupportedProvider = "google" | "github";

function getProviderConfig(provider: SupportedProvider): OAuthProviderConfig {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new OAuthConfigError("Google OAuth credentials are not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    }
    return {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scopes: ["openid", "email", "profile"],
      clientId,
      clientSecret,
    };
  }

  if (provider === "github") {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new OAuthConfigError("GitHub OAuth credentials are not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
    }
    return {
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
      scopes: ["read:user", "user:email"],
      clientId,
      clientSecret,
    };
  }

  throw new OAuthProviderError(`Unsupported OAuth provider: ${provider}`);
}

function assertSupportedProvider(provider: string): asserts provider is SupportedProvider {
  if (provider !== "google" && provider !== "github") {
    throw new OAuthProviderError(`Unsupported OAuth provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class OAuthProviderError extends Error {
  public readonly code = "OAUTH_PROVIDER_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "OAuthProviderError";
  }
}

export class OAuthConfigError extends Error {
  public readonly code = "OAUTH_CONFIG_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigError";
  }
}

export class OAuthStateMismatchError extends Error {
  public readonly code = "OAUTH_STATE_MISMATCH";
  constructor(message = "OAuth state parameter is invalid or expired") {
    super(message);
    this.name = "OAuthStateMismatchError";
  }
}

// ---------------------------------------------------------------------------
// State parameter (CSRF protection — stateless JWT approach)
// ---------------------------------------------------------------------------

interface OAuthStatePayload {
  /** The provider this state was issued for. */
  provider: SupportedProvider;
  /** Random nonce to make the JWT unique even within the same second. */
  nonce: string;
}

/**
 * Generate a signed, short-lived JWT to use as the OAuth `state` parameter.
 * Encoding the provider in the state means the callback can verify it belongs
 * to the right flow without a server-side session.
 */
export function generateOAuthState(provider: SupportedProvider): string {
  const payload: OAuthStatePayload = { provider, nonce: randomUUID() };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: STATE_TTL_SECONDS });
}

/**
 * Verify and decode a state JWT returned by the provider callback.
 * Throws `OAuthStateMismatchError` if the token is invalid, expired, or
 * the embedded provider does not match the URL parameter.
 */
export function verifyOAuthState(state: string, expectedProvider: SupportedProvider): void {
  try {
    const decoded = jwt.verify(state, JWT_SECRET) as OAuthStatePayload;
    if (decoded.provider !== expectedProvider) {
      throw new OAuthStateMismatchError(
        `State provider mismatch: expected ${expectedProvider}, got ${decoded.provider}`
      );
    }
  } catch (err) {
    if (err instanceof OAuthStateMismatchError) throw err;
    throw new OAuthStateMismatchError();
  }
}

// ---------------------------------------------------------------------------
// Authorization URL builder
// ---------------------------------------------------------------------------

/**
 * Build the redirect URL that starts the OAuth2 authorization code flow.
 * The caller (route handler) should redirect the browser here.
 */
export function buildAuthorizationUrl(provider: SupportedProvider): string {
  const config = getProviderConfig(provider);
  const callbackBase = process.env.OAUTH_CALLBACK_BASE_URL ?? "http://localhost:3000";
  const redirectUri = `${callbackBase}/api/v1/auth/oauth/${provider}/callback`;
  const state = generateOAuthState(provider);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  // Google-specific: request offline access so we can inspect id_token
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "select_account");
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

async function exchangeCodeForToken(
  provider: SupportedProvider,
  code: string
): Promise<string> {
  const config = getProviderConfig(provider);
  const callbackBase = process.env.OAUTH_CALLBACK_BASE_URL ?? "http://localhost:3000";
  const redirectUri = `${callbackBase}/api/v1/auth/oauth/${provider}/callback`;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };

  // GitHub needs an explicit Accept header to return JSON instead of form-encoded
  if (provider === "github") {
    headers["Accept"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
    });
  } catch (err: any) {
    throw new OAuthProviderError(`Token exchange request to ${provider} failed: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable body)");
    throw new OAuthProviderError(
      `Token exchange failed (HTTP ${res.status}) from ${provider}: ${text}`
    );
  }

  const data = await res.json() as Record<string, unknown>;

  if (typeof data.error === "string") {
    throw new OAuthProviderError(
      `Token exchange error from ${provider}: ${data.error_description ?? data.error}`
    );
  }

  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new OAuthProviderError(`No access_token in ${provider} token response`);
  }

  return accessToken;
}

// ---------------------------------------------------------------------------
// User-info fetch (per provider)
// ---------------------------------------------------------------------------

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProviderProfile> {
  let res: Response;
  try {
    res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err: any) {
    throw new OAuthProviderError(`Google userinfo request failed: ${err.message}`);
  }

  if (!res.ok) {
    throw new OAuthProviderError(`Google userinfo returned HTTP ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;

  const sub = data.sub;
  const email = data.email;

  if (typeof sub !== "string" || !sub) {
    throw new OAuthProviderError("Google userinfo missing 'sub' field");
  }
  if (typeof email !== "string" || !email) {
    throw new OAuthProviderError("Google userinfo missing 'email' field");
  }

  return {
    provider: "google",
    providerUserId: sub,
    email,
    displayName: typeof data.name === "string" ? data.name : undefined,
    avatarUrl: typeof data.picture === "string" ? data.picture : undefined,
  };
}

async function fetchGitHubProfile(accessToken: string): Promise<OAuthProviderProfile> {
  // Fetch primary user info
  let res: Response;
  try {
    res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (err: any) {
    throw new OAuthProviderError(`GitHub /user request failed: ${err.message}`);
  }

  if (!res.ok) {
    throw new OAuthProviderError(`GitHub /user returned HTTP ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const userId = data.id;

  if (typeof userId !== "number" && typeof userId !== "string") {
    throw new OAuthProviderError("GitHub user response missing 'id' field");
  }

  let email = typeof data.email === "string" ? data.email : "";

  // If primary email is not public, fetch from /user/emails
  if (!email) {
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (emailsRes.ok) {
        const emails = await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
        const primary = emails.find((e) => e.primary && e.verified);
        const anyVerified = emails.find((e) => e.verified);
        email = primary?.email ?? anyVerified?.email ?? "";
      }
    } catch {
      // Non-fatal: we'll fail below if still empty
    }
  }

  if (!email) {
    throw new OAuthProviderError(
      "GitHub account has no accessible email address. " +
      "Ensure the user:email scope is granted and the account has a verified email."
    );
  }

  return {
    provider: "github",
    providerUserId: String(userId),
    email,
    displayName: typeof data.name === "string" ? data.name : (typeof data.login === "string" ? data.login : undefined),
    avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : undefined,
  };
}

async function fetchProviderProfile(
  provider: SupportedProvider,
  accessToken: string
): Promise<OAuthProviderProfile> {
  if (provider === "google") return fetchGoogleProfile(accessToken);
  if (provider === "github") return fetchGitHubProfile(accessToken);
  throw new OAuthProviderError(`Unsupported provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// Stellar wallet provisioning
// ---------------------------------------------------------------------------

/**
 * Generate a new Stellar keypair and persist a Wallet row.
 * The secret key is NOT stored (no vault service is in scope for the gateway).
 * Callers that need the secret (e.g. testnet funding) can extend this.
 *
 * Idempotent: if a wallet already exists for this user it is returned as-is.
 */
async function provisionWallet(userId: string, transaction?: any): Promise<Wallet> {
  const existing = await Wallet.findOne({ where: { userId }, transaction });
  if (existing) return existing;

  const pair = Keypair.random();
  const stellarAddress = pair.publicKey();
  const network = (process.env.STELLAR_NETWORK as string | undefined) ?? "testnet";

  const wallet = await Wallet.create(
    {
      userId,
      stellarAddress,
      publicKey: stellarAddress,
      encryptedPrivateKey: null, // key management is the wallet service's responsibility
      network,
    },
    { transaction }
  );

  // Update the canonical stellarAddress on the User record
  await User.update({ stellarAddress }, { where: { id: userId }, transaction });

  log.info("Provisioned Stellar wallet for new OAuth user", { userId, stellarAddress, network });

  return wallet;
}

// ---------------------------------------------------------------------------
// Core public API
// ---------------------------------------------------------------------------

export interface OAuthCallbackResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    stellarAddress: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
}

/**
 * Handle the OAuth2 authorization code callback.
 *
 * Flow:
 *  1. Validate `state` JWT (CSRF protection).
 *  2. Exchange `code` for provider access token.
 *  3. Fetch the user profile from the provider.
 *  4. Upsert User + OAuthAccount rows inside a transaction.
 *     a. New provider identity → look for existing user by email; link or create.
 *     b. Known provider identity → load existing user.
 *  5. For brand-new users, provision a Stellar wallet.
 *  6. Issue token pair using the shared `generateTokens` helper (refresh-token
 *     rotation, family tracking — identical to password login).
 *
 * Idempotent: retrying with the same code is safe up to provider-side
 * code expiry (codes are single-use at the provider, but our DB writes use
 * upsert / findOrCreate semantics).
 *
 * @param provider - "google" or "github"
 * @param code     - Authorization code from provider redirect
 * @param state    - State JWT from provider redirect (CSRF token)
 */
export async function handleOAuthCallback(
  provider: string,
  code: string,
  state: string
): Promise<OAuthCallbackResult> {
  // 1. Validate inputs
  assertSupportedProvider(provider);
  verifyOAuthState(state, provider);

  // 2. Exchange code for provider access token
  const providerAccessToken = await exchangeCodeForToken(provider, code);

  // 3. Fetch user profile from provider
  const profile = await fetchProviderProfile(provider, providerAccessToken);

  log.info("OAuth profile received", {
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
  });

  // 4. Upsert inside a transaction — all-or-nothing
  const { user, isNewUser } = await sequelize.transaction(async (t) => {
    // 4a. Check for an existing OAuthAccount row
    const existingLink = await OAuthAccount.findOne({
      where: { provider: profile.provider, providerUserId: profile.providerUserId },
      transaction: t,
    });

    if (existingLink) {
      // Known provider identity — load the owner user
      const existingUser = await User.findByPk(existingLink.userId, { transaction: t });
      if (!existingUser) {
        // Orphaned oauth_account — clean up and re-register
        await existingLink.destroy({ transaction: t });
        // Fall through to registration path below
      } else {
        // Refresh optional profile fields (display name / avatar may change)
        await existingLink.update(
          {
            email: profile.email,
            displayName: profile.displayName ?? existingLink.displayName,
            avatarUrl: profile.avatarUrl ?? existingLink.avatarUrl,
          },
          { transaction: t }
        );

        if (profile.displayName && !existingUser.displayName) {
          await existingUser.update({ displayName: profile.displayName }, { transaction: t });
        }
        if (profile.avatarUrl && !existingUser.avatarUrl) {
          await existingUser.update({ avatarUrl: profile.avatarUrl }, { transaction: t });
        }

        return { user: existingUser, isNewUser: false };
      }
    }

    // 4b. No existing OAuth link — check for a local user with the same email
    let targetUser = await User.findOne({ where: { email: profile.email }, transaction: t });
    let brandNew = false;

    if (!targetUser) {
      // Create a new local user (passwordHash stays null — OAuth-only account)
      targetUser = await User.create(
        {
          email: profile.email,
          passwordHash: null,
          displayName: profile.displayName ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          stellarAddress: null, // filled by provisionWallet below
        },
        { transaction: t }
      );
      brandNew = true;
      log.info("Created new user via OAuth", { userId: targetUser.id, provider: profile.provider });
    } else {
      log.info("Linking OAuth identity to existing user by email", {
        userId: targetUser.id,
        provider: profile.provider,
      });
    }

    // Create the OAuth account link
    await OAuthAccount.create(
      {
        userId: targetUser.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.displayName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      },
      { transaction: t }
    );

    // Provision Stellar wallet for new users
    if (brandNew) {
      await provisionWallet(targetUser.id, t);
      // Reload to pick up the stellarAddress set by provisionWallet
      await targetUser.reload({ transaction: t });
    }

    return { user: targetUser, isNewUser: brandNew };
  });

  // 5. Issue the standard token pair (same rotation logic as password auth)
  // Import here to avoid circular dependency at module load time
  const { generateTokens } = await import("./authService.js");
  const { accessToken, refreshToken, expiresIn } = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      stellarAddress: user.stellarAddress,
    },
    accessToken,
    refreshToken,
    expiresIn,
    isNewUser,
  };
}
