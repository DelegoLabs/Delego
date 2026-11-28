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
  onUpdate?: (id: string, value: string) => Promise<void>;
}

const cellStyle = {
  padding: "0.5rem 0.625rem",
  borderBottom: "1px solid #e5e7eb",
} as const;

/**
 * Inspector for what the agent has memorized about the user (#682), with
 * search, category filter chips, inline value editing, per-item delete and a
 * confirmed "Clear All". Mutations are optimistic and roll back with an error
 * if the corresponding handler rejects.
 */
export function AgentMemoryTable({
  memories,
  onDelete,
  onUpdate,
}: AgentMemoryTableProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AgentMemoryCategory | "all">("all");
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: dialogRef, isActive: confirmOpen });

  const visible = useMemo(
    () =>
      memories
        .filter((m) => !removedIds.has(m.id))
        .map((m) =>
          m.id in editedValues ? { ...m, value: editedValues[m.id] } : m
        ),
    [memories, removedIds, editedValues]
  );
  const rows = useMemo(
    () => filterMemories(visible, query, category),
    [visible, query, category]
  );

  function startEdit(item: AgentMemoryItem) {
    setError(null);
    setEditingId(item.id);
    setDraftValue(item.value);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftValue("");
  }

  async function handleSave(item: AgentMemoryItem) {
    const trimmed = draftValue.trim();
    if (!trimmed) return;
    if (trimmed === item.value) {
      cancelEdit();
      return;
    }

    const hadOverride = item.id in editedValues;
    const previousOverride = editedValues[item.id];
    setError(null);
    setEditedValues((prev) => ({ ...prev, [item.id]: trimmed }));
    setEditingId(null);
    setDraftValue("");

    if (!onUpdate) return;
    setSavingId(item.id);
    try {
      await onUpdate(item.id, trimmed);
    } catch {
      setEditedValues((prev) => {
        const next = { ...prev };
        if (hadOverride) {
          next[item.id] = previousOverride;
        } else {
          delete next[item.id];
        }
        return next;
      });
      setError("Couldn't update that memory. Your change was reverted.");
    } finally {
      setSavingId(null);
    }
  }

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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <input
          type="search"
          aria-label="Search memories"
          placeholder="Search memories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "0.5rem 0.625rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
          }}
        />
        <div
          role="group"
          aria-label="Filter by category"
          style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}
        >
          {(["all", ...AGENT_MEMORY_CATEGORIES] as const).map((c) => {
            const active = category === c;
            const label = c === "all" ? "All" : MEMORY_CATEGORY_LABELS[c];
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                style={{
                  padding: "0.25rem 0.75rem",
                  borderRadius: "9999px",
                  border: `1px solid ${active ? "#111827" : "#d1d5db"}`,
                  background: active ? "#111827" : "#fff",
                  color: active ? "#fff" : "#374151",
                  fontSize: "0.8125rem",
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
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
              {rows.map((m) => {
                const isEditing = editingId === m.id;
                const isSaving = savingId === m.id;
                return (
                  <tr key={m.id}>
                    <td style={cellStyle}>
                      <Badge tone={MEMORY_CATEGORY_TONES[m.category]}>
                        {MEMORY_CATEGORY_LABELS[m.category]}
                      </Badge>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{m.key}</td>
                    <td style={cellStyle}>
                      {isEditing ? (
                        <input
                          type="text"
                          aria-label={`Edit value for ${m.key}`}
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleSave(m);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "0.375rem",
                            border: "1px solid #d1d5db",
                            fontSize: "0.875rem",
                          }}
                        />
                      ) : (
                        m.value
                      )}
                    </td>
                    <td style={cellStyle}>{confidencePercent(m.confidence)}%</td>
                    <td style={{ ...cellStyle, color: "#6b7280" }}>
                      <time dateTime={m.updatedAt}>
                        {new Date(m.updatedAt).toLocaleDateString()}
                      </time>
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: "0.25rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        {isEditing ? (
                          <>
                            <Button
                              variant="primary"
                              onClick={() => void handleSave(m)}
                              disabled={isSaving || draftValue.trim().length === 0}
                              ariaLabel={`Save memory ${m.key}`}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              ariaLabel={`Cancel editing ${m.key}`}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => startEdit(m)}
                              ariaLabel={`Edit memory ${m.key}`}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => void handleDelete(m.id)}
                              ariaLabel={`Delete memory ${m.key}`}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
