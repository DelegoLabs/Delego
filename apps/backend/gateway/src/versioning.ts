export interface ApiVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface VersionNegotiationResult {
  version: ApiVersion;
  isDeprecated: boolean;
  deprecationDate?: string;
  sunsetDate?: string;
}

const SUPPORTED_VERSIONS: ApiVersion[] = [
  { major: 1, minor: 0, patch: 0 },
];

const DEPRECATED_VERSIONS: Map<string, { deprecationDate: string; sunsetDate: string }> = new Map();

const CURRENT_VERSION: ApiVersion = { major: 1, minor: 0, patch: 0 };

export function parseVersion(versionStr: string): ApiVersion | null {
  const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function formatVersion(version: ApiVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function isVersionSupported(version: ApiVersion): boolean {
  return SUPPORTED_VERSIONS.some(
    (v) => v.major === version.major && v.minor === version.minor && v.patch === version.patch
  );
}

export function isVersionDeprecated(version: ApiVersion): boolean {
  return DEPRECATED_VERSIONS.has(formatVersion(version));
}

export function getDeprecationInfo(version: ApiVersion): { deprecationDate: string; sunsetDate: string } | null {
  return DEPRECATED_VERSIONS.get(formatVersion(version)) ?? null;
}

export function negotiateVersion(requestedVersion: string | null): VersionNegotiationResult {
  if (!requestedVersion) {
    return {
      version: CURRENT_VERSION,
      isDeprecated: isVersionDeprecated(CURRENT_VERSION),
      deprecationDate: getDeprecationInfo(CURRENT_VERSION)?.deprecationDate,
      sunsetDate: getDeprecationInfo(CURRENT_VERSION)?.sunsetDate,
    };
  }

  const parsed = parseVersion(requestedVersion);
  if (!parsed) {
    return {
      version: CURRENT_VERSION,
      isDeprecated: isVersionDeprecated(CURRENT_VERSION),
      deprecationDate: getDeprecationInfo(CURRENT_VERSION)?.deprecationDate,
      sunsetDate: getDeprecationInfo(CURRENT_VERSION)?.sunsetDate,
    };
  }

  if (!isVersionSupported(parsed)) {
    return {
      version: CURRENT_VERSION,
      isDeprecated: isVersionDeprecated(CURRENT_VERSION),
      deprecationDate: getDeprecationInfo(CURRENT_VERSION)?.deprecationDate,
      sunsetDate: getDeprecationInfo(CURRENT_VERSION)?.sunsetDate,
    };
  }

  return {
    version: parsed,
    isDeprecated: isVersionDeprecated(parsed),
    deprecationDate: getDeprecationInfo(parsed)?.deprecationDate,
    sunsetDate: getDeprecationInfo(parsed)?.sunsetDate,
  };
}

export function getCurrentVersion(): ApiVersion {
  return CURRENT_VERSION;
}

export function getSupportedVersions(): ApiVersion[] {
  return SUPPORTED_VERSIONS.map((v) => ({ ...v }));
}

export function registerDeprecatedVersion(
  version: ApiVersion,
  deprecationDate: string,
  sunsetDate: string
): void {
  const versionStr = formatVersion(version);
  DEPRECATED_VERSIONS.set(versionStr, { deprecationDate, sunsetDate });
}

export function getDeprecationHeaders(version: ApiVersion): Record<string, string> {
  const headers: Record<string, string> = {};
  
  const deprecationInfo = getDeprecationInfo(version);
  if (deprecationInfo) {
    headers["Deprecation"] = deprecationInfo.deprecationDate;
    headers["Sunset"] = deprecationInfo.sunsetDate;
    headers["X-API-Deprecated"] = "true";
    headers["X-API-Sunset"] = deprecationInfo.sunsetDate;
  }
  
  headers["X-API-Version"] = formatVersion(version);
  headers["X-API-Current-Version"] = formatVersion(CURRENT_VERSION);
  
  return headers;
}