"use client";

import { useEffect, useRef, useState } from "react";
import { useNetwork } from "../../hooks/useNetwork";
import type { NetworkId } from "../../lib/networks";

/**
 * Header control for switching between the Stellar test and public networks.
 *
 * Renders a button showing the active network (with a "live" indicator for
 * mainnet) and a dropdown to switch. Mainnet moves real funds, so it is
 * visually flagged. The choice is persisted via the NetworkProvider.
 */
export function NetworkToggle() {
  const { networkId, network, networks, setNetwork } = useNetwork();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleSelect(id: NetworkId) {
    setNetwork(id);
    setOpen(false);
  }

  return (
    <div className="network-toggle" ref={containerRef}>
      <button
        type="button"
        className={`network-toggle-button${network.isLive ? " live" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Active network: ${network.label}. Change network`}
        // Avoid a flash of the wrong value before localStorage is read.
        suppressHydrationWarning
      >
        <span
          className={`network-dot${network.isLive ? " live" : ""}`}
          aria-hidden="true"
        />
        <span className="network-toggle-label">{network.label}</span>
        <span className="network-toggle-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="network-menu" role="listbox" aria-label="Select network">
          {networks.map((net) => {
            const isActive = net.id === networkId;
            return (
              <li key={net.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`network-menu-item${isActive ? " active" : ""}`}
                  onClick={() => handleSelect(net.id)}
                >
                  <span
                    className={`network-dot${net.isLive ? " live" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="network-menu-item-text">
                    <span className="network-menu-item-label">{net.label}</span>
                    <span className="network-menu-item-hint">
                      {net.isLive ? "Real funds" : "Test funds only"}
                    </span>
                  </span>
                  {isActive && (
                    <span className="network-menu-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
