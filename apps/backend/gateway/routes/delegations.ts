import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { extractAuth } from "../middleware/auth.js";
import { validateSchema, CreateDelegationSchema, UpdateDelegationSchema } from "../src/validation.js";
import { sequelize } from "../src/db.js";
import { Delegation, DelegationPolicy, SpendLimit, PermissionLevel, Wallet } from "../src/models/index.js";
import { readJsonBody, InvalidJsonError, BodyTooLargeError } from "../src/request.js";

function formatDelegationResponse(delegation: Delegation, policy: DelegationPolicy, spendLimit: SpendLimit, permissionLevel: PermissionLevel): any {
  return {
    id: delegation.id,
    userId: delegation.userId,
    agentId: (delegation as any).agentId,
    walletId: spendLimit.walletId,
    status: delegation.status,
    policy: {
      maxPerTransaction: String(spendLimit.limitPerTransaction || 0),
      maxTotal: String(spendLimit.limitLifetime || 0),
      allowedMerchants: policy.allowedMerchants,
      allowedCategories: policy.allowedCategories,
      expiresAt: (delegation.policy as any)?.expiresAt || null,
    },
    permissionLevel: permissionLevel.level,
    createdAt: delegation.createdAt.toISOString(),
    updatedAt: delegation.updatedAt.toISOString(),
  };
}

export async function createDelegationHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const body = await readJsonBody(req);
    const validation = validateSchema(CreateDelegationSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors },
      });
      return;
    }

    // Check wallet ownership
    const wallet = await Wallet.findOne({
      where: { id: body.walletId, userId: auth.userId },
    });

    if (!wallet) {
      json(res, 404, {
        data: null,
        error: { code: "NOT_FOUND", message: "Wallet not found" },
      });
      return;
    }

    const result = await sequelize.transaction(async (t) => {
      const delegation = await Delegation.create(
        {
          userId: auth.userId,
          agentId: body.agentId,
          status: "active",
          policy: {
            label: body.label,
            expiresAt: body.policy.expiresAt,
          },
        },
        { transaction: t }
      );

      const delegationPolicy = await DelegationPolicy.create(
        {
          delegationId: delegation.id,
          allowedMerchants: body.policy.allowedMerchants,
          allowedCategories: body.policy.allowedCategories,
          restrictedMerchants: [],
          restrictedCategories: [],
        },
        { transaction: t }
      );

      const spendLimit = await SpendLimit.create(
        {
          userId: auth.userId,
          walletId: body.walletId,
          delegationId: delegation.id,
          limitPerTransaction: BigInt(body.policy.maxPerTransaction),
          limitLifetime: BigInt(body.policy.maxTotal),
        },
        { transaction: t }
      );

      const permissionLevel = await PermissionLevel.create(
        {
          delegationId: delegation.id,
          level: body.permissionLevel,
          canSign: body.permissionLevel === "SIGNER" || body.permissionLevel === "ADMIN",
          canMutatePolicy: body.permissionLevel === "ADMIN",
        },
        { transaction: t }
      );

      return { delegation, delegationPolicy, spendLimit, permissionLevel };
    });

    const response = formatDelegationResponse(
      result.delegation,
      result.delegationPolicy,
      result.spendLimit,
      result.permissionLevel
    );

    json(res, 201, { data: response, error: null });
  } catch (err: any) {
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    } else {
      json(res, 500, {
        data: null,
        error: { code: "INTERNAL_ERROR", message: err.message },
      });
    }
  }
}

export async function listDelegationsHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const delegations = await Delegation.findAll({
      where: { userId: auth.userId },
      include: [
        { model: DelegationPolicy, as: "delegationPolicy" },
        { model: SpendLimit, as: "spendLimits" },
        { model: PermissionLevel, as: "permissionLevel" },
      ],
    });

    const response = delegations.map((d) => {
      const policy = (d as any).delegationPolicy;
      const spendLimit = (d as any).spendLimits?.[0];
      const permissionLevel = (d as any).permissionLevel;
      return formatDelegationResponse(d, policy, spendLimit, permissionLevel);
    });

    json(res, 200, { data: response, error: null });
  } catch (err: any) {
    json(res, 500, {
      data: null,
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}

export async function getDelegationHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const delegation = await Delegation.findOne({
      where: { id: params.id, userId: auth.userId },
      include: [
        { model: DelegationPolicy, as: "delegationPolicy" },
        { model: SpendLimit, as: "spendLimits" },
        { model: PermissionLevel, as: "permissionLevel" },
      ],
    });

    if (!delegation) {
      json(res, 404, {
        data: null,
        error: { code: "NOT_FOUND", message: "Delegation not found" },
      });
      return;
    }

    const policy = (delegation as any).delegationPolicy;
    const spendLimit = (delegation as any).spendLimits?.[0];
    const permissionLevel = (delegation as any).permissionLevel;
    const response = formatDelegationResponse(delegation, policy, spendLimit, permissionLevel);

    json(res, 200, { data: response, error: null });
  } catch (err: any) {
    json(res, 500, {
      data: null,
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}

export async function updateDelegationHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const body = await readJsonBody(req);
    const validation = validateSchema(UpdateDelegationSchema, body);
    if (!validation.valid) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: validation.errors },
      });
      return;
    }

    const result = await sequelize.transaction(async (t) => {
      const delegation = await Delegation.findOne({
        where: { id: params.id, userId: auth.userId },
        transaction: t,
      });

      if (!delegation) {
        throw new Error("Delegation not found");
      }

      if (body.status) {
        await delegation.update({ status: body.status }, { transaction: t });
      }

      if (body.policy) {
        const policy = (delegation as any).policy || {};
        const newPolicy = {
          ...policy,
          ...(body.policy.expiresAt !== undefined && { expiresAt: body.policy.expiresAt }),
        };
        await delegation.update({ policy: newPolicy }, { transaction: t });

        const delegationPolicy = await DelegationPolicy.findOne({
          where: { delegationId: delegation.id },
          transaction: t,
        });
        if (delegationPolicy) {
          await delegationPolicy.update(
            {
              allowedMerchants: body.policy.allowedMerchants || delegationPolicy.allowedMerchants,
              allowedCategories: body.policy.allowedCategories || delegationPolicy.allowedCategories,
            },
            { transaction: t }
          );
        }

        const spendLimit = await SpendLimit.findOne({
          where: { delegationId: delegation.id },
          transaction: t,
        });
        if (spendLimit) {
          const updates: any = {};
          if (body.policy.maxPerTransaction) {
            updates.limitPerTransaction = BigInt(body.policy.maxPerTransaction);
          }
          if (body.policy.maxTotal) {
            updates.limitLifetime = BigInt(body.policy.maxTotal);
          }
          await spendLimit.update(updates, { transaction: t });
        }
      }

      const delegationReloaded = await Delegation.findOne({
        where: { id: params.id, userId: auth.userId },
        include: [
          { model: DelegationPolicy, as: "delegationPolicy" },
          { model: SpendLimit, as: "spendLimits" },
          { model: PermissionLevel, as: "permissionLevel" },
        ],
        transaction: t,
      });

      return delegationReloaded!;
    });

    const policy = (result as any).delegationPolicy;
    const spendLimit = (result as any).spendLimits?.[0];
    const permissionLevel = (result as any).permissionLevel;
    const response = formatDelegationResponse(result, policy, spendLimit, permissionLevel);

    json(res, 200, { data: response, error: null });
  } catch (err: any) {
    if (err instanceof InvalidJsonError || err instanceof BodyTooLargeError) {
      json(res, 400, {
        data: null,
        error: { code: "VALIDATION_ERROR", message: err.message },
      });
    } else if (err.message === "Delegation not found") {
      json(res, 404, {
        data: null,
        error: { code: "NOT_FOUND", message: err.message },
      });
    } else {
      json(res, 500, {
        data: null,
        error: { code: "INTERNAL_ERROR", message: err.message },
      });
    }
  }
}

export async function revokeDelegationHandler(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  try {
    const auth = extractAuth(req);
    if (!auth.userId) {
      json(res, 401, {
        data: null,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
      return;
    }

    const delegation = await Delegation.findOne({
      where: { id: params.id, userId: auth.userId },
    });

    if (!delegation) {
      json(res, 404, {
        data: null,
        error: { code: "NOT_FOUND", message: "Delegation not found" },
      });
      return;
    }

    await delegation.update({ status: "revoked" });

    json(res, 200, { data: { id: delegation.id, status: "revoked" }, error: null });
  } catch (err: any) {
    json(res, 500, {
      data: null,
      error: { code: "INTERNAL_ERROR", message: err.message },
    });
  }
}
