"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import type { NetworkId } from "../../lib/networks";
import {
  addAddressEntry,
  deleteAddressEntry,
  exportAddressBook,
  importAddressBook,
  searchAddressBook,
  updateAddressEntry,
  type AddressEntry,
} from "../../services/addressBook";

export interface AddressBookPageProps {
  networkId: NetworkId;
}

const EMPTY_FORM = {
  label: "",
  address: "",
  notes: "",
  verified: false,
};

type FormState = typeof EMPTY_FORM;

/**
 * Full address book management UI for Settings → Address Book (#587).
 * CRUD, search, JSON import/export, and verified contact badges.
 */
export function AddressBookPage({ networkId }: AddressBookPageProps) {
  const [entries, setEntries] = useState<AddressEntry[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AddressEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AddressEntry | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries(searchAddressBook(networkId, query));
  }, [networkId, query]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = () => {
    setForm(EMPTY_FORM);
    setAdding(true);
    setEditing(null);
  };

  const handleEdit = (entry: AddressEntry) => {
    setForm({
      label: entry.label,
      address: entry.address,
      notes: entry.notes,
      verified: entry.verified,
    });
    setEditing(entry);
    setAdding(false);
  };

  const handleSave = () => {
    if (adding) {
      addAddressEntry(networkId, form);
    } else if (editing) {
      updateAddressEntry(networkId, editing.id, form);
    }
    setAdding(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    refresh();
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      deleteAddressEntry(networkId, deleteTarget.id);
      setDeleteTarget(null);
      refresh();
    }
  };

  const handleExport = () => exportAddressBook(networkId);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const count = importAddressBook(
          networkId,
          evt.target?.result as string
        );
        setImportSuccess(
          `Imported ${count} new contact${count !== 1 ? "s" : ""}.`
        );
        refresh();
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Import failed");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported if needed.
    e.target.value = "";
  };

  const isFormValid =
    form.label.trim().length > 0 && form.address.trim().length > 0;

  return (
    <section aria-labelledby="address-book-heading">
      <Card ariaLabel="Address book">
        <div className="address-book">
          <h2 id="address-book-heading" className="address-book-heading">
            Address Book
            <span className="address-book-network-badge">{networkId}</span>
          </h2>
          <p className="address-book-hint">
            Saved contacts are network-scoped — mainnet and testnet contacts are
            stored separately. Verified contacts are marked with a ✓ badge.
          </p>

          {/* Search + action bar */}
          <div className="address-book-toolbar">
            <label htmlFor="address-book-search" className="sr-only">
              Search contacts
            </label>
            <input
              id="address-book-search"
              type="search"
              className="address-book-search"
              placeholder="Search by label or address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search address book"
            />
            <div className="address-book-actions">
              <Button variant="primary" onClick={handleAdd}>
                Add contact
              </Button>
              <Button variant="secondary" onClick={handleExport}>
                Export JSON
              </Button>
              <label
                className="address-book-import-label"
                aria-label="Import contacts from JSON file"
              >
                Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={handleImport}
                  aria-label="Import contacts from JSON file"
                />
              </label>
            </div>
          </div>

          {importSuccess && (
            <p className="settings-status success" role="status">
              {importSuccess}
            </p>
          )}
          {importError && (
            <p className="settings-status error" role="alert">
              {importError}
            </p>
          )}

          {/* Add / Edit form */}
          {(adding || editing) && (
            <div
              className="address-book-form"
              role="form"
              aria-label={editing ? "Edit contact" : "Add contact"}
            >
              <h3>{editing ? "Edit contact" : "New contact"}</h3>
              <div className="form-field">
                <label htmlFor="ab-label">Label *</label>
                <input
                  id="ab-label"
                  type="text"
                  value={form.label}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, label: e.target.value }))
                  }
                  placeholder="e.g. Alice's mainnet wallet"
                  required
                  aria-required="true"
                />
              </div>
              <div className="form-field">
                <label htmlFor="ab-address">Stellar Address *</label>
                <input
                  id="ab-address"
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="G…"
                  required
                  aria-required="true"
                  style={{ fontFamily: "monospace" }}
                />
              </div>
              <div className="form-field">
                <label htmlFor="ab-notes">Notes</label>
                <textarea
                  id="ab-notes"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Optional notes about this contact"
                  rows={2}
                />
              </div>
              <div className="form-field form-field-inline">
                <input
                  id="ab-verified"
                  type="checkbox"
                  checked={form.verified}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, verified: e.target.checked }))
                  }
                />
                <label htmlFor="ab-verified">Mark as verified</label>
              </div>
              <div className="form-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={!isFormValid}
                >
                  {editing ? "Save changes" : "Add contact"}
                </Button>
              </div>
            </div>
          )}

          {/* Contact list */}
          {entries.length === 0 ? (
            <p className="address-book-empty" role="status">
              {query
                ? "No contacts match your search."
                : "No contacts saved yet."}
            </p>
          ) : (
            <ul className="address-book-list" aria-label="Saved contacts">
              {entries.map((entry) => (
                <li key={entry.id} className="address-book-entry">
                  <div className="address-book-entry-header">
                    <span className="address-book-label">
                      {entry.verified && (
                        <span
                          className="address-book-verified-badge"
                          aria-label="Verified"
                          title="Verified contact"
                        >
                          ✓
                        </span>
                      )}
                      {entry.label}
                    </span>
                    <div className="address-book-entry-actions">
                      <Button variant="ghost" onClick={() => handleEdit(entry)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteTarget(entry)}
                        aria-label={`Delete ${entry.label}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <span
                    className="address-book-address"
                    style={{ fontFamily: "monospace" }}
                    title={entry.address}
                  >
                    {entry.address}
                  </span>
                  {entry.notes && (
                    <p className="address-book-notes">{entry.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ab-delete-title"
          aria-describedby="ab-delete-desc"
          className="modal-overlay"
          onKeyDown={(e) => {
            if (e.key === "Escape") setDeleteTarget(null);
          }}
        >
          <div className="modal-panel">
            <h3 id="ab-delete-title">Delete contact?</h3>
            <p id="ab-delete-desc">
              Remove <strong>{deleteTarget.label}</strong> from your address
              book? This cannot be undone.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
