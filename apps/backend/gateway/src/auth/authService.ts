import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { User } from "../models/User.js";
import { RefreshToken } from "../models/index.js";
import { Op } from "sequelize";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RefreshTokenPayload {
  tokenId: string;
  familyId: string;
  userId: string;
  secret: string;
}

function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

async function generateRefreshToken(userId: string, familyId?: string): Promise<{ refreshToken: string; familyId: string; tokenId: string }> {
  const tokenId = randomUUID();
  const family = familyId ?? randomUUID();
  const expiresInMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const expiresAt = new Date(Date.now() + expiresInMs);
  const secret = randomUUID();
  const tokenHash = await bcrypt.hash(secret, 10);

  await RefreshToken.create({
    id: tokenId,
    userId,
    tokenHash,
    familyId: family,
    expiresAt,
  });

  const refreshToken = jwt.sign(
    { tokenId, familyId: family, userId, secret },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  return { refreshToken, familyId: family, tokenId };
}

export async function generateTokens(userId: string, familyId?: string): Promise<TokenPair> {
  const accessToken = generateAccessToken(userId);
  const { refreshToken } = await generateRefreshToken(userId, familyId);
  const expiresIn = 15 * 60; // 15 minutes in seconds
  return { accessToken, refreshToken, expiresIn };
}

export function verifyToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === "object" && decoded !== null && "userId" in decoded) {
    return decoded as { userId: string };
  }
  throw new Error("Invalid token structure");
}

function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (
    typeof decoded === "object" &&
    decoded !== null &&
    "tokenId" in decoded &&
    "familyId" in decoded &&
    "userId" in decoded &&
    "secret" in decoded
  ) {
    return decoded as RefreshTokenPayload;
  }
  throw new Error("Invalid refresh token structure");
}

export async function revokeTokenFamily(familyId: string): Promise<void> {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { familyId } }
  );
}

export async function refreshAccessToken(rawRefreshToken: string): Promise<TokenPair> {
  const decoded = verifyRefreshToken(rawRefreshToken);

  const tokenRecord = await RefreshToken.findByPk(decoded.tokenId);
  if (!tokenRecord) {
    throw new Error("Invalid refresh token");
  }

  const isSecretValid = await bcrypt.compare(decoded.secret, tokenRecord.tokenHash);
  if (!isSecretValid) {
    throw new Error("Invalid refresh token");
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new Error("Refresh token expired");
  }

  // Token reuse detected - revoke entire family
  if (tokenRecord.revokedAt) {
    await revokeTokenFamily(tokenRecord.familyId);
    throw new Error("Token reuse detected");
  }

  // Revoke the used refresh token atomically
  const [affectedCount] = await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { id: decoded.tokenId, revokedAt: { [Op.is]: null } } }
  );

  if (affectedCount === 0) {
    await revokeTokenFamily(tokenRecord.familyId);
    throw new Error("Token reuse detected");
  }

  // Generate new token pair
  return generateTokens(tokenRecord.userId, tokenRecord.familyId);
}

export function generateToken(userId: string): string {
  return generateAccessToken(userId);
}

export interface RegisterResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  token: string; // Backward compatibility
}

export async function registerUser(email: string, password: string, displayName?: string): Promise<RegisterResult> {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    displayName: displayName ?? null,
  });

  const { accessToken, refreshToken, expiresIn } = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    accessToken,
    refreshToken,
    expiresIn,
    token: accessToken, // Backward compatibility
  };
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    stellarAddress: string | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  token: string; // Backward compatibility
}

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const { accessToken, refreshToken, expiresIn } = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      stellarAddress: user.stellarAddress,
    },
    accessToken,
    refreshToken,
    expiresIn,
    token: accessToken, // Backward compatibility
  };
}
