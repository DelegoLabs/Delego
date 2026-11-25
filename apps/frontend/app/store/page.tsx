"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@delegolabs/ui";
import { useMerchantDirectory } from "../../hooks/useMerchantDirectory";
import {
  filterMerchants,
  type DirectoryMerchant,
} from "../../lib/merchantDirectory";

type StoreDirectoryMerchant = DirectoryMerchant & {
  category?: string;
  description?: string;
};

const ALL_CATEGORIES = "All";

function normalizeCategory(category?: string): string | null {
  if (typeof category !== "string") return null;
  const trimmed = category.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function StoreDirectoryPage() {
  const { merchants, loading, error } = useMerchantDirectory();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const searchId = useId();
  const categoryId = useId();

  const directoryMerchants = merchants as StoreDirectoryMerchant[];

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const merchant of directoryMerchants) {
      const cat = normalizeCategory(merchant.category);
      if (cat) unique.add(cat);
    }
    return [ALL_CATEGORIES, ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [directoryMerchants]);

  const filteredMerchants = useMemo(() => {
    const bySearch = filterMerchants(
      directoryMerchants,
      search
    ) as StoreDirectoryMerchant[];

    if (selectedCategory === ALL_CATEGORIES) {
      return bySearch;
    }

    return bySearch.filter(
      (merchant) => normalizeCategory(merchant.category) === selectedCategory
    );
  }, [directoryMerchants, search, selectedCategory]);

  const hasActiveFilters =
    search.trim().length > 0 || selectedCategory !== ALL_CATEGORIES;

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Merchant Storefronts</h1>
        <p>
          Browse verified Delego merchants and explore their storefronts.
        </p>
      </header>

      <section
        aria-label="Filter merchants"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-end",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            flex: "1 1 220px",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <label htmlFor={searchId} style={{ fontWeight: 500 }}>
            Search merchants
          </label>
          <input
            id={searchId}
            type="search"
            className="order-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by merchant name or ID"
          />
        </div>

        <div
          style={{
            flex: "0 1 220px",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          <label htmlFor={categoryId} style={{ fontWeight: 500 }}>
            Category
          </label>
          <select
            id={categoryId}
            className="order-search"
            aria-label="Filter by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading && (
        <section
          className="grid"
          aria-busy="true"
          aria-label="Loading merchants"
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card skeleton">
              <div className="skeleton-title" />
              <div className="skeleton-text mt-2" />
              <div className="skeleton-button mt-4" />
            </div>
          ))}
        </section>
      )}

      {!loading && error && (
        <div className="card" role="alert">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && filteredMerchants.length === 0 && (
        <div className="card">
          <p>
            {hasActiveFilters
              ? "No verified merchants match your current search or category filter."
              : "No verified merchants are currently available."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSelectedCategory(ALL_CATEGORIES);
              }}
              style={{ marginTop: "0.75rem" }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && filteredMerchants.length > 0 && (
        <section className="grid" aria-label="Verified merchants">
          {filteredMerchants.map((merchant) => {
            const category = normalizeCategory(merchant.category);
            return (
              <article
                key={merchant.id}
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
                      {merchant.name}
                    </h2>
                    <Badge tone="info">Verified</Badge>
                  </div>

                  {category && (
                    <div>
                      <Badge tone="neutral">{category}</Badge>
                    </div>
                  )}

                  {merchant.description && (
                    <p style={{ margin: 0 }}>{merchant.description}</p>
                  )}

                  <p style={{ margin: 0, fontSize: "0.875rem", opacity: 0.75 }}>
                    ID: <code>{merchant.id}</code>
                  </p>
                </div>

                <div>
                  <Link
                    href={`/store/${encodeURIComponent(merchant.id)}`}
                    style={{
                      display: "inline-block",
                      fontWeight: 500,
                      textDecoration: "underline",
                    }}
                  >
                    Visit storefront
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
