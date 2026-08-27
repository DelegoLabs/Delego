"use client";

import { useEffect, useRef, useState } from "react";
import type { NetworkId } from "../../lib/networks";
import {
  findNearMisses,
  getAddressBook,
  searchAddressBook,
  type AddressEntry,
  type NearMissResult,
} from "../../services/addressBook";

export interface AddressPickerProps {
  networkId: NetworkId;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
}

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Address input with saved-contacts picker and near-miss impostor warning (#587).
 *
 * - Shows a dropdown of matching saved contacts as the user types.
 * - On paste of a raw address, checks for Levenshtein near-misses against
 *   saved contacts and shows an inline warning if any are found.
 * - Displays saved contacts as "Label (GABC…XYZ)".
 */
export function AddressPicker({
  networkId,
  value,
  onChange,
  label = "Recipient address",
  placeholder = "Paste address or search contacts…",
  id = "address-picker",
}: AddressPickerProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressEntry[]>([]);
  const [nearMisses, setNearMisses] = useState<NearMissResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync external value changes into local query.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const runSuggestions = (q: string) => {
    if (!q.trim()) {
      // Show all contacts when field is empty/focused.
      setSuggestions(getAddressBook(networkId).slice(0, 8));
    } else {
      setSuggestions(searchAddressBook(networkId, q).slice(0, 8));
    }
    setActiveIndex(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setNearMisses([]); // clear near-miss on manual typing
    runSuggestions(v);
    setShowDropdown(true);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (!pasted) return;
    // Run near-miss check on the pasted value after state settles.
    setTimeout(() => {
      const misses = findNearMisses(pasted, networkId);
      setNearMisses(misses);
    }, 0);
  };

  const handleSelectSuggestion = (entry: AddressEntry) => {
    setQuery(entry.address);
    onChange(entry.address);
    setNearMisses([]);
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const dropdownId = `${id}-dropdown`;

  return (
    <div className="address-picker-wrap">
      <label htmlFor={id} className="address-picker-label">
        {label}
      </label>

      <div className="address-picker-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="address-picker-input"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={
            showDropdown && suggestions.length > 0 ? dropdownId : undefined
          }
          aria-activedescendant={
            activeIndex >= 0 ? `${dropdownId}-item-${activeIndex}` : undefined
          }
          aria-expanded={showDropdown && suggestions.length > 0}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onFocus={() => {
            runSuggestions(query);
            setShowDropdown(true);
          }}
          onBlur={() => {
            // Delay so click on suggestion registers before blur hides it.
            setTimeout(() => setShowDropdown(false), 150);
          }}
          onKeyDown={handleKeyDown}
        />

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <ul
            ref={listRef}
            id={dropdownId}
            role="listbox"
            aria-label="Saved contacts"
            className="address-picker-dropdown"
          >
            {suggestions.map((entry, idx) => (
              <li
                key={entry.id}
                id={`${dropdownId}-item-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                className={`address-picker-option${idx === activeIndex ? " active" : ""}`}
                onMouseDown={() => handleSelectSuggestion(entry)}
              >
                <span className="address-picker-option-label">
                  {entry.verified && (
                    <span
                      className="address-picker-verified"
                      aria-label="Verified contact"
                      title="Verified"
                    >
                      ✓
                    </span>
                  )}
                  {entry.label}
                </span>
                <span className="address-picker-option-addr">
                  {shortAddress(entry.address)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Near-miss warning */}
      {nearMisses.length > 0 && (
        <div
          className="address-picker-near-miss"
          role="alert"
          aria-live="assertive"
        >
          <strong>⚠ Possible impostor address detected</strong>
          <p>
            The pasted address is similar to {nearMisses.length} saved contact
            {nearMisses.length > 1 ? "s" : ""}. Double-check before sending:
          </p>
          <ul className="address-picker-near-miss-list">
            {nearMisses.map(({ entry, distance }) => (
              <li key={entry.id}>
                <span className="address-picker-option-label">
                  {entry.label}
                </span>
                <span className="address-picker-option-addr">
                  {shortAddress(entry.address)}
                </span>
                <span className="address-picker-distance">
                  ({distance} char{distance > 1 ? "s" : ""} different)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
