"use client";

import { useState } from "react";
import { Button } from "@delegolabs/ui";

export interface DisputeQuickPrompt {
  id: string;
  label: string;
  promptText: string;
  category: "dispute" | "order" | "escrow";
}

export const DISPUTE_QUICK_PROMPTS: DisputeQuickPrompt[] = [
  {
    id: "check-status",
    category: "order",
    label: "Check order status",
    promptText: "What is the status of my order?",
  },
  {
    id: "delayed-delivery",
    category: "order",
    label: "Delayed delivery",
    promptText: "My order is delayed, help me track it",
  },
  {
    id: "open-dispute",
    category: "dispute",
    label: "Open a dispute",
    promptText: "I want to open a dispute for this order",
  },
  {
    id: "dispute-reason",
    category: "dispute",
    label: "Dispute reason",
    promptText: "My item was not received",
  },
  {
    id: "contact-merchant",
    category: "order",
    label: "Contact merchant",
    promptText: "I want to contact the merchant about this order",
  },
];

export interface DisputeQuickPromptsProps {
  /** Called with the chip that was clicked. */
  onSelect: (prompt: DisputeQuickPrompt) => void;
  prompts?: DisputeQuickPrompt[];
  /** Fades the list out and takes it out of the tab order. */
  hidden?: boolean;
}

/**
 * Contextual troubleshooting chips for disputed or delayed orders.
 */
export function DisputeQuickPrompts({
  onSelect,
  prompts = DISPUTE_QUICK_PROMPTS,
  hidden = false,
}: DisputeQuickPromptsProps) {
  return (
    <ul
      className={`dispute-quick-prompts${hidden ? " dispute-quick-prompts--hidden" : ""}`}
      aria-label="Dispute quick prompts"
      aria-hidden={hidden || undefined}
    >
      {prompts.map((chip) => (
        <li key={chip.id}>
          <button
            type="button"
            className="dispute-quick-prompt"
            data-category={chip.category}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => onSelect(chip)}
          >
            {chip.label}
          </button>
        </li>
      ))}
    </ul>
  );
}