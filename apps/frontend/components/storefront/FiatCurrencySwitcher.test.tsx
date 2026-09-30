import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FiatCurrencySwitcher } from "./FiatCurrencySwitcher";

describe("FiatCurrencySwitcher", () => {
  it("lists every supported fiat currency", () => {
    render(<FiatCurrencySwitcher value="USD" onChange={vi.fn()} />);

    expect(screen.getByRole("option", { name: "$ USD" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "€ EUR" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "£ GBP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "₦ NGN" })).toBeInTheDocument();
  });

  it("shows the currently selected currency", () => {
    render(<FiatCurrencySwitcher value="GBP" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("GBP");
  });

  it("calls onChange with the chosen currency", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FiatCurrencySwitcher value="USD" onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "NGN");

    expect(onChange).toHaveBeenCalledWith("NGN");
  });
});
