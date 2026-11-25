"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { MerchantReputationBadge, VerificationBadge } from "@delegolabs/ui";
import { useMerchantDirectory } from "../../hooks/useMerchantDirectory";
import { filterMerchants } from "../../lib/merchantDirectory";
import styles from "./MerchantDirectory.module.css";

export function MerchantDirectory() {
  const formId = useId();
  const { merchants, loading, error } = useMerchantDirectory();
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("all");
  const [category, setCategory] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const categories = [
    ...new Set(
      merchants.flatMap((merchant) =>
        merchant.category ? [merchant.category] : []
      )
    ),
  ].sort();
  const results = filterMerchants(merchants, search).filter(
    (merchant) =>
      (tier === "all" ||
        (tier === "unverified"
          ? !merchant.verificationTier
          : merchant.verificationTier === tier)) &&
      (!category || merchant.category === category) &&
      (!minimumScore ||
        (merchant.reputationScore !== undefined &&
          merchant.reputationScore >= Number(minimumScore)))
  );
  const hasFilters =
    search !== "" || tier !== "all" || category !== "" || minimumScore !== "";

  function clearFilters() {
    setSearch("");
    setTier("all");
    setCategory("");
    setMinimumScore("");
  }

  return (
    <section
      className={`settings-page ${styles.directory}`}
      aria-labelledby="merchant-directory-title"
    >
      <header className="header">
        <h1 id="merchant-directory-title">Merchant Directory</h1>
        <p>
          Find your next store. Compare merchant verification, reputation, and
          categories before you shop.
        </p>
      </header>
      <form
        className={styles.filters}
        aria-label="Filter merchants"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={`${styles.field} ${styles.search}`}>
          <label htmlFor={`${formId}-search`}>Search merchants</label>
          <input
            id={`${formId}-search`}
            type="search"
            placeholder="Merchant name or ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-tier`}>Verification tier</label>
          <select
            id={`${formId}-tier`}
            value={tier}
            onChange={(event) => setTier(event.target.value)}
          >
            <option value="all">All tiers</option>
            <option value="verified">Verified Merchant</option>
            <option value="gold">Top Rated (Gold)</option>
            <option value="pro">Fast Shipper (Pro)</option>
            <option value="unverified">Not verified</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-category`}>Category</label>
          <select
            id={`${formId}-category`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-score`}>Minimum reputation</label>
          <select
            id={`${formId}-score`}
            value={minimumScore}
            onChange={(event) => setMinimumScore(event.target.value)}
          >
            <option value="">Any score</option>
            <option value="50">50 and above</option>
            <option value="75">75 and above</option>
            <option value="90">90 and above</option>
          </select>
        </div>
        <button type="button" onClick={clearFilters} disabled={!hasFilters}>
          Clear filters
        </button>
      </form>
      {loading ? (
        <div aria-busy="true" aria-label="Loading merchants">
          <p role="status">Loading merchants...</p>
          <div className={styles.grid} aria-hidden="true">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <div key={index} className="card skeleton">
                <div className="skeleton-title" />
                <div className="skeleton-text mt-2" />
                <div className="skeleton-button mt-4" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <p role="alert">
          Unable to load merchants. Please refresh the page to try again.
        </p>
      ) : (
        <>
          <p role="status" aria-live="polite">
            {results.length} {results.length === 1 ? "merchant" : "merchants"}{" "}
            found
          </p>
          {results.length === 0 ? (
            <p>
              {merchants.length === 0
                ? "No merchants are listed yet. Check back soon."
                : "No merchants match your filters. Try a different search or clear filters."}
            </p>
          ) : (
            <ul className={styles.grid} aria-label="Merchants">
              {results.map((merchant) => (
                <li key={merchant.id} className={styles.card}>
                  <p className={styles.category}>
                    {merchant.category || "Category not listed"}
                  </p>
                  <h2>
                    <Link href={`/store/${encodeURIComponent(merchant.id)}`}>
                      {merchant.name}
                    </Link>
                  </h2>
                  {merchant.description && <p>{merchant.description}</p>}
                  <div className={styles.badges}>
                    {merchant.verificationTier ? (
                      <VerificationBadge
                        tier={merchant.verificationTier}
                        reputationScoreBps={
                          (merchant.reputationScore ?? 0) * 100
                        }
                        showTooltip={merchant.reputationScore !== undefined}
                      />
                    ) : (
                      <span>Not verified</span>
                    )}
                    {merchant.reputationScore !== undefined &&
                    merchant.totalOrdersCompleted !== undefined ? (
                      <MerchantReputationBadge
                        score={merchant.reputationScore}
                        totalOrdersCompleted={merchant.totalOrdersCompleted}
                        isVerified={!!merchant.verificationTier}
                      />
                    ) : (
                      <span>
                        {merchant.reputationScore !== undefined
                          ? `Reputation: ${merchant.reputationScore}/100`
                          : "Reputation not published"}
                      </span>
                    )}
                  </div>
                  <Link
                    className={styles.visit}
                    href={`/store/${encodeURIComponent(merchant.id)}`}
                    aria-label={`Visit ${merchant.name}`}
                  >
                    Visit store <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
