import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ImageLightboxModal } from "./ImageLightboxModal";

const images = [
  "https://images.example/one.jpg",
  "https://images.example/two.jpg",
];

function firePointer(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  pointerId: number,
  clientX = 0,
  clientY = 0
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  fireEvent(element, event);
}

function renderLightbox(
  overrides: Partial<ComponentProps<typeof ImageLightboxModal>> = {}
) {
  const onClose = vi.fn();
  render(
    <ImageLightboxModal
      images={images}
      initialIndex={0}
      isOpen
      onClose={onClose}
      {...overrides}
    />
  );
  return onClose;
}

describe("ImageLightboxModal", () => {
  it("is absent while closed and safely renders an empty image list", () => {
    const { rerender } = render(
      <ImageLightboxModal
        images={images}
        initialIndex={0}
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(
      <ImageLightboxModal
        images={[]}
        initialIndex={99}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", { name: "Product image viewer" })
    ).toHaveTextContent("No product images are available");
  });

  it("normalises an invalid initial index and labels the controls", () => {
    renderLightbox({ initialIndex: 99 });
    expect(screen.getByAltText("Product image 2")).toHaveAttribute(
      "src",
      images[1]
    );
    expect(
      screen.getByRole("button", { name: "Close image viewer" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous image" })
    ).toBeInTheDocument();
  });

  it("navigates with controls and arrow keys without wrapping", () => {
    renderLightbox();
    const next = screen.getByRole("button", { name: "Next image" });
    expect(
      screen.getByRole("button", { name: "Previous image" })
    ).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByAltText("Product image 2")).toHaveAttribute(
      "src",
      images[1]
    );
    expect(next).toBeDisabled();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByAltText("Product image 1")).toHaveAttribute(
      "src",
      images[0]
    );
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByAltText("Product image 2")).toBeInTheDocument();
  });

  it("closes with its button and Escape", () => {
    const onClose = renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "Close image viewer" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("toggles zoom, pans while zoomed, and ignores the click following a drag", () => {
    renderLightbox();
    const viewport = screen.getByAltText("Product image 1").parentElement!;
    const image = screen.getByAltText("Product image 1");
    fireEvent.click(viewport);
    expect(image).toHaveStyle({ transform: "translate(0px, 0px) scale(2)" });
    firePointer(viewport, "pointerdown", 1, 20, 20);
    firePointer(viewport, "pointermove", 1, 50, 40);
    expect(image.getAttribute("style")).toContain("scale(2)");
    firePointer(viewport, "pointerup", 1, 50, 40);
    fireEvent.click(viewport);
    expect(image.getAttribute("style")).toContain("scale(2)");
  });

  it("handles a two-pointer pinch and clamps its scale", () => {
    renderLightbox();
    const viewport = screen.getByAltText("Product image 1").parentElement!;
    const image = screen.getByAltText("Product image 1");
    firePointer(viewport, "pointerdown", 1, 0, 0);
    firePointer(viewport, "pointerdown", 2, 10, 0);
    firePointer(viewport, "pointermove", 2, 200, 0);
    expect(image.getAttribute("style")).toContain("scale(4)");
    firePointer(viewport, "pointercancel", 2);
    firePointer(viewport, "pointerup", 1);
    fireEvent.click(viewport);
    fireEvent.click(viewport);
    expect(image.getAttribute("style")).toContain("scale(1)");
  });

  it("restores the previous body scroll style on close", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <ImageLightboxModal
        images={images}
        initialIndex={0}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});
