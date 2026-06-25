export interface PaginationQuery {
  limit: number;
  cursor?: string;
  sort: "asc" | "desc";
}

export interface PaginationErrorDetail {
  field: string;
  message: string;
}

export type PaginationParseResult =
  | { ok: true; value: PaginationQuery }
  | { ok: false; error: PaginationErrorDetail };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** Parse and validate the `limit`, `cursor`, and `sort` query params shared by list endpoints. */
export function parsePaginationQuery(searchParams: URLSearchParams): PaginationParseResult {
  const rawLimit = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { ok: false, error: { field: "limit", message: "limit must be a positive integer" } };
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  const rawSort = searchParams.get("sort");
  const sort = rawSort ?? "desc";
  if (sort !== "asc" && sort !== "desc") {
    return { ok: false, error: { field: "sort", message: "sort must be 'asc' or 'desc'" } };
  }

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ?? undefined;
  if (cursor !== undefined && !CURSOR_PATTERN.test(cursor)) {
    return { ok: false, error: { field: "cursor", message: "cursor is malformed" } };
  }

  return { ok: true, value: { limit, cursor, sort } };
}
