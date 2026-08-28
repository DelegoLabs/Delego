import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** Renders a component wrapped in a fresh, retry-disabled QueryClientProvider */
export function renderWithQueryClient(ui: ReactElement) {
  const client = createTestQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
