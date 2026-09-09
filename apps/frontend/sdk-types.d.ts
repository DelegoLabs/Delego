import "@delegolabs/sdk";

declare module "@delegolabs/sdk" {
  interface DelegoClient {
    rejectOrder(
      id: string,
      reason?: string,
      reasonCode?: string
    ): Promise<import("@delegolabs/types").ApiResponse<import("@delegolabs/types").Order>>;
  }
}
