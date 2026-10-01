"use client";

import { useMemo, useRef, useState } from "react";
import { Badge, Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  AGENT_MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  MEMORY_CATEGORY_TONES,
  confidencePercent,
  filterMemories,
  type AgentMemoryCategory,
  type AgentMemoryItem,
} from "../../lib/agentMemory";

export interface AgentMemoryTableProps {
  memories: AgentMemoryItem[];
  onDelete: (id: string) => Promise<void>;
}

const cellStyle = {
  padding: "0.5rem 0.625rem",
  borderBottom: "1px solid #e5e7eb",
} as const;

/**
 * Inspector for what the agent has memorized about the user (#682), with
 * search, category filter, per-item delete and a confirmed "Clear All".
 * Deletes are optimistic: rows disappear immediately and come back with an
 * error if `onDelete` rejects.
 */
export function AgentMemoryTable({
  memories,
  onDelete,
}: AgentMemoryTableProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AgentMemoryCategory | "all">("all");
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: confirmOpen });

  const visible = useMemo(
    () => memories.filter((m) => !removedIds.has(m.id)),
    [memories, removedIds]
  );
  const rows = useMemo(
    () => filterMemories(visible, query, category),
    [visible, query, category]
  );

  function hide(ids: string[]) {
    setRemovedIds((prev) => new Set([...prev, ...ids]));
  }

  function restore(ids: string[]) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function handleDelete(id: string) {
    setError(null);
    hide([id]);
    try {
      await onDelete(id);
    } catch {
      restore([id]);
      setError("Couldn't delete that memory. It has been restored.");
    }
  }

  async function handleClearAll() {
    setConfirmOpen(false);
    setError(null);
    const ids = visible.map((m) => m.id);
    hide(ids);
    const results = await Promise.allSettled(ids.map((id) => onDelete(id)));
    const failed = ids.filter((_, i) => results[i].status === "rejected");
    if (failed.length > 0) {
      restore(failed);
      setError(
        `Couldn't delete ${failed.length} ${failed.length === 1 ? "memory" : "memories"}. ` +
          "They have been restored."
      );
    }
  }

  return (
    <section
      aria-labelledby="agent-memory-heading"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <h2
          id="agent-memory-heading"
          style={{ margin: 0, fontSize: "1.125rem" }}
        >
          What your agent remembers
        </h2>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={visible.length === 0}
        >
          Clear All Memories
        </Button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="search"
          aria-label="Search memories"
          placeholder="Search memories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 200px",
            padding: "0.5rem 0.625rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
          }}
        />
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as AgentMemoryCategory | "all")
          }
          style={{
            padding: "0.5rem 0.625rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
          }}
        >
          <option value="all">All categories</option>
          {AGENT_MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MEMORY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          {visible.length === 0
            ? "Your agent hasn't memorized anything yet."
            : "No memories match your search."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280" }}>
                <th scope="col" style={cellStyle}>
                  Category
                </th>
                <th scope="col" style={cellStyle}>
                  Key
                </th>
                <th scope="col" style={cellStyle}>
                  Value
                </th>
                <th scope="col" style={cellStyle}>
                  Confidence
                </th>
                <th scope="col" style={cellStyle}>
                  Updated
                </th>
                <th scope="col" style={cellStyle}>
                  <span
                    style={{
                      position: "absolute",
                      width: 1,
                      height: 1,
                      overflow: "hidden",
                      clip: "rect(0 0 0 0)",
                    }}
                  >
                    Actions
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={cellStyle}>
                    <Badge tone={MEMORY_CATEGORY_TONES[m.category]}>
                      {MEMORY_CATEGORY_LABELS[m.category]}
                    </Badge>
                  </td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{m.key}</td>
                  <td style={cellStyle}>{m.value}</td>
                  <td style={cellStyle}>{confidencePercent(m.confidence)}%</td>
                  <td style={{ ...cellStyle, color: "#6b7280" }}>
                    <time dateTime={m.updatedAt}>
                      {new Date(m.updatedAt).toLocaleDateString()}
                    </time>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <Button
                      variant="ghost"
                      onClick={() => void handleDelete(m.id)}
                      ariaLabel={`Delete memory ${m.key}`}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmOpen && (
        <div
          role="presentation"
          onClick={() => setConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-memories-title"
            aria-describedby="clear-memories-desc"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmOpen(false);
            }}
            style={{
              background: "#fff",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              width: "100%",
              maxWidth: 420,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h3 id="clear-memories-title" style={{ margin: 0 }}>
              Clear all memories?
            </h3>
            <p
              id="clear-memories-desc"
              style={{ margin: 0, color: "#374151", fontSize: "0.9375rem" }}
            >
              This permanently deletes all {visible.length}{" "}
              {visible.length === 1 ? "memory" : "memories"} your agent has
              saved. It will have to learn your preferences again.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleClearAll()}
              >
                Clear all
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
