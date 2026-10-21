"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  COMMAND_CATEGORY_LABELS,
  useCommandRegistry,
  type Command,
  type CommandGroup,
} from "../../hooks/useCommandRegistry";
import { bestFuzzyScore } from "../../lib/fuzzyMatch";

const RECENT_STORAGE_KEY = "delego_recent_commands";
const RECENT_TERMS_STORAGE_KEY = "delego_recent_searches";
const MAX_RECENT = 5;
const MAX_RECENT_TERMS = 5;

function loadStringArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function saveStringArray(key: string, values: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Ignore quota / availability errors.
  }
}

export interface CommandPaletteProps {
  onClose: () => void;
}

/** A rendered row: either a runnable command or a recent-search suggestion. */
type PaletteRow =
  | { kind: "command"; command: Command }
  | { kind: "term"; term: string };

interface ResultGroup {
  label: string;
  rows: PaletteRow[];
}

const GROUP_LABEL: Record<CommandGroup, string> = {
  navigate: "Navigate",
  actions: "Quick actions",
};

/** Category wins over group when set, so features can opt into the new taxonomy. */
function groupLabelFor(command: Command): string {
  return command.category
    ? COMMAND_CATEGORY_LABELS[command.category]
    : GROUP_LABEL[command.group];
}

/**
 * ⌘K / Ctrl+K command palette: fuzzy search over registered commands (routes
 * + quick actions), with "Recent" and "Recent searches" groups backed by
 * localStorage when the query is empty. Code-split via next/dynamic in
 * CommandPaletteProvider so it never ships in the initial bundle.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const commands = useCommandRegistry();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [recentTerms, setRecentTerms] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentIds(loadStringArray(RECENT_STORAGE_KEY));
    setRecentTerms(loadStringArray(RECENT_TERMS_STORAGE_KEY));
    inputRef.current?.focus();
  }, []);

  const groups = useMemo<ResultGroup[]>(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      const recentCommands = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter((c): c is Command => Boolean(c));
      const recentIdSet = new Set(recentCommands.map((c) => c.id));

      // Group the remaining commands by their display label, preserving first
      // -seen order so "Navigate" precedes "Quick actions".
      const byLabel = new Map<string, Command[]>();
      for (const command of commands) {
        if (recentIdSet.has(command.id)) continue;
        const label = groupLabelFor(command);
        const bucket = byLabel.get(label);
        if (bucket) bucket.push(command);
        else byLabel.set(label, [command]);
      }

      const result: ResultGroup[] = [];
      if (recentCommands.length > 0) {
        result.push({
          label: "Recent",
          rows: recentCommands.map((command) => ({ kind: "command", command })),
        });
      }
      if (recentTerms.length > 0) {
        result.push({
          label: "Recent searches",
          rows: recentTerms.map((term) => ({ kind: "term", term })),
        });
      }
      for (const [label, bucket] of byLabel) {
        result.push({
          label,
          rows: bucket.map((command) => ({ kind: "command", command })),
        });
      }
      return result;
    }

    const scored = commands
      .map((command) => ({
        command,
        score: bestFuzzyScore(trimmed, [
          command.label,
          command.subtitle,
          ...(command.keywords ?? []),
        ]),
      }))
      .filter(
        (entry): entry is { command: Command; score: number } =>
          entry.score !== null
      )
      .sort((a, b) => b.score - a.score)
      .map((entry) => ({ kind: "command" as const, command: entry.command }));

    return scored.length > 0 ? [{ label: "Results", rows: scored }] : [];
  }, [query, commands, recentIds, recentTerms]);

  const flatRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function recordSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recentTerms.filter((t) => t !== trimmed)].slice(
      0,
      MAX_RECENT_TERMS
    );
    setRecentTerms(next);
    saveStringArray(RECENT_TERMS_STORAGE_KEY, next);
  }

  function runCommand(command: Command) {
    const nextRecent = [
      command.id,
      ...recentIds.filter((id) => id !== command.id),
    ].slice(0, MAX_RECENT);
    setRecentIds(nextRecent);
    saveStringArray(RECENT_STORAGE_KEY, nextRecent);
    recordSearch(query);
    onClose();
    void command.perform();
  }

  function activateRow(row: PaletteRow | undefined) {
    if (!row) return;
    if (row.kind === "term") {
      setQuery(row.term);
      inputRef.current?.focus();
      return;
    }
    runCommand(row.command);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        activateRow(flatRows[activeIndex]);
        break;
      case "Tab":
        // The search input is the only focusable element in the dialog —
        // keep focus trapped there instead of tabbing to the page behind it.
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  const activeRow = flatRows[activeIndex];

  function rowId(row: PaletteRow, index: number): string {
    return row.kind === "command"
      ? `command-item-${row.command.id}`
      : `command-term-${index}`;
  }

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            activeRow
              ? rowId(activeRow, flatRows.indexOf(activeRow))
              : undefined
          }
          className="command-palette-input"
          placeholder="Search routes and actions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div
          id="command-palette-listbox"
          role="listbox"
          aria-label="Commands"
          className="command-palette-results"
        >
          {groups.length === 0 && (
            <p className="command-palette-empty">No matching commands</p>
          )}
          {groups.map((group) => (
            <div className="command-palette-group" key={group.label}>
              <p className="command-palette-group-label">{group.label}</p>
              {group.rows.map((row) => {
                const index = flatRows.indexOf(row);
                const isActive = index === activeIndex;
                return (
                  <div
                    key={rowId(row, index)}
                    id={rowId(row, index)}
                    role="option"
                    aria-selected={isActive}
                    className={`command-palette-item${isActive ? " active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => activateRow(row)}
                  >
                    {row.kind === "command" ? (
                      <>
                        {row.command.icon && (
                          <span
                            className="command-palette-item-icon"
                            aria-hidden="true"
                          >
                            {row.command.icon}
                          </span>
                        )}
                        <span className="command-palette-item-text">
                          <span className="command-palette-item-label">
                            {row.command.label}
                          </span>
                          {row.command.subtitle && (
                            <span className="command-palette-item-subtitle">
                              {row.command.subtitle}
                            </span>
                          )}
                        </span>
                        {row.command.shortcut && (
                          <kbd className="command-palette-item-shortcut">
                            {row.command.shortcut}
                          </kbd>
                        )}
                      </>
                    ) : (
                      <span className="command-palette-item-text">
                        <span className="command-palette-item-label">
                          {row.term}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
