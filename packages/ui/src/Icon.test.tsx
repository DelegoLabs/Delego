import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("renders an svg with a 24x24 box by default", () => {
    const { container } = render(<Icon data-testid="icon" />);
    const svg = container.querySelector("svg")!;

    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("honours an explicit numeric size", () => {
    const { container } = render(<Icon size={16} />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  it("accepts a string size", () => {
    const { container } = render(<Icon size="2rem" />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("2rem");
  });

  it("is hidden from assistive tech when no label is supplied", () => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("is exposed as an image when a label is supplied", () => {
    const { getByLabelText } = render(<Icon ariaLabel="Close" />);

    expect(getByLabelText("Close")).toBeInTheDocument();
  });

  it("reserves layout space by default and can opt out", () => {
    const reserved = render(<Icon />).container.querySelector("svg")!;
    const notReserved = render(<Icon reserveLayoutSpace={false} />).container.querySelector(
      "svg",
    )!;

    expect(reserved.style.display).toBe("inline-block");
    expect(notReserved.style.display).toBe("");
    // The aspect ratio is always applied so the box does not reflow on load.
    expect(notReserved.style.aspectRatio).toBe("1/1");
  });

  it("lets caller styles win over the defaults", () => {
    const { container } = render(<Icon style={{ display: "flex" }} />);
    expect(container.querySelector("svg")!.style.display).toBe("flex");
  });

  it("forwards extra svg props to the element", () => {
    const { container } = render(<Icon className="icon--close" focusable="false" />);
    const svg = container.querySelector("svg")!;

    expect(svg.getAttribute("class")).toBe("icon--close");
    expect(svg.getAttribute("focusable")).toBe("false");
  });

  it("renders its children as the icon artwork", () => {
    const { container } = render(
      <Icon>
        <path d="M0 0 L24 24" data-testid="artwork" />
      </Icon>,
    );

    expect(container.querySelector('[data-testid="artwork"]')).toBeInTheDocument();
  });
});
