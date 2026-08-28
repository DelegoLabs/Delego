"use client";

import { useEffect, useMemo, useState } from "react";
import type { Delegation } from "@delegolabs/types";
import { Button } from "@delegolabs/ui";
import { useDelegations } from "../../hooks/useDelegations";
import { useWallet } from "../../hooks/useWallet";
import { useQueryParamState } from "../../hooks/useQueryParamState";
import { useAnnounce } from "../../hooks/useAnnounce";
import { DelegationWizard } from "../../components/delegations/DelegationWizard";
import { DelegationFilters } from "../../components/delegations/DelegationFilters";
import { DelegationList } from "../../components/delegations/DelegationList";
import { NotificationPermissionPrompt } from "../../components/notifications/NotificationPermissionPrompt";
import { CopyViewLinkButton } from "../../components/filters/CopyViewLinkButton";
import { StaleBadge } from "../../components/offline/StaleBadge";
import { OPEN_DELEGATION_FORM_KEY } from "../../lib/delegationFormIntent";

type DelegationStatus = Delegation["status"];

/** Delegation management page — create, view, edit, pause/resume, and revoke delegations. */
export default function DelegationsPage() {
  const {
    delegations,
    loading,
    error,
    pendingIds,
    stale,
    cachedAt,
    ttlMs,
    createDelegation,
    updateDelegation,
    revokeDelegation,
  } = useDelegations();

  const { address } = useWallet();
  const [showForm, setShowForm] = useState(false);
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  const { announce } = useAnnounce();

  const [search, setSearch] = useQueryParamState<string>({
    key: "q",
    defaultValue: "",
  });

  const [selectedStatuses, setSelectedStatuses] = useQueryParamState<
    DelegationStatus[]
  >({
    key: "status",
    defaultValue: [],
  });

  const visibleDelegations = useMemo(() => {
    const term = search.trim().toLowerCase();

    return delegations.filter((d) => {
      const matchesSearch =
        term === "" ||
        d.agentId.toLowerCase().includes(term) ||
        d.walletId.toLowerCase().includes(term);

      const matchesStatus =
        selectedStatuses.length === 0 ||
        selectedStatuses.includes(d.status);

      return matchesSearch && matchesStatus;
    });
  }, [delegations, search, selectedStatuses]);

  const toggleStatus = (status: DelegationStatus) => {
    setSelectedStatuses(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((s) => s !== status)
        : [...selectedStatuses, status]
    );
  };

  // Opened via the command palette's "New delegation" quick action.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(OPEN_DELEGATION_FORM_KEY)) {
        window.sessionStorage.removeItem(OPEN_DELEGATION_FORM_KEY);
        setShowForm(true);
      }
    } catch {
      // sessionStorage may be unavailable (private mode) — just skip auto-open.
    }
  }, []);

  const handleCreate = async (
    input: Parameters<typeof createDelegation>[0]
  ) => {
    const wasFirstDelegation = delegations.length === 0;
    const created = await createDelegation(input);

    if (created) {
      setShowForm(false);
      announce("Delegation created successfully.", "polite");

      if (wasFirstDelegation) {
        setShowNotifyPrompt(true);
      }
    }
  };

  return (
    <div className="settings-page">
      <header className="header">
        <div className="header-row">
          <div>
            <h1>Delegations</h1>
            <p>
              Grant, adjust, and revoke scoped spending authority for AI agents
            </p>
            <StaleBadge
              family="delegations"
              stale={stale}
              cachedAt={cachedAt}
              ttlMs={ttlMs}
            />
          </div>

          <CopyViewLinkButton />
        </div>
      </header>

      {error && (
        <div className="settings-status error" role="alert">
          {error}
        </div>
      )}

      <div className="form-actions">
        <Button
          variant="primary"
          onClick={() => setShowForm((v) => !v)}
          ariaLabel={
            showForm ? "Close delegation form" : "Create new delegation"
          }
          aria-expanded={showForm}
          aria-controls="delegation-wizard-region"
        >
          {showForm ? "Close" : "New delegation"}
        </Button>
      </div>

      {showNotifyPrompt && (
        <NotificationPermissionPrompt message="Get notified about approvals for this delegation, even when this tab isn't in focus." />
      )}

      {showForm && (
        <div id="delegation-wizard-region">
          <DelegationWizard
            defaultWalletId={address ?? ""}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {delegations.length > 0 && (
        <DelegationFilters
          search={search}
          onSearchChange={setSearch}
          selectedStatuses={selectedStatuses}
          onToggleStatus={toggleStatus}
        />
      )}

      <DelegationList
        delegations={visibleDelegations}
        loading={loading}
        pendingIds={pendingIds}
        onUpdate={updateDelegation}
        onRevoke={revokeDelegation}
        filtered={
          delegations.length > 0 &&
          visibleDelegations.length !== delegations.length
        }
      />
    </div>
  );
}