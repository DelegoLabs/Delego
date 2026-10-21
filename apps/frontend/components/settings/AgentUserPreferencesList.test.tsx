import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { AgentUserPreferencesList } from "./AgentUserPreferencesList";
import * as userPreferencesApi from "../../lib/userPreferences";

vi.mock("../../lib/userPreferences", () => ({
  getUserPreferences: vi.fn(),
  updateUserPreference: vi.fn(),
  deleteUserPreference: vi.fn(),
}));

describe("AgentUserPreferencesList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders loading state initially", () => {
    vi.mocked(userPreferencesApi.getUserPreferences).mockReturnValue(new Promise(() => {}));
    render(<AgentUserPreferencesList />);
    expect(screen.getByText("Loading preferences...")).toBeInTheDocument();
  });

  it("renders empty state when no preferences exist", async () => {
    vi.mocked(userPreferencesApi.getUserPreferences).mockResolvedValue([]);
    render(<AgentUserPreferencesList />);
    
    await waitFor(() => {
      expect(screen.getByText("No preferences learned yet.")).toBeInTheDocument();
    });
  });

  it("renders preferences list", async () => {
    vi.mocked(userPreferencesApi.getUserPreferences).mockResolvedValue([
      { key: "Prefers organic", value: "Yes", category: "privacy", updatedAt: "2026-01-02T00:00:00.000Z" },
      { key: "Size", value: "M", category: "ui", updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    render(<AgentUserPreferencesList />);

    await waitFor(() => {
      expect(screen.getByText("Prefers organic")).toBeInTheDocument();
      expect(screen.getByText("Size")).toBeInTheDocument();
    });
  });

  it("allows deleting a preference", async () => {
    const user = userEvent.setup();
    vi.mocked(userPreferencesApi.getUserPreferences).mockResolvedValue([
      { key: "Prefers organic", value: "Yes", category: "privacy", updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    vi.mocked(userPreferencesApi.deleteUserPreference).mockResolvedValue();

    render(<AgentUserPreferencesList />);

    await waitFor(() => {
      expect(screen.getByText("Prefers organic")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(userPreferencesApi.deleteUserPreference).toHaveBeenCalledWith("Prefers organic");
    await waitFor(() => {
      expect(screen.getByText("No preferences learned yet.")).toBeInTheDocument();
    });
  });

  it("allows inline editing of a preference", async () => {
    const user = userEvent.setup();
    vi.mocked(userPreferencesApi.getUserPreferences).mockResolvedValue([
      { key: "Color", value: "Blue", category: "ui", updatedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    vi.mocked(userPreferencesApi.updateUserPreference).mockResolvedValue();

    render(<AgentUserPreferencesList />);

    await waitFor(() => {
      expect(screen.getByText("Color")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const input = screen.getByDisplayValue("Blue");
    await user.clear(input);
    await user.type(input, "Red");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(userPreferencesApi.updateUserPreference).toHaveBeenCalledWith({ key: "Color", value: "Red", category: "ui", updatedAt: expect.any(String) });
    await waitFor(() => {
      expect(screen.getByText("Red")).toBeInTheDocument();
    });
  });
});
