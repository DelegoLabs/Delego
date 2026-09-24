"use client";

import { useEffect, useState } from "react";
import { useWallet } from "../../hooks/useWallet";
import { useAgentLiveStatus } from "../../hooks/useAgentLiveStatus";

const STATE_LABEL: Record<string, string> = {
  searching: "Searching",
  negotiating: "Negotiating",
  awaiting_approval: "Awaiting your approval",
  executing: "Executing",
};

/**
 * Header banner showing what the user's agent is doing in the background.
 * Hidden while the agent is idle; slides in/out on transitions to/from idle.
 */
export function AgentLiveStatusBanner() {
  const { isConnected } = useWallet();
  const status = useAgentLiveStatus(isConnected);
  const isActive = status != null && status.state !== "idle";
  const [mounted, setMounted] = useState(false);

  // Delay the slide-in transition by a frame so the initial render starts
  // from the "hidden" position instead of snapping straight to visible.
  useEffect(() => {
    if (isActive) {
      const raf = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setMounted(false);
  }, [isActive]);

  if (!isActive || !status) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.5rem 1rem",
        background: "#eef2ff",
        color: "#3730a3",
        fontSize: "0.8125rem",
        overflow: "hidden",
        maxHeight: mounted ? 40 : 0,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(-8px)",
        transition: "max-height 0.25s ease, opacity 0.25s ease, transform 0.25s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "9999px",
          background: "#4f46e5",
          animation: "delego-agent-pulse 1.4s ease-in-out infinite",
        }}
      />
      <span style={{ fontWeight: 600 }}>{STATE_LABEL[status.state] ?? status.state}</span>
      {status.currentTaskDescription && <span>— {status.currentTaskDescription}</span>}
      <style>{`
        @keyframes delego-agent-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
