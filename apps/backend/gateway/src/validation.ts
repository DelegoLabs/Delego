import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new (Ajv as any)();
(addFormats as any)(ajv);

export interface ValidationErrorDetail {
  field: string;
  message: string;
  keyword: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface CreateDelegationPolicyPayload {
  agentId: string;
  walletId: string;
  label: string;
  policy: {
    maxPerTransaction: string;
    maxTotal: string;
    allowedMerchants: string[];
    allowedCategories: string[];
    expiresAt?: string | null;
  };
  permissionLevel: "VIEW_ONLY" | "AUTO_APPROVE" | "SIGNER" | "ADMIN";
}

export interface UpdateDelegationPayload {
  status?: "pending" | "active" | "paused" | "revoked" | "expired";
  policy?: {
    maxPerTransaction?: string;
    maxTotal?: string;
    allowedMerchants?: string[];
    allowedCategories?: string[];
    expiresAt?: string | null;
  };
}

export const RegisterSchema: any = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
    displayName: { type: "string" }
  },
  required: ["email", "password"],
  additionalProperties: false
};

export const LoginSchema: any = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string" }
  },
  required: ["email", "password"],
  additionalProperties: false
};

export const CreateDelegationSchema: any = {
  type: "object",
  properties: {
    agentId: { type: "string", format: "uuid" },
    walletId: { type: "string", format: "uuid" },
    label: { type: "string" },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string", pattern: "^[0-9]+$" },
        maxTotal: { type: "string", pattern: "^[0-9]+$" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string", format: "date-time" }
      },
      required: ["maxPerTransaction", "maxTotal", "allowedMerchants", "allowedCategories"],
      additionalProperties: false
    },
    permissionLevel: { type: "string", enum: ["VIEW_ONLY", "AUTO_APPROVE", "SIGNER", "ADMIN"] }
  },
  required: ["agentId", "walletId", "label", "policy", "permissionLevel"],
  additionalProperties: false
};

export const UpdateDelegationSchema: any = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["pending", "active", "paused", "revoked", "expired"] },
    policy: {
      type: "object",
      properties: {
        maxPerTransaction: { type: "string", pattern: "^[0-9]+$" },
        maxTotal: { type: "string", pattern: "^[0-9]+$" },
        allowedMerchants: { type: "array", items: { type: "string" } },
        allowedCategories: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string", format: "date-time" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

export interface CreateOrderIssuePayload {
  category: "late" | "damaged" | "not_received" | "other";
  message?: string;
  photoUrl?: string;
}

export interface CreateDisputePayload {
  category: "late" | "damaged" | "not_received" | "other";
  message: string;
  issueId?: string;
}

export const CreateOrderIssueSchema: any = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["late", "damaged", "not_received", "other"] },
    message: { type: "string", maxLength: 2000 },
    photoUrl: { type: "string", format: "uri" },
  },
  required: ["category"],
  additionalProperties: false,
};

export const CreateDisputeSchema: any = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["late", "damaged", "not_received", "other"] },
    message: { type: "string", minLength: 1, maxLength: 4000 },
    issueId: { type: "string", format: "uuid" },
  },
  required: ["category", "message"],
  additionalProperties: false,
};

export interface BulkUpdateApprovalsPayload {
  ids: string[];
  status: "approved" | "rejected";
}

export const BulkUpdateApprovalsSchema: any = {
  type: "object",
  properties: {
    ids: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1, maxItems: 500 },
    status: { type: "string", enum: ["approved", "rejected"] },
  },
  required: ["ids", "status"],
  additionalProperties: false,
};

export function validateSchema(schema: any, data: unknown): { valid: boolean; errors?: ValidationErrorDetail[] } {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  if (valid) {
    return { valid: true };
  } else {
    const errors: ValidationErrorDetail[] = (validate.errors ?? []).map((err: any) => ({
      field: err.instancePath.slice(1) || "body",
      message: err.message ?? "Invalid value",
      keyword: err.keyword
    }));
    return { valid: false, errors };
  }
}
