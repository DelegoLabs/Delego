/**
 * OpenAPI 3.0 Specification (Issue #352)
 *
 * Complete OpenAPI 3.0 spec covering all gateway endpoints.
 * Includes request/response schemas, error codes, and examples.
 */

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ErrorSchema = {
  type: "object",
  properties: {
    code: { type: "string", description: "Machine-readable error code" },
    message: { type: "string", description: "Human-readable error message" },
    details: { type: "array", items: { type: "object" }, description: "Optional validation details" },
  },
  required: ["code", "message"],
};

const MetaSchema = {
  type: "object",
  properties: {
    requestId: { type: "string", format: "uuid" },
    timestamp: { type: "string", format: "date-time" },
  },
};

const ApiResponse = (dataSchema: any) => ({
  type: "object",
  properties: {
    data: dataSchema,
    error: { oneOf: [ErrorSchema, { type: "null" }] },
    meta: MetaSchema,
  },
});

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

const RegisterRequest = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8, description: "Minimum 8 characters" },
    displayName: { type: "string", description: "Optional display name" },
  },
  required: ["email", "password"],
  additionalProperties: false,
};

const UserSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: ["string", "null"] },
  },
};

const RegisterResponse = ApiResponse({
  type: "object",
  properties: {
    user: UserSchema,
    accessToken: { type: "string", description: "JWT access token" },
    expiresIn: { type: "number", description: "Token expiry in seconds" },
  },
});

const LoginRequest = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string" },
  },
  required: ["email", "password"],
  additionalProperties: false,
};

const LoginResponse = RegisterResponse;

const RefreshResponse = ApiResponse({
  type: "object",
  properties: {
    accessToken: { type: "string" },
    expiresIn: { type: "number" },
  },
});

const LogoutResponse = ApiResponse({
  type: "object",
  properties: {
    success: { type: "boolean" },
  },
});

// ---------------------------------------------------------------------------
// Delegation schemas
// ---------------------------------------------------------------------------

const DelegationPolicySchema = {
  type: "object",
  properties: {
    maxPerTransaction: { type: "string", description: "BigInt as string" },
    maxTotal: { type: "string", description: "BigInt as string" },
    allowedMerchants: { type: "array", items: { type: "string" } },
    allowedCategories: { type: "array", items: { type: "string" } },
    expiresAt: { type: ["string", "null"], format: "date-time" },
  },
};

const DelegationSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    agentId: { type: "string" },
    walletId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["active", "pending", "revoked"] },
    policy: DelegationPolicySchema,
    permissionLevel: { type: "string", enum: ["VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const CreateDelegationRequest = {
  type: "object",
  properties: {
    agentId: { type: "string", maxLength: 64 },
    walletId: { type: "string", format: "uuid" },
    label: { type: "string" },
    permissionLevel: { type: "string", enum: ["VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN"] },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string" },
        maxTotal: { type: "string" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string", format: "date-time" },
      },
      required: ["maxPerTransaction", "maxTotal"],
    },
  },
  required: ["agentId", "walletId", "permissionLevel", "policy"],
  additionalProperties: false,
};

const UpdateDelegationRequest = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["active", "revoked"] },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string" },
        maxTotal: { type: "string" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Wallet schemas
// ---------------------------------------------------------------------------

const WalletSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    stellarAddress: { type: "string", description: "G... Stellar public key" },
    publicKey: { type: "string" },
    network: { type: "string", enum: ["testnet", "mainnet"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

// ---------------------------------------------------------------------------
// Admin schemas
// ---------------------------------------------------------------------------

const RateLimitAnalyticsSchema = {
  type: "object",
  properties: {
    endpoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          endpoint: { type: "string" },
          totalRequests: { type: "number" },
          throttleCount: { type: "number" },
        },
      },
    },
    topUsers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          identifier: { type: "string" },
          requests: { type: "number" },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Health schema
// ---------------------------------------------------------------------------

const HealthSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    services: {
      type: "object",
      properties: {
        database: { type: "string" },
        redis: { type: "string" },
      },
    },
    uptime: { type: "number" },
  },
};

// ---------------------------------------------------------------------------
// Full OpenAPI 3.0 Document
// ---------------------------------------------------------------------------

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Delego Gateway API",
    description:
      "Delego gateway service — manages authentication, delegation policies, wallets, and admin operations.",
    version: "0.0.1",
    contact: {
      name: "DelegoLabs",
      url: "https://github.com/DelegoLabs/Delego",
    },
  },
  servers: [
    { url: "/", description: "Current server" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        description: "Returns service health status including database and Redis connectivity.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is healthy",
            content: { "application/json": { schema: ApiResponse(HealthSchema) } },
          },
        },
      },
    },
    "/api/v1/status": {
      get: {
        tags: ["System"],
        summary: "API v1 status",
        description: "Returns API version and availability information.",
        operationId: "getStatus",
        responses: {
          "200": {
            description: "API is operational",
            content: {
              "application/json": {
                schema: ApiResponse({
                  type: "object",
                  properties: {
                    version: { type: "string" },
                    status: { type: "string" },
                  },
                }),
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        description: "Creates a new user account and returns JWT tokens.",
        operationId: "register",
        requestBody: {
          required: true,
          content: { "application/json": { schema: RegisterRequest } },
        },
        responses: {
          "201": {
            description: "User registered successfully",
            content: { "application/json": { schema: RegisterResponse } },
          },
          "400": {
            description: "Validation error or user already exists",
            content: {
              "application/json": {
                schema: ApiResponse(null),
                examples: {
                  validation: {
                    summary: "Validation error",
                    value: { data: null, error: { code: "VALIDATION_ERROR", message: "Invalid request body" } },
                  },
                  exists: {
                    summary: "User exists",
                    value: { data: null, error: { code: "BAD_REQUEST", message: "User with this email already exists" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        description: "Authenticates a user and returns JWT tokens.",
        operationId: "login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: LoginRequest } },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: { "application/json": { schema: LoginResponse } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "401": {
            description: "Invalid credentials",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh access token",
        description: "Refreshes the access token using the HttpOnly refresh_token cookie.",
        operationId: "refreshToken",
        responses: {
          "200": {
            description: "Token refreshed",
            content: { "application/json": { schema: RefreshResponse } },
          },
          "401": {
            description: "Missing or invalid refresh token",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Invalidates the refresh token and clears the cookie.",
        operationId: "logout",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Logged out successfully",
            content: { "application/json": { schema: LogoutResponse } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/delegations": {
      post: {
        tags: ["Delegations"],
        summary: "Create delegation",
        description: "Creates a new delegation with policy, spend limits, and permission level.",
        operationId: "createDelegation",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: CreateDelegationRequest } },
        },
        responses: {
          "201": {
            description: "Delegation created",
            content: { "application/json": { schema: ApiResponse(DelegationSchema) } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "404": {
            description: "Wallet not found",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
      get: {
        tags: ["Delegations"],
        summary: "List delegations",
        description: "Lists all delegations for the authenticated user with cursor-based pagination.",
        operationId: "listDelegations",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          "200": {
            description: "List of delegations",
            content: { "application/json": { schema: ApiResponse({ type: "array", items: DelegationSchema }) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/delegations/{id}": {
      get: {
        tags: ["Delegations"],
        summary: "Get delegation",
        description: "Returns a single delegation by ID.",
        operationId: "getDelegation",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Delegation details",
            content: { "application/json": { schema: ApiResponse(DelegationSchema) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "404": {
            description: "Delegation not found",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
      patch: {
        tags: ["Delegations"],
        summary: "Update delegation",
        description: "Updates delegation policy, spend limits, or status.",
        operationId: "updateDelegation",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: UpdateDelegationRequest } },
        },
        responses: {
          "200": {
            description: "Delegation updated",
            content: { "application/json": { schema: ApiResponse(DelegationSchema) } },
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "404": {
            description: "Delegation not found",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
      delete: {
        tags: ["Delegations"],
        summary: "Revoke delegation",
        description: "Sets delegation status to 'revoked'.",
        operationId: "revokeDelegation",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Delegation revoked",
            content: {
              "application/json": {
                schema: ApiResponse({
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    status: { type: "string", enum: ["revoked"] },
                  },
                }),
              },
            },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "403": {
            description: "Forbidden",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "404": {
            description: "Delegation not found",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/wallets/{walletId}": {
      get: {
        tags: ["Wallets"],
        summary: "Get wallet",
        description: "Returns wallet details for the specified wallet ID.",
        operationId: "getWallet",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "walletId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Wallet details",
            content: { "application/json": { schema: ApiResponse(WalletSchema) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "404": {
            description: "Wallet not found",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
    "/api/v1/admin/rate-limit/metrics": {
      get: {
        tags: ["Admin"],
        summary: "Rate limit metrics",
        description: "Returns aggregated rate-limit analytics. Requires admin role.",
        operationId: "getRateLimitMetrics",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "topN", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
        ],
        responses: {
          "200": {
            description: "Rate limit analytics",
            content: { "application/json": { schema: ApiResponse(RateLimitAnalyticsSchema) } },
          },
          "401": {
            description: "Not authenticated",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
          "403": {
            description: "Admin role required",
            content: { "application/json": { schema: ApiResponse(null) } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token from /api/v1/auth/login or /api/v1/auth/register",
      },
    },
  },
  tags: [
    { name: "System", description: "Health and status endpoints" },
    { name: "Auth", description: "Authentication and token management" },
    { name: "Delegations", description: "Delegation CRUD and policy management" },
    { name: "Wallets", description: "Wallet information" },
    { name: "Admin", description: "Administrative endpoints (admin role required)" },
  ],
};
