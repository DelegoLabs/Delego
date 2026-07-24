import { Request, Response, NextFunction } from "express";
import {
  negotiateVersion,
  getDeprecationHeaders,
  type VersionNegotiationResult,
} from "../versioning.js";

declare global {
  namespace Express {
    interface Request {
      apiVersion?: VersionNegotiationResult;
    }
  }
}

export function versioningMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check for version in different locations
    let requestedVersion: string | null = null;

    // 1. Check Accept header for version (e.g., "application/vnd.delego.v1+json")
    const acceptHeader = req.headers.accept;
    if (acceptHeader) {
      const versionMatch = acceptHeader.match(/application\/vnd\.delego\.v(\d+(\.\d+(\.\d+)?)?)\+json/);
      if (versionMatch) {
        requestedVersion = versionMatch[1];
      }
    }

    // 2. Check X-API-Version header
    if (!requestedVersion && req.headers["x-api-version"]) {
      requestedVersion = req.headers["x-api-version"] as string;
    }

    // 3. Check query parameter
    if (!requestedVersion && req.query.version) {
      requestedVersion = req.query.version as string;
    }

    // 4. Check URL path version (e.g., /api/v1/...)
    if (!requestedVersion) {
      const pathMatch = req.path.match(/^\/api\/v(\d+(\.\d+(\.\d+)?)?)\//);
      if (pathMatch) {
        requestedVersion = pathMatch[1];
      }
    }

    // Negotiate version
    const negotiationResult = negotiateVersion(requestedVersion);
    req.apiVersion = negotiationResult;

    // Set version headers
    const headers = getDeprecationHeaders(negotiationResult.version);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    // Add deprecation warning if version is deprecated
    if (negotiationResult.isDeprecated) {
      res.setHeader("Warning", `299 - "API version ${requestedVersion} is deprecated"`);
    }

    next();
  };
}

export function versionDiscoveryEndpoint() {
  return (req: Request, res: Response) => {
    const currentVersion = req.apiVersion?.version;
    res.json({
      data: {
        currentVersion: currentVersion ? `${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch}` : "1.0.0",
        supportedVersions: ["1.0.0"],
        deprecationInfo: req.apiVersion?.isDeprecated ? {
          deprecationDate: req.apiVersion.deprecationDate,
          sunsetDate: req.apiVersion.sunsetDate,
        } : null,
      },
      error: null,
      meta: {
        requestId: req.headers["x-request-id"] || "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  };
}