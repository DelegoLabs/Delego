"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import {
  clearReadModel,
  getReadModelStats,
  type CacheStats,
} from "../../lib/readModelCache";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTtl(ttlMs: number): string {
  const minutes = ttlMs / 60_000;
  return minutes < 1 ? `${Math.round(ttlMs / 1000)}s` : `${minutes}m`;
}

/**
 * Settings → Offline data: usage stats plus a cache-buster (#619).
 */
export function OfflineDataCard() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const refresh = useCallback(async () => {
    setStats(await getReadModelStats());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClear = async () => {
    setClearing(true);
    setCleared(false);
    try {
      await clearReadModel();
      await refresh();
      setCleared(true);
    } finally {
      setClearing(false);
    }
  };

  const used = stats?.totalBytes ?? 0;
  const max = stats?.maxBytes ?? 0;
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  return (
    <Card title="Offline data" ariaLabel="Offline data cache">
      <div className="settings-section">
        <div>
          <p className="settings-toggle-label">Read-model cache</p>
          <p className="settings-toggle-hint">
            Last-known-good lists and detail objects, stored in IndexedDB so
            flaky networks still render instantly. Family TTLs below are the
            same numbers the staleness badges show.
          </p>
        </div>

        {stats && (
          <>
            <p className="offline-cache-usage">
              {formatBytes(used)} of {formatBytes(max)} used ({percent}%)
            </p>
            <div className="utilization-bar-track" aria-hidden="true">
              <div
                className="utilization-bar-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
            <ul className="offline-cache-families">
              {stats.families.map((family) => (
                <li key={family.family}>
                  <span>{family.label}</span>
                  <span>
                    {family.keys} {family.keys === 1 ? "entry" : "entries"} ·{" "}
                    {formatBytes(family.bytes)} · TTL {formatTtl(family.ttlMs)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {cleared && (
          <div className="settings-status success" role="status">
            Offline data cleared.
          </div>
        )}

        <Button
          variant="secondary"
          onClick={handleClear}
          disabled={clearing}
        >
          {clearing ? "Clearing…" : "Clear offline data"}
        </Button>
      </div>
    </Card>
  );
}
