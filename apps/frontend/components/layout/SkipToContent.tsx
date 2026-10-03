"use client";

/**
 * Keyboard-accessible "skip to main content" link.
 *
 * Mirrors the `SkipToContent` export in `components/search/GlobalSearch.tsx`
 * so both call sites render the same anchor, classes and label.
 */
export function SkipToContent() {
  return (
    <a href="#main-content" className="skip-to-content focus-visible-ring">
      Skip to main content
    </a>
  );
}

export default SkipToContent;
