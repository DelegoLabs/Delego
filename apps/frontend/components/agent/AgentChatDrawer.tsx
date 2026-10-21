"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { VoiceInputButton } from "./VoiceInputButton";
import {
  PromptSuggestionChips,
  type PromptSuggestionChip,
} from "./PromptSuggestionChips";
import { DisputeQuickPrompts, type DisputeQuickPrompt } from "./DisputeQuickPrompts";
import { FilterPills } from "./FilterPills";
import {
  CatalogFilterState,
  hasActiveFilters,
  encodeFiltersToParams,
} from "../../lib/catalogFilters";

export interface AgentChatDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the trimmed prompt when the buyer submits a message. */
  onSubmit?: (prompt: string, orderId?: string, filterParams?: Record<string, string>) => void;
  /** Optional order ID to prepend to the prompt. */
  orderId?: string;
}

/**
 * Chat drawer for the conversational buyer agent (#800). The prompt input is
 * backed by the voice mic button, so a buyer can dictate a request instead of
 * typing and see the transcript populate the field live.
 */
export function AgentChatDrawer({
  open,
  onClose,
  onSubmit,
  orderId: initialOrderId,
  categories: initialCategories,
  filters: initialFilters,
}: AgentChatDrawerProps & { categories?: string[]; filters?: CatalogFilterState; orderId?: string }) {
  const [prompt, setPrompt] = useState("");
  const [hasSent, setHasSent] = useState(false);
  const [focusSend, setFocusSend] = useState(false);
  const [filters, setFilters] = useState<CatalogFilterState>(
    initialFilters ?? { categories: [], inStockOnly: false }
  );
  const [categories, setCategories] = useState<string[]>(initialCategories ?? []);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: open });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!focusSend) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>("[data-agent-send]")
      ?.focus();
    setFocusSend(false);
  }, [focusSend]);

  function handleChipSelect(chip: PromptSuggestionChip) {
    setPrompt(chip.promptText);
    setFocusSend(true);
  }

  function handleDisputePromptSelect(chip: DisputeQuickPrompt) {
    setPrompt(chip.promptText);
    setFocusSend(true);
  }

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed, initialOrderId, encodeFiltersToParams(filters));
    setPrompt("");
    setHasSent(true);
  }

  return open ? (
    <div className="agent-chat-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ask the buying agent"
        tabIndex={-1}
        className="agent-chat-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <FilterPills
          filters={filters}
          categories={categories}
          onToggleCategory={(cat) =>
            setCategories((prev) => {
              const next = prev.includes(cat)
                ? prev.filter((c) => c !== cat)
                : [...prev, cat];
              setFilters({ ...filters, categories: next });
              return next;
            })
          }
          onToggleMaxPrice={(raw) => {
            setFilters((prev) => {
              const n = raw === "" ? undefined : Number(raw);
              return {
                ...prev,
                maxPrice:
                  n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
              };
            });
          }}
          onToggleMinPrice={(raw) => {
            setFilters((prev) => {
              const n = raw === "" ? undefined : Number(raw);
              return {
                ...prev,
                minPrice:
                  n !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined,
              };
            });
          }}
          onToggleMinRating={(raw) => {
            setFilters((prev) => {
              const n = raw === "" ? undefined : Number(raw);
              return {
                ...prev,
                minRating:
                  n !== undefined &&
                  Number.isFinite(n) &&
                  n >= 0 &&
                  n <= 5
                    ? n
                    : undefined,
              };
            });
          }}
          onClearFilters={() => {
            setFilters({ categories: [], minPrice: undefined, maxPrice: undefined, minRating: undefined });
            setCategories([]);
          }}
        />

        {open && (
          <DisputeQuickPrompts
            onSelect={handleDisputePromptSelect}
            hidden={hasSent}
          />
        )}

        <h2 style={{ margin: 0 }}>Ask the agent</h2>
        <p className="agent-chat-hint">
          Describe what you want to buy and the agent will handle it.
        </p>

        <PromptSuggestionChips onSelect={handleChipSelect} hidden={hasSent} />

        <label htmlFor="agent-prompt-input">Message</label>
        <textarea
          id="agent-prompt-input"
          data-testid="agent-prompt-input"
          className="agent-chat-input"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Find me a laptop under $1,000…"
        />

        <div className="agent-chat-actions">
          <VoiceInputButton
            onTranscript={setPrompt}
            label="Dictate a message"
          />
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            data-agent-send
            onClick={handleSubmit}
            disabled={prompt.trim().length === 0}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  ) : null;
}