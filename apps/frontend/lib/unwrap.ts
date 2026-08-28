import type { ApiResponse } from "@delego/types";

export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(error: { code: string; message: string; details?: Record<string, unknown> }) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.details = error.details;
  }
}

/** Unwrap an ApiResponse envelope into its data, or throw — for use as a react-query queryFn/mutationFn */
export function unwrap<T>(res: ApiResponse<T>): T {
  if (res.error) {
    throw new ApiRequestError(res.error);
  }
  if (res.data === null) {
    throw new ApiRequestError({ code: "EMPTY_RESPONSE", message: "Response contained no data" });
  }
  return res.data;
}
