import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DomainStatusBadge,
  type DomainStatusBadgeStatus,
} from "./DomainStatusBadge";

const CASES: Array<[DomainStatusBadgeStatus, string]> = [
  ["configured", "Configured"],
  ["not-configured", "Not configured"],
  ["active", "Active"],
  ["pending", "Pending"],
  ["error", "Error"],
  ["checking", "Checking…"],
];

describe("DomainStatusBadge", () => {
  it.each(CASES)("renders the %s state as %s", (status, label) => {
    render(<DomainStatusBadge status={status} data-testid="domain-status" />);

    expect(screen.getByTestId("domain-status")).toHaveTextContent(label);
  });
});
