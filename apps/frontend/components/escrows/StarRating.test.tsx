import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarRating } from "./StarRating";

describe("StarRating", () => {
  it("renders five radios, none checked when unrated", () => {
    render(<StarRating value={null} onChange={() => {}} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  it("marks only the selected star as checked", () => {
    render(<StarRating value={3} onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: /^3 stars/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /^4 stars/ })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("reports the star the buyer picks", () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /^4 stars/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("supports arrow-key selection", () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("radio", { name: /^2 stars/ }), {
      key: "ArrowRight",
    });

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("wraps around when arrowing past the last star", () => {
    const onChange = vi.fn();
    render(<StarRating value={5} onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("radio", { name: /^5 stars/ }), {
      key: "ArrowRight",
    });

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("clears the rating on re-click only when allowClear is set", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <StarRating value={5} onChange={onChange} allowClear />
    );
    fireEvent.click(screen.getByRole("radio", { name: /^5 stars/ }));
    expect(onChange).toHaveBeenCalledWith(null);

    unmount();

    const strictChange = vi.fn();
    render(<StarRating value={5} onChange={strictChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /^5 stars/ }));
    expect(strictChange).toHaveBeenCalledWith(5);
  });

  it("ignores selection while disabled", () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} disabled />);

    fireEvent.click(screen.getByRole("radio", { name: /^2 stars/ }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
