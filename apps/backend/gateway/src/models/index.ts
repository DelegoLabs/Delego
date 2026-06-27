import { User } from "./User.js";
import { Wallet } from "./Wallet.js";
import { Delegation } from "./Delegation.js";
import { SpendLimit } from "./SpendLimit.js";
import { DelegationPolicy } from "./DelegationPolicy.js";
import { PermissionLevel } from "./PermissionLevel.js";
import { RefreshToken } from "./RefreshToken.js";

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

export {
  User,
  Wallet,
  Delegation,
  SpendLimit,
  DelegationPolicy,
  PermissionLevel,
  RefreshToken,
};
