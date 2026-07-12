/**
 * OpenAPI Route Specifications
 * Defines minimal OpenAPI-compatible schemas for gateway endpoints
 */

export interface OpenApiRouteSpec {
  method: string;
  path: string;
  requestSchema?: unknown;
  responseSchema: unknown;
}

export interface ErrorSchema {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ErrorSchema | null;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

// Auth Endpoint Schemas

export interface RegisterRequestSchema {
  email: string;
  password: string;
  displayName?: string;
}

export interface RegisterResponseSchema {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  accessToken: string;
  expiresIn: number;
}

export const registerRouteSpec: OpenApiRouteSpec = {
  method: "POST",
  path: "/api/v1/auth/register",
  requestSchema: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: 8,
        description: "Password must be at least 8 characters",
      },
      displayName: {
        type: "string",
        description: "Optional display name for the user",
      },
    },
    required: ["email", "password"],
    additionalProperties: false,
  },
  responseSchema: {
    success: {
      statusCode: 201,
      schema: {
        data: {
          user: {
            id: "uuid",
            email: "user@example.com",
            displayName: "John Doe",
          },
          accessToken: "jwt_token_here",
          expiresIn: 900,
        },
        error: null,
      },
    },
    errors: [
      {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        description: "Invalid email format or password too short",
        example: {
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: [{ field: "email", message: "must match format email" }],
          },
        },
      },
      {
        statusCode: 400,
        code: "BAD_REQUEST",
        description: "User already exists or other registration error",
        example: {
          data: null,
          error: {
            code: "BAD_REQUEST",
            message: "User with this email already exists",
          },
        },
      },
    ],
  },
};

export interface LoginRequestSchema {
  email: string;
  password: string;
}

export interface LoginResponseSchema {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  accessToken: string;
  expiresIn: number;
}

export const loginRouteSpec: OpenApiRouteSpec = {
  method: "POST",
  path: "/api/v1/auth/login",
  requestSchema: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string" },
    },
    required: ["email", "password"],
    additionalProperties: false,
  },
  responseSchema: {
    success: {
      statusCode: 200,
      schema: {
        data: {
          user: {
            id: "uuid",
            email: "user@example.com",
            displayName: "John Doe",
          },
          accessToken: "jwt_token_here",
          expiresIn: 900,
        },
        error: null,
      },
    },
    errors: [
      {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        description: "Invalid email format or missing password",
        example: {
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: [{ field: "email", message: "must match format email" }],
          },
        },
      },
      {
        statusCode: 401,
        code: "UNAUTHORIZED",
        description: "Invalid email or password",
        example: {
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          },
        },
      },
    ],
  },
};

export interface RefreshRequestSchema {
  // No request body - token comes from cookies
}

export interface RefreshResponseSchema {
  accessToken: string;
  expiresIn: number;
}

export const refreshRouteSpec: OpenApiRouteSpec = {
  method: "POST",
  path: "/api/v1/auth/refresh",
  requestSchema: {
    type: "object",
    description:
      "No request body required. Refresh token must be in HttpOnly cookie (refresh_token).",
    properties: {},
    required: [],
  },
  responseSchema: {
    success: {
      statusCode: 200,
      schema: {
        data: {
          accessToken: "new_jwt_token_here",
          expiresIn: 900,
        },
        error: null,
      },
    },
    errors: [
      {
        statusCode: 401,
        code: "UNAUTHORIZED",
        description: "Missing refresh token or token invalid/expired",
        example: {
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Refresh token missing",
          },
        },
      },
      {
        statusCode: 401,
        code: "UNAUTHORIZED",
        description: "Token reuse detected (security violation)",
        example: {
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Token reuse detected",
          },
        },
      },
    ],
  },
};

export interface LogoutRequestSchema {
  // No request body
}

export interface LogoutResponseSchema {
  success: boolean;
}

export const logoutRouteSpec: OpenApiRouteSpec = {
  method: "POST",
  path: "/api/v1/auth/logout",
  requestSchema: {
    type: "object",
    description: "No request body required. Authorization header required.",
    properties: {},
    required: [],
  },
  responseSchema: {
    success: {
      statusCode: 200,
      schema: {
        data: {
          success: true,
        },
        error: null,
      },
    },
    errors: [
      {
        statusCode: 401,
        code: "UNAUTHORIZED",
        description: "Missing or invalid Authorization header",
        example: {
          data: null,
          error: {
            code: "UNAUTHORIZED",
            message: "Missing Authorization header",
          },
        },
      },
      {
        statusCode: 500,
        code: "INTERNAL_ERROR",
        description: "Logout operation failed due to server error",
        example: {
          data: null,
          error: {
            code: "INTERNAL_ERROR",
            message: "Logout failed",
          },
        },
      },
    ],
  },
};

// Export all auth route specs
export const authRouteSpecs: OpenApiRouteSpec[] = [
  registerRouteSpec,
  loginRouteSpec,
  refreshRouteSpec,
  logoutRouteSpec,
];
