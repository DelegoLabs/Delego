"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface FocusTrapOptions {
  /**
   * Ref to the element that bounds the trap — the dialog/panel itself, not the
   * backdrop. Focus is confined to this subtree for as long as `isActive` is
   * true. Attach it to the element carrying `role="dialog"`.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Whether the trap is armed. The hook is inert when `false`, so it's safe to
   * call unconditionally from a component that mounts its panel conditionally
   * or toggles visibility with a class.
   */
  isActive: boolean;
  /**
   * Called when `Escape` is pressed while the trap is armed. Omit it when the
   * consumer already owns `Escape` handling — the hook only listens for the key
   * when a handler is supplied. Unmounting (or setting `isActive` to `false`)
   * is what restores focus to the element that was focused before the overlay
   * opened, so `onEscape` only needs to close the overlay.
   */
  onEscape?: () => void;
}

function tabIndexOf(el: HTMLElement): number {
  const raw = el.getAttribute("tabindex");
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Elements hidden from the accessibility tree, or hidden from layout, are not
 * reachable by `Tab` in a real browser — so they must not be in the trap's
 * cycle either, or the trap would move focus somewhere the user cannot see.
 */
function isReachable(el: HTMLElement): boolean {
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  // Native form controls inside a disabled <fieldset> are unfocusable too.
  if (el.closest("fieldset[disabled]")) return false;
  // `display: none` drops the element from the layout tree. jsdom performs no
  // layout, so offsetParent is always null and client rects are always empty
  // there — skip this check under test so the trap stays exercisable against a
  // DOM without a layout engine.
  if (process.env.NODE_ENV !== "test") {
    if (el.offsetParent === null && el.getClientRects().length === 0) {
      return false;
    }
  }
  // `visibility: hidden` keeps the element's box — so it survives the layout
  // check above — while removing it from the accessibility tree and from
  // sequential focus navigation. Last, because getComputedStyle is the
  // expensive check and the cheap ones have already narrowed the set.
  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    return false;
  }
  return true;
}

/**
 * Tabbable descendants of `container`, ordered the way the browser's sequential
 * focus navigation would order them: positive `tabindex` values first in
 * ascending order, then everything else in DOM order.
 */
function getTabbable(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(isReachable);
  const positive = candidates
    .filter((el) => tabIndexOf(el) > 0)
    .sort((a, b) => tabIndexOf(a) - tabIndexOf(b));
  const natural = candidates.filter((el) => tabIndexOf(el) <= 0);
  return [...positive, ...natural];
}

/**
 * Traps Tab/Shift+Tab focus inside `containerRef` while `isActive` is true,
 * moves initial focus into the container, and restores focus to the previously
 * focused element on close.
 *
 * Containment is layered, because any single mechanism leaks:
 *
 *  1. Every `Tab` keypress is intercepted and the destination is decided from
 *     the drawer's own ordering, rather than only wrapping at the ends of the
 *     cycle. The browser's sequential focus order is document-wide, so a
 *     positive `tabindex` on background content sorts ahead of the drawer's own
 *     controls and would otherwise pull focus onto the page behind the backdrop.
 *  2. Elements removed from the accessibility tree or from layout are excluded
 *     from the cycle entirely, so focus never lands where the user cannot see
 *     it.
 *  3. A `focusin` guard reclaims focus that a `Tab` press didn't cause —
 *     a screen reader's virtual cursor, or a native control consuming the key.
 *
 * The guard is armed only while a `Tab` keypress is in flight, so focus that an
 * app moves on purpose — a nav link that both focuses its destination and
 * closes the drawer — is left alone.
 *
 * Used by every modal/drawer-style overlay in the app — see
 * docs/frontend-a11y.md.
 */
export function useFocusTrap({
  containerRef,
  isActive,
  onEscape,
}: FocusTrapOptions) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Held in a ref so the effect below doesn't need `onEscape` as a dependency:
  // consumers routinely pass an inline arrow, and re-running the effect on every
  // render would re-throw focus to the first element and overwrite the
  // remembered trigger.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!isActive) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    // Annotated explicitly: TypeScript drops the narrowing above inside the
    // hoisted listener functions below, which it can't prove run after it.
    const container: HTMLElement = containerEl;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusables = getTabbable(container);
    (focusables[0] ?? container).focus();

    /** Last element that held focus while inside the trap. */
    let lastFocusedInside: HTMLElement | null = null;
    /** True between a Tab keypress and the focus move it causes. */
    let tabbing = false;
    /** Direction of the in-flight Tab, used to pick a re-entry point. */
    let direction: 1 | -1 = 1;

    /**
     * The element `direction` steps to from `current`, wrapping at both ends.
     * `current` is usually a member of `elements`, but it can be the container
     * itself (its focused child unmounted), `body`, or something outside the
     * trap — in which case the cycle is entered from the near edge.
     */
    function step(
      elements: HTMLElement[],
      current: HTMLElement | null,
      step_: 1 | -1
    ): HTMLElement {
      const index = current ? elements.indexOf(current) : -1;
      if (index === -1) {
        return step_ === -1 ? elements[elements.length - 1] : elements[0];
      }
      return elements[(index + step_ + elements.length) % elements.length];
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      direction = e.shiftKey ? -1 : 1;
      tabbing = true;

      // Every Tab is handled here rather than only at the cycle's edges. Once
      // the browser owns the default action it also owns the ordering, and
      // that ordering is document-wide: a positive `tabindex` on a background
      // element — a skip link, say — sits ahead of the drawer's own controls in
      // the browser's sequence while being invisible to `getTabbable`, which
      // is precisely how focus ends up on page content behind the backdrop.
      // Deciding the destination here keeps the sequence the drawer's own.
      e.preventDefault();

      const elements = getTabbable(container);
      if (elements.length === 0) {
        container.focus();
        return;
      }
      step(elements, document.activeElement as HTMLElement | null, direction)
        .focus();
    }

    function handleKeyUp(e: KeyboardEvent) {
      // Safety net: a Tab that moves focus at all fires focusin first, which
      // clears the flag. Clearing it here too means a Tab the browser ignored
      // can't leave the guard armed and hijack a later programmatic focus.
      if (e.key === "Tab") tabbing = false;
    }

    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (target && container.contains(target)) {
        lastFocusedInside = target;
        tabbing = false;
        return;
      }
      // A deliberate, app-initiated focus move. Respect it — see the note on
      // MobileNav's nav links, which focus their destination and close the
      // drawer in the same click.
      if (!tabbing) return;
      tabbing = false;
      const elements = getTabbable(container);
      if (elements.length === 0) {
        container.focus();
        return;
      }
      // Carry on through the cycle rather than snapping back, so a focus move
      // the Tab handler didn't cause doesn't strand focus on one element.
      const from =
        lastFocusedInside && container.contains(lastFocusedInside)
          ? lastFocusedInside
          : null;
      step(elements, from, direction).focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("focusin", handleFocusIn);
      // Only reclaim focus if it's still inside the trap (Escape, outside
      // click, close button). If focus already moved elsewhere — e.g. the
      // browser navigated because the user activated a link inside the
      // panel — respect that instead of yanking focus back.
      const activeEl = document.activeElement;
      const focusMovedElsewhere =
        activeEl &&
        activeEl !== document.body &&
        activeEl !== container &&
        !container.contains(activeEl);

      if (!focusMovedElsewhere) {
        previouslyFocusedRef.current?.focus();
      }
    };
  }, [isActive, containerRef]);
}
