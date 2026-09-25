import { useRef } from "react";

export interface PromptChip {
  id: string;
  label: string;
  promptText: string;
  category: "reorder" | "query" | "approval";
}

export interface PromptChipsBarProps {
  chips: PromptChip[];
  /** Called with the chip's `promptText` — the caller is expected to populate and send the chat prompt. */
  onSelect: (promptText: string) => void;
}

/**
 * Horizontally scrollable bar of contextual quick-prompt suggestions shown
 * above a chat input. Selecting a chip (click or Enter/Space) hands its
 * `promptText` to `onSelect`, which the host is expected to both populate
 * into the chat input and send immediately.
 */
export function PromptChipsBar({ chips, onSelect }: PromptChipsBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (chips.length === 0) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + delta + chips.length) % chips.length;
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>("[data-chip-button]");
      buttons?.[nextIndex]?.focus();
    }
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Suggested prompts"
      style={{
        display: "flex",
        gap: "0.5rem",
        overflowX: "auto",
        padding: "0.5rem 0.25rem",
        scrollbarWidth: "thin",
      }}
    >
      {chips.map((chip, index) => (
        <button
          key={chip.id}
          type="button"
          role="option"
          data-chip-button
          aria-selected={false}
          onClick={() => onSelect(chip.promptText)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          style={{
            flexShrink: 0,
            padding: "0.375rem 0.875rem",
            borderRadius: "9999px",
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: "0.8125rem",
            fontWeight: 500,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
