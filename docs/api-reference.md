# API Reference

This document provides the API reference for the Delego platform. The API is currently under development and will be expanded as features are implemented.

> **Note**: This API reference will be automatically generated from the OpenAPI specification once the gateway routes are fully implemented. This document serves as a placeholder and planning reference.

## 📋 Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
- [Webhooks](#webhooks)

## Overview

The Delego API is a RESTful API that provides access to the platform's core functionality, including user management, delegation management, order processing, and wallet operations.

### API Versioning

The API uses URL versioning to ensure backward compatibility:

- **v1**: Current stable version
- **v2**: Future versions (when needed)

### Rate Limiting

API requests are rate-limited to prevent abuse:

- **Default**: 100 requests per minute per user
- **Burst**: 200 requests per minute per user
- **Headers**: Rate limit information included in response headers

## Authentication

### JWT Authentication

Most API endpoints require authentication via JWT tokens.

#### Obtaining a Token

```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

#### Using the Token

Include the JWT token in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

#### Token Refresh

JWT tokens expire after 24 hours. Use the refresh endpoint to obtain a new token:

```bash
POST /api/v1/auth/refresh
Authorization: Bearer <your-jwt-token>
```

### Wallet Authentication

Some endpoints support wallet-based authentication using Stellar wallet signatures.

#### Wallet Connection

```bash
POST /api/v1/wallet/connect
Content-Type: application/json

{
  "stellarAddress": "GABCD...",
  "signature": "..."
}
```

## Base URL

### Development

```
http://localhost:3000
```

### Staging

```
https://staging-api.delego.dev
```

### Production

```
https://api.delego.dev
```

## Response Format

All API responses follow a consistent format:

### Success Response

```json
{
  "data": {
    // Response data
  },
  "error": null,
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

### Error Response

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-01T00:00:00.000Z"
  }
}
```

## Error Handling

### HTTP Status Codes

- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

### Error Codes

| Code                   | Description                 |
| ---------------------- | --------------------------- |
| `VALIDATION_ERROR`     | Request validation failed   |
| `AUTHENTICATION_ERROR` | Authentication failed       |
| `AUTHORIZATION_ERROR`  | Authorization failed        |
| `NOT_FOUND`            | Resource not found          |
| `RATE_LIMIT_EXCEEDED`  | Rate limit exceeded         |
| `INTERNAL_ERROR`       | Internal server error       |
| `BLOCKCHAIN_ERROR`     | Blockchain operation failed |

## Endpoints

### Health Check

#### `GET /health`

Health check endpoint for monitoring.

**Response:**

```json
{
  "data": {
    "status": "ok",
    "service": "gateway",
    "version": "0.0.1",
    "timestamp": "2026-01-01T00:00:00.000Z"
  },
  "error": null
}
```

### Authentication Endpoints

#### `POST /api/v1/auth/register`

Register a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "displayName": "John Doe"
}
```

**Request Schema:**

- `email` (string, required): User email in valid email format
- `password` (string, required): Password with minimum 8 characters
- `displayName` (string, optional): User's display name

**Success Response (201 Created):**

```json
{
  "data": {
    "user": {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "error": null
}
```

**Set-Cookie Header:**

- `refresh_token`: HttpOnly, Secure, SameSite=Strict cookie with 7-day expiration

**Error Responses:**

- **400 Bad Request (VALIDATION_ERROR)**: Invalid email format or password too short

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "password",
        "message": "must be >= 8 characters"
      }
    ]
  }
}
```

- **400 Bad Request (BAD_REQUEST)**: User already exists

```json
{
  "data": null,
  "error": {
    "code": "BAD_REQUEST",
    "message": "User with this email already exists"
  }
}
```

#### `POST /api/v1/auth/login`

Authenticate user with email and password.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Request Schema:**

- `email` (string, required): User email in valid email format
- `password` (string, required): User password

**Success Response (200 OK):**

```json
{
  "data": {
    "user": {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "error": null
}
```

**Set-Cookie Header:**

- `refresh_token`: HttpOnly, Secure, SameSite=Strict cookie with 7-day expiration

**Error Responses:**

- **400 Bad Request (VALIDATION_ERROR)**: Invalid email format or missing password

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body"
  }
}
```

- **401 Unauthorized**: Invalid email or password

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password"
  }
}
```

#### `POST /api/v1/auth/refresh`

Refresh access token using refresh token from cookies.

**Headers:**

- No Authorization header required
- Refresh token automatically sent in cookies by the browser

**Request Body:**
No request body required. Refresh token comes from HttpOnly cookie.

**Success Response (200 OK):**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  },
  "error": null
}
```

**Set-Cookie Header:**

- `refresh_token`: New refresh token with 7-day expiration

**Error Responses:**

- **401 Unauthorized**: Missing refresh token

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Refresh token missing"
  }
}
```

- **401 Unauthorized**: Invalid or expired refresh token

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid refresh token"
  }
}
```

- **401 Unauthorized**: Refresh token expired

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Refresh token expired"
  }
}
```

- **401 Unauthorized**: Token reuse detected (security violation)

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token reuse detected"
  }
}
```

#### `POST /api/v1/auth/logout`

Logout user and clear refresh token.

**Headers:**

```
Authorization: Bearer <access-token>
```

**Request Body:**
No request body required.

**Success Response (200 OK):**

```json
{
  "data": {
    "success": true
  },
  "error": null
}
```

**Set-Cookie Header:**

- `refresh_token`: Cleared with past expiration date

**Error Responses:**

- **401 Unauthorized**: Missing Authorization header

```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing Authorization header"
  }
}
```

- **500 Internal Server Error**: Logout operation failed

```json
{
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Logout failed"
  }
}
```

### Wallet

#### `POST /api/v1/wallet/connect`

Connect Stellar wallet.

**Request Body:**

```json
{
  "stellarAddress": "GABCD...",
  "signature": "signature_here"
}
```

**Response:**

```json
{
  "data": {
    "walletId": "wallet_123",
    "stellarAddress": "GABCD...",
    "connected": true
  },
  "error": null
}
```

#### `GET /api/v1/wallet/balance`

Get wallet balance.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "balance": 10000000,
    "currency": "XLM"
  },
  "error": null
}
```

### Delegations

#### `GET /api/v1/delegations`

List user delegations.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

- `status`: Filter by status (optional)
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:**

```json
{
  "data": {
    "delegations": [
      {
        "id": "del_123",
        "agentType": "buyer",
        "spendingLimit": 10000000,
        "status": "active",
        "createdAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  },
  "error": null
}
```

#### `POST /api/v1/delegations`

Create new delegation.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "agentType": "buyer",
  "spendingLimit": 10000000,
  "approvalThreshold": 5000000
}
```

**Response:**

```json
{
  "data": {
    "id": "del_123",
    "agentType": "buyer",
    "spendingLimit": 10000000,
    "approvalThreshold": 5000000,
    "status": "active",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "error": null
}
```

#### `GET /api/v1/delegations/:id`

Get delegation details.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "id": "del_123",
    "agentType": "buyer",
    "spendingLimit": 10000000,
    "approvalThreshold": 5000000,
    "status": "active",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "error": null
}
```

#### `DELETE /api/v1/delegations/:id`

Revoke delegation.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "success": true
  },
  "error": null
}
```

### Orders

#### `GET /api/v1/orders`

List user orders.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

- `status`: Filter by status (optional)
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:**

```json
{
  "data": {
    "orders": [
      {
        "id": "order_123",
        "status": "initiated",
        "totalAmount": 10000000,
        "currency": "XLM",
        "createdAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  },
  "error": null
}
```

#### `POST /api/v1/orders`

Create new order.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "delegationId": "del_123",
  "items": [
    {
      "productId": "prod_456",
      "quantity": 1
    }
  ]
}
```

**Response:**

```json
{
  "data": {
    "id": "order_123",
    "status": "initiated",
    "totalAmount": 10000000,
    "currency": "XLM",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "error": null
}
```

#### `GET /api/v1/orders/:id`

Get order details.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "id": "order_123",
    "status": "initiated",
    "totalAmount": 10000000,
    "currency": "XLM",
    "items": [...],
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "error": null
}
```

#### `POST /api/v1/orders/:id/approve`

Approve order for execution.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "success": true,
    "orderStatus": "approved"
  },
  "error": null
}
```

#### `POST /api/v1/orders/:id/cancel`

Cancel order.

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "success": true,
    "orderStatus": "cancelled"
  },
  "error": null
}
```

## Webhooks

### Webhook Events

Delego sends webhook events to notify your application of important events:

- `order.created`: New order created
- `order.approved`: Order approved
- `order.completed`: Order completed
- `order.cancelled`: Order cancelled
- `delegation.created`: New delegation created
- `delegation.revoked`: Delegation revoked

### Webhook Configuration

Configure webhooks via the API or dashboard:

```bash
POST /api/v1/webhooks
Authorization: Bearer <token>

{
  "url": "https://your-app.com/webhook",
  "events": ["order.created", "order.completed"],
  "secret": "webhook_secret"
}
```

### Webhook Signature

Webhook requests include a signature header for verification:

```
X-Delego-Signature: sha256=signature_here
```

## SDKs

### JavaScript/TypeScript SDK

```typescript
import { DelegoClient } from "@delego/sdk";

const client = new DelegoClient({
  apiKey: "your-api-key",
  baseURL: "https://api.delego.dev",
});

// Get delegations
const delegations = await client.delegations.list();

// Create delegation
const delegation = await client.delegations.create({
  agentType: "buyer",
  spendingLimit: 10000000,
});
```

### Python SDK (Planned)

```python
from delego import DelegoClient

client = DelegoClient(api_key='your-api-key')

# Get delegations
delegations = client.delegations.list()

# Create delegation
delegation = client.delegations.create(
    agent_type='buyer',
    spending_limit=10000000
)
```

## OpenAPI Specification

The full OpenAPI specification will be available at:

```
https://api.delego.dev/openapi.json
```

This can be used to generate client SDKs in various languages.

## Changelog

### v1.0.0 (Planned)

- Initial API release
- Authentication endpoints
- Wallet endpoints
- Delegation endpoints
- Order endpoints

---

**Last Updated**: June 2026
