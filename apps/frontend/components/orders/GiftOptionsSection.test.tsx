import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GiftOptionsSection, GIFT_MESSAGE_MAX_LENGTH } from "./GiftOptionsSection";
import type { GiftOptions } from "@delegolabs/types";

describe("GiftOptionsSection", () => {
  it("renders 'This is a gift' checkbox unchecked by default", () => {
    render(<GiftOptionsSection />);

    const checkbox = screen.getByTestId("gift-options-checkbox");
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("This is a gift")).toBeInTheDocument();

    // Gift message textarea and recipient input should NOT be visible
    expect(screen.queryByTestId("gift-message-textarea")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gift-recipient-name-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gift-message-counter")).not.toBeInTheDocument();
  });

  it("reveals gift message textarea, 250-character counter, and recipient name when checked", () => {
    const onChange = vi.fn();
    render(<GiftOptionsSection onChange={onChange} />);

    const checkbox = screen.getByTestId("gift-options-checkbox");
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isGift: true,
        hidePackingSlipPrice: true,
      })
    );

    // Form fields should now be revealed
    expect(screen.getByTestId("gift-message-textarea")).toBeInTheDocument();
    expect(screen.getByTestId("gift-recipient-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("gift-hide-price-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("gift-message-counter")).toHaveTextContent("0/250 characters (250 remaining)");
  });

  it("updates character counter as user types and enforces 250 max length", () => {
    const onChange = vi.fn();
    render(<GiftOptionsSection onChange={onChange} />);

    // Reveal options
    fireEvent.click(screen.getByTestId("gift-options-checkbox"));

    const textarea = screen.getByTestId("gift-message-textarea");
    const testMessage = "Happy Birthday! Hope you enjoy this gift.";
    fireEvent.change(textarea, { target: { value: testMessage } });

    expect(textarea).toHaveValue(testMessage);
    expect(screen.getByTestId("gift-message-counter")).toHaveTextContent(
      `${testMessage.length}/250 characters (${250 - testMessage.length} remaining)`
    );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isGift: true,
        giftMessage: testMessage,
      })
    );
  });

  it("truncates or prevents input exceeding 250 characters", () => {
    render(<GiftOptionsSection />);
    fireEvent.click(screen.getByTestId("gift-options-checkbox"));

    const textarea = screen.getByTestId("gift-message-textarea");
    const over250 = "A".repeat(300);
    fireEvent.change(textarea, { target: { value: over250 } });

    expect(textarea).toHaveValue("A".repeat(GIFT_MESSAGE_MAX_LENGTH));
    expect(screen.getByTestId("gift-message-counter")).toHaveTextContent("250/250 characters (0 remaining)");
  });

  it("propagates recipient name and hide packing slip price state changes", () => {
    const onChange = vi.fn();
    render(<GiftOptionsSection onChange={onChange} />);

    fireEvent.click(screen.getByTestId("gift-options-checkbox"));

    const recipientInput = screen.getByTestId("gift-recipient-name-input");
    fireEvent.change(recipientInput, { target: { value: "Bob Smith" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientName: "Bob Smith",
      })
    );

    const hidePriceCheckbox = screen.getByTestId("gift-hide-price-checkbox");
    expect(hidePriceCheckbox).toBeChecked();

    fireEvent.click(hidePriceCheckbox);
    expect(hidePriceCheckbox).not.toBeChecked();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hidePackingSlipPrice: false,
      })
    );
  });

  it("supports controlled value prop", () => {
    const controlledOptions: GiftOptions = {
      isGift: true,
      recipientName: "Charlie",
      giftMessage: "Enjoy your special day!",
      hidePackingSlipPrice: true,
    };

    render(<GiftOptionsSection value={controlledOptions} />);

    expect(screen.getByTestId("gift-options-checkbox")).toBeChecked();
    expect(screen.getByTestId("gift-recipient-name-input")).toHaveValue("Charlie");
    expect(screen.getByTestId("gift-message-textarea")).toHaveValue("Enjoy your special day!");
    expect(screen.getByTestId("gift-hide-price-checkbox")).toBeChecked();
  });

  it("disables all inputs when disabled prop is true", () => {
    const controlledOptions: GiftOptions = {
      isGift: true,
      recipientName: "Charlie",
      giftMessage: "Enjoy!",
      hidePackingSlipPrice: true,
    };

    render(<GiftOptionsSection value={controlledOptions} disabled={true} />);

    expect(screen.getByTestId("gift-options-checkbox")).toBeDisabled();
    expect(screen.getByTestId("gift-recipient-name-input")).toBeDisabled();
    expect(screen.getByTestId("gift-message-textarea")).toBeDisabled();
    expect(screen.getByTestId("gift-hide-price-checkbox")).toBeDisabled();
  });
});
