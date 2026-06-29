import type { IncomingMessage, ServerResponse } from "node:http";
import { extractAuth } from "./auth.js";
import { Delegation } from "../src/models/index.js";
import { notFound, forbidden, unauthorized } from "../src/errors.js";

export interface DelegationOwnershipCheck {
  userId: string;
  delegationId: string;
  owned: boolean;
}

const ownershipContexts = new WeakMap<IncomingMessage, DelegationOwnershipCheck>();

/**
 * Retrieve the delegation ownership check context populated by verifyDelegationOwnership(),
 * instead of reading ad-hoc properties off the request.
 */
export function getDelegationOwnershipContext(req: IncomingMessage): DelegationOwnershipCheck | undefined {
  return ownershipContexts.get(req);
}

/**
 * Middleware that verifies delegation ownership before allowing update or revoke actions.
 * 
 * This middleware checks if the authenticated user is the owner of the specified delegation.
 * It follows existing route conventions:
 * - Returns 404 if the delegation does not exist
 * - Returns 403 if the delegation exists but the user is not the owner
 * 
 * The ownership check result is attached to the request context via getDelegationOwnershipContext().
 * 
 * @example
 * ```ts
 * import { verifyDelegationOwnership } from "../middleware/delegationOwnership.js";
 * 
 * router.put("/delegations/:id", verifyDelegationOwnership(), updateDelegationHandler);
 * router.delete("/delegations/:id", verifyDelegationOwnership(), revokeDelegationHandler);
 * ```
 */
export function verifyDelegationOwnership() {
  return async (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void): Promise<void> => {
    const auth = extractAuth(req);
    if (!auth.userId) {
      unauthorized(res, "Authentication required");
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const delegationId = url.pathname.split("/").pop();

    if (!delegationId) {
      notFound(res, "Delegation ID not provided");
      return;
    }

    try {
      const delegation = await Delegation.findOne({
        where: { id: delegationId },
      });

      if (!delegation) {
        notFound(res, "Delegation not found");
        return;
      }

      const ownershipCheck: DelegationOwnershipCheck = {
        userId: auth.userId,
        delegationId: delegation.id,
        owned: delegation.userId === auth.userId,
      };

      ownershipContexts.set(req, ownershipCheck);

      if (!ownershipCheck.owned) {
        forbidden(res, "You do not have permission to modify this delegation");
        return;
      }

      next();
    } catch (err: any) {
      forbidden(res, "Failed to verify delegation ownership");
    }
  };
}

/**
 * Helper function to check delegation ownership without middleware.
 * This can be used in handlers that need to perform ownership checks programmatically.
 * 
 * @param userId - The user ID to check ownership for
 * @param delegationId - The delegation ID to check
 * @returns Promise<DelegationOwnershipCheck> - The ownership check result
 * 
 * @example
 * ```ts
 * const ownership = await checkDelegationOwnership(auth.userId, delegationId);
 * if (!ownership.owned) {
 *   forbidden(res, "You do not have permission to modify this delegation");
 *   return;
 * }
 * ```
 */
export async function checkDelegationOwnership(
  userId: string,
  delegationId: string
): Promise<DelegationOwnershipCheck> {
  const delegation = await Delegation.findOne({
    where: { id: delegationId },
  });

  if (!delegation) {
    return {
      userId,
      delegationId,
      owned: false,
    };
  }

  return {
    userId,
    delegationId: delegation.id,
    owned: delegation.userId === userId,
  };
}
