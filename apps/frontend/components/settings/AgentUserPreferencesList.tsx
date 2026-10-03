"use client";

import { useState, useEffect } from "react";
import { Card, Button } from "@delegolabs/ui";
import type { UserPreferenceItem } from "@delegolabs/types";
import { getUserPreferences, updateUserPreference, deleteUserPreference } from "../../lib/userPreferences";

export function AgentUserPreferencesList() {
  const [preferences, setPreferences] = useState<UserPreferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      setLoading(true);
      setError(null);
      const data = await getUserPreferences();
      setPreferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(key: string) {
    try {
      setSaving(true);
      const existing = preferences.find(p => p.key === key);
      const item: UserPreferenceItem = existing
        ? { ...existing, value: editValue }
        : { key, value: editValue };
        
      await updateUserPreference(item);
      setPreferences(prev => {
        const idx = prev.findIndex(p => p.key === key);
        if (idx >= 0) {
          const newPrefs = [...prev];
          newPrefs[idx] = item;
          return newPrefs;
        }
        return [...prev, item];
      });
      setEditingKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preference");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: string) {
    try {
      setSaving(true);
      await deleteUserPreference(key);
      setPreferences(prev => prev.filter(p => p.key !== key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete preference");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: UserPreferenceItem) {
    setEditingKey(item.key);
    setEditValue(item.value);
  }

  if (loading) return <Card title="Agent Preferences Memory"><p>Loading preferences...</p></Card>;

  return (
    <Card title="Agent Preferences Memory">
      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
        Preferences your Buyer Agent has learned about you over time.
      </p>
      {error && <div style={{ color: "#b91c1c", marginBottom: "1rem" }}>{error}</div>}
      
      {preferences.length === 0 ? (
        <p>No preferences learned yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {preferences.map(item => (
            <li key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
              {editingKey === item.key ? (
                <div style={{ display: "flex", gap: "0.5rem", flex: 1, alignItems: "center" }}>
                  <span style={{ fontWeight: 500, minWidth: "120px" }}>{item.key}</span>
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{ flex: 1, padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
                  />
                  <Button variant="primary" disabled={saving} onClick={() => handleSaveEdit(item.key)}>Save</Button>
                  <Button variant="secondary" disabled={saving} onClick={() => setEditingKey(null)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.875rem" }}>{item.key}</strong>
                      <span style={{ fontSize: "0.875rem", color: "#374151" }}>{item.value}</span>
                    </div>
                    {item.learnedFromOrder && (
                      <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Learned from order: {item.learnedFromOrder}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button variant="secondary" onClick={() => startEdit(item)}>Edit</Button>
                    <Button variant="destructive" disabled={saving} onClick={() => handleDelete(item.key)}>Delete</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
