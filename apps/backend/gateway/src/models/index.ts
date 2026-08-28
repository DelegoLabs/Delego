import { User } from "./User.js";
import { Wallet } from "./Wallet.js";
import { Delegation } from "./Delegation.js";
import { SpendLimit } from "./SpendLimit.js";
import { DelegationPolicy } from "./DelegationPolicy.js";
import { PermissionLevel } from "./PermissionLevel.js";
import { RefreshToken } from "./RefreshToken.js";
import { Order } from "./Order.js";
import { OrderIssue } from "./OrderIssue.js";
import { Dispute } from "./Dispute.js";
import { EscrowFeeConfig } from "./EscrowFeeConfig.js";
import { Approval } from "./Approval.js";

// User <-> Wallet (One-to-Many)
User.hasMany(Wallet, { foreignKey: "userId", as: "wallets" });
Wallet.belongsTo(User, { foreignKey: "userId", as: "user" });

// User <-> Delegation (One-to-Many)
User.hasMany(Delegation, { foreignKey: "userId", as: "delegations" });
Delegation.belongsTo(User, { foreignKey: "userId", as: "user" });

// User <-> SpendLimit (One-to-Many)
User.hasMany(SpendLimit, { foreignKey: "userId", as: "spendLimits" });
SpendLimit.belongsTo(User, { foreignKey: "userId", as: "user" });

// User <-> RefreshToken (One-to-Many)
User.hasMany(RefreshToken, { foreignKey: "userId", as: "refreshTokens" });
RefreshToken.belongsTo(User, { foreignKey: "userId", as: "user" });

// Wallet <-> SpendLimit (One-to-Many)
Wallet.hasMany(SpendLimit, { foreignKey: "walletId", as: "spendLimits" });
SpendLimit.belongsTo(Wallet, { foreignKey: "walletId", as: "wallet" });

// Delegation <-> SpendLimit (One-to-Many)
Delegation.hasMany(SpendLimit, { foreignKey: "delegationId", as: "spendLimits" });
SpendLimit.belongsTo(Delegation, { foreignKey: "delegationId", as: "delegation" });

// Delegation <-> DelegationPolicy (One-to-One)
Delegation.hasOne(DelegationPolicy, { foreignKey: "delegationId", as: "delegationPolicy" });
DelegationPolicy.belongsTo(Delegation, { foreignKey: "delegationId", as: "delegation" });

// Delegation <-> PermissionLevel (One-to-One)
Delegation.hasOne(PermissionLevel, { foreignKey: "delegationId", as: "permissionLevel" });
PermissionLevel.belongsTo(Delegation, { foreignKey: "delegationId", as: "delegation" });

// User <-> Order (One-to-Many)
User.hasMany(Order, { foreignKey: "userId", as: "orders" });
Order.belongsTo(User, { foreignKey: "userId", as: "user" });

// Order <-> OrderIssue (One-to-Many)
Order.hasMany(OrderIssue, { foreignKey: "orderId", as: "issues" });
OrderIssue.belongsTo(Order, { foreignKey: "orderId", as: "order" });

// Order <-> Dispute (One-to-Many)
Order.hasMany(Dispute, { foreignKey: "orderId", as: "disputes" });
Dispute.belongsTo(Order, { foreignKey: "orderId", as: "order" });

// OrderIssue <-> Dispute (One-to-Many; an issue may be escalated into a dispute)
OrderIssue.hasMany(Dispute, { foreignKey: "issueId", as: "disputes" });
Dispute.belongsTo(OrderIssue, { foreignKey: "issueId", as: "issue" });

export {
  User,
  Wallet,
  Delegation,
  SpendLimit,
  DelegationPolicy,
  PermissionLevel,
  RefreshToken,
  Order,
  OrderIssue,
  Dispute,
  EscrowFeeConfig,
  Approval,
};
