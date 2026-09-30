import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { useFocusTrap } from "./useFocusTrap";

function TestDialog({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef, isActive: open });

  return (
    <div>
      <button type="button">Outside trigger</button>
      {open && (
        <div ref={containerRef} role="dialog" tabIndex={-1}>
          <button type="button">First</button>
          <button type="button">Second</button>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves initial focus to the first focusable element", () => {
    render(<TestDialog />);
    expect(screen.getByText("First")).toHaveFocus();
  });

  it("wraps Tab from the last element back to the first", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    screen.getByText("Close").focus();
    await user.tab();

    expect(screen.getByText("First")).toHaveFocus();
  });

  it("wraps Shift+Tab from the first element to the last", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    expect(screen.getByText("First")).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByText("Close")).toHaveFocus();
  });

  it("does nothing when inactive", () => {
    render(<TestDialog initialOpen={false} />);
    const trigger = screen.getByText("Outside trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();
  });

  it("falls back to focusing the container when it has no focusable children", () => {
    function EmptyDialog() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });
      return (
        <div ref={containerRef} role="dialog" tabIndex={-1}>
          <p>No interactive content</p>
        </div>
      );
    }

    render(<EmptyDialog />);
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("restores focus to the trigger after the trap deactivates", async () => {
    function ToggleDialog() {
      const [open, setOpen] = useState(false);
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: open });

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <div ref={containerRef} role="dialog" tabIndex={-1}>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(<ToggleDialog />);

    const openButton = screen.getByText("Open");
    await user.click(openButton);
    expect(screen.getByText("Close")).toHaveFocus();

    await user.click(screen.getByText("Close"));
    expect(openButton).toHaveFocus();
  });

  it("does not steal focus back when it already moved elsewhere before the trap deactivated", async () => {
    function NavigatingDialog() {
      const [open, setOpen] = useState(false);
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: open });

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <a href="#elsewhere">Elsewhere on the page</a>
          {open && (
            <div ref={containerRef} role="dialog" tabIndex={-1}>
              <button
                type="button"
                onClick={() => {
                  // Simulate a link inside the dialog moving focus to a
                  // destination element as part of navigating away, then
                  // the dialog closing as a side effect (e.g. MobileNav's
                  // nav links: onClick={onClose} alongside navigation).
                  document.querySelector<HTMLAnchorElement>("a")?.focus();
                  setOpen(false);
                }}
              >
                Navigate away
              </button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(<NavigatingDialog />);

    const openButton = screen.getByText("Open");
    await user.click(openButton);
    await user.click(screen.getByText("Navigate away"));

    expect(screen.getByText("Elsewhere on the page")).toHaveFocus();
    expect(openButton).not.toHaveFocus();
  });

  it("keeps the cycle inside the drawer when a background tabindex outranks it", async () => {
    // The browser's own sequence is document-wide, so a positive tabindex on
    // background content — a skip link, say — sorts ahead of the drawer's
    // controls even though it lives outside the panel. Letting the browser
    // advance from there drops focus on page content behind the backdrop,
    // which is the reported failure. The trap decides the destination itself.
    function CompetingTabindexDialog() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });

      return (
        <div>
          <a href="#elsewhere" tabIndex={2}>
            Elsewhere on the page
          </a>
          <div ref={containerRef} role="dialog" tabIndex={-1}>
            <button type="button">Draft</button>
            <button type="button" tabIndex={1}>
              Send
            </button>
          </div>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<CompetingTabindexDialog />);

    // Positive tabindexes come first, so initial focus is on "Send".
    expect(screen.getByText("Send")).toHaveFocus();

    await user.tab();
    expect(screen.getByText("Draft")).toHaveFocus();

    // Wraps within the drawer instead of reaching the background link.
    await user.tab();
    expect(screen.getByText("Send")).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByText("Draft")).toHaveFocus();
  });

  it("reclaims focus that lands outside the trap mid-Tab", () => {
    // Defence in depth for focus moves the keydown handler doesn't cause —
    // a screen reader's virtual cursor, or a native control consuming the key.
    function HalfOpenTrap() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });

      return (
        <div>
          <div ref={containerRef} role="dialog" tabIndex={-1}>
            <button type="button">Message input</button>
          </div>
          <a href="#elsewhere">Elsewhere on the page</a>
        </div>
      );
    }

    render(<HalfOpenTrap />);
    const inside = screen.getByText("Message input");
    const outside = screen.getByText("Elsewhere on the page");
    expect(inside).toHaveFocus();

    // Tab in flight, then something steals focus outside the panel.
    fireEvent.keyDown(document, { key: "Tab" });
    outside.focus();

    expect(outside).not.toHaveFocus();
    expect(inside).toHaveFocus();
  });

  it("re-enters the cycle when focus sits on the container rather than a child", async () => {
    // A chat transcript that empties can unmount the element that had focus,
    // dropping focus back onto the panel itself. Tab from there used to walk
    // straight out of the drawer into the page behind it, because the container
    // *contains* itself — so a containment-only check said "focus is fine".
    function ContainerFocusDialog() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });

      return (
        <div>
          <div ref={containerRef} role="dialog" tabIndex={-1}>
            <button type="button">First</button>
            <button type="button">Last</button>
          </div>
          <a href="#elsewhere">Elsewhere on the page</a>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<ContainerFocusDialog />);

    const panel = screen.getByRole("dialog");
    panel.focus();
    expect(panel).toHaveFocus();

    await user.tab();
    expect(screen.getByText("First")).toHaveFocus();

    // …and the same from the other direction.
    panel.focus();
    await user.tab({ shift: true });
    expect(screen.getByText("Last")).toHaveFocus();
  });

  it("skips elements hidden from the accessibility tree", async () => {
    // `visibility: hidden` keeps an element's box, so a purely layout-based
    // check treats it as focusable. The browser wouldn't tab to it, and
    // focusing it would move the caret somewhere the user cannot see.
    function PartlyHiddenDialog() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });

      return (
        <div ref={containerRef} role="dialog" tabIndex={-1}>
          <button type="button">Visible</button>
          <button type="button" style={{ visibility: "hidden" }}>
            Invisible
          </button>
          <button type="button" aria-hidden="true">
            Hidden from AT
          </button>
          <button type="button" disabled>
            Disabled
          </button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<PartlyHiddenDialog />);

    // Initial focus lands on the only reachable control, not on the
    // visibility:hidden one that precedes it in DOM order.
    expect(screen.getByText("Visible")).toHaveFocus();

    await user.tab();
    expect(screen.getByText("Visible")).toHaveFocus();
  });

  it("cycles in tabindex order ahead of DOM order", async () => {
    function RovingDialog() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, isActive: true });

      return (
        <div ref={containerRef} role="dialog" tabIndex={-1}>
          <button type="button" tabIndex={2}>
            Second in order
          </button>
          <button type="button" tabIndex={1}>
            First in order
          </button>
          <button type="button">Last in order</button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<RovingDialog />);

    expect(screen.getByText("First in order")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("Second in order")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("Last in order")).toHaveFocus();
    await user.tab();
    expect(screen.getByText("First in order")).toHaveFocus();
  });

  it("calls onEscape and restores focus to the trigger", async () => {
    function EscapableDialog() {
      const [open, setOpen] = useState(false);
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({
        containerRef,
        isActive: open,
        onEscape: () => setOpen(false),
      });

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open drawer
          </button>
          {open && (
            <div ref={containerRef} role="dialog" tabIndex={-1}>
              <button type="button">Message input</button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(<EscapableDialog />);

    const trigger = screen.getByText("Open drawer");
    await user.click(trigger);
    expect(screen.getByText("Message input")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ignores Escape when no onEscape handler is supplied", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays armed across re-renders that pass a new onEscape identity", async () => {
    // Inline arrows are the common call style. If the trap re-armed on every
    // render it would re-throw focus to the first element and forget the
    // trigger it was supposed to return to.
    function ReRenderingDialog() {
      const [open, setOpen] = useState(false);
      const [tick, setTick] = useState(0);
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({
        containerRef,
        isActive: open,
        onEscape: () => setOpen(false),
      });

      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open drawer
          </button>
          {open && (
            <div ref={containerRef} role="dialog" tabIndex={-1}>
              <button type="button">First</button>
              <button type="button" onClick={() => setTick(tick + 1)}>
                Re-render ({tick})
              </button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(<ReRenderingDialog />);

    const trigger = screen.getByText("Open drawer");
    await user.click(trigger);
    expect(screen.getByText("First")).toHaveFocus();

    // A re-render must not yank focus back to the first element.
    await user.click(screen.getByText("Re-render (0)"));
    expect(screen.getByText("Re-render (1)")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
