"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Chip,
} from "@delego/ui";
import type {
  ApprovalItem,
  EscrowFeeSummary,
  IssueCategory,
  OrderIssue,
  OrderStatus,
} from "@delego/types";
import {
  IssueBadge,
  IssuePanel,
  ReportIssueForm,
} from "./components/issues/ReportIssueForm";
import {
  DisputeForm,
  type DisputePrefill,
} from "./components/disputes/DisputeForm";
import {
  EscrowFeeBreakdown,
  EscrowReceipt,
} from "./components/escrow/EscrowFeeBreakdown";
import { ReleaseEscrowButton } from "./components/escrow/ReleaseEscrowButton";
import { VirtualApprovalsList } from "./components/approvals/VirtualApprovalsList";

const DEMO_BUYER = "GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB";
const DEMO_ESCROW_ID = "42";
const DEMO_ORDER_ID = "ord_demo_001";

const SAMPLE_FEES: EscrowFeeSummary = {
  grossStroops: 25_000_000n,
  totalFeeStroops: 375_000n,
  netProceedsStroops: 24_625_000n,
  hasEstimates: false,
  lines: [
    {
      treasuryName: "Platform treasury",
      grossStroops: 25_000_000n,
      feeStroops: 250_000n,
      feePercentageBps: 100,
      estimated: false,
    },
    {
      treasuryName: "Insurance fund",
      grossStroops: 25_000_000n,
      feeStroops: 125_000n,
      feePercentageBps: 50,
      estimated: false,
    },
  ],
};

const SAMPLE_ISSUE: OrderIssue = {
  id: "issue_demo_001",
  orderId: DEMO_ORDER_ID,
  category: "late",
  status: "OPEN",
  message: "Seller said 3 day shipping, it's been a week and still no update.",
  photoUrl: "https://example.com/shipping-label.png",
  reportedBy: DEMO_BUYER,
  reportedAt: new Date(Date.now() - 2 * 86_400_000),
  resolvedAt: null,
  escalatedAt: null,
  escalationDays: 2,
};

function buildApprovalFixture(count: number): ApprovalItem[] {
  const kinds: ApprovalItem["kind"][] = [
    "SPEND_LIMIT_EXCEEDED",
    "DELEGATION_CREATION",
    "ESCROW_RELEASE",
    "ESCROW_REFUND",
    "DISPUTE_RESOLUTION",
  ];
  const statuses: ApprovalItem["status"][] = ["PENDING", "PENDING", "PENDING", "APPROVED", "REJECTED", "ESCALATED"];
  return Array.from({ length: count }, (_, i) => ({
    id: `appr_${String(i + 1).padStart(6, "0")}`,
    kind: kinds[i % kinds.length],
    status: statuses[i % statuses.length],
    title: `Release escrow funds for Order #${1000 + i}`,
    subtitle: `Merchant ${(i % 23) + 1}`,
    amountStroops:
      i % 7 === 0 ? null : BigInt(1_000_000 + ((i * 137_000) % 250_000_000)),
    requesterId: `agent_${(i % 11) + 1}`,
    requesterDisplayName:
      i % 5 === 0 ? null : `Agent ${String.fromCharCode(65 + (i % 11))}`,
    targetId: `escrow_${i}`,
    createdAt: new Date(Date.now() - i * 3_600_000),
    updatedAt: new Date(Date.now() - i * 3_600_000),
    dueAt: i % 19 === 0 ? new Date(Date.now() + (20 - i) * 3_600_000) : null,
    tags: i % 4 === 0 ? ["high-priority"] : [],
  }));
}

type DemoTab = "issues" | "fees" | "release" | "approvals";

export default function HomePage() {
  const [tab, setTab] = useState<DemoTab>("issues");
  const [showReportForm, setShowReportForm] = useState(false);
  const [issue, setIssue] = useState<OrderIssue | null>(SAMPLE_ISSUE);
  const [disputePrefill, setDisputePrefill] = useState<DisputePrefill | null>(null);
  const [approvalsCount, setApprovalsCount] = useState(1000);

  const sampleOrder = useMemo(
    () => ({
      id: DEMO_ORDER_ID,
      userId: "user_demo",
      delegationId: "del_demo",
      merchantId: "merchant_demo",
      status: "escrowed" as OrderStatus,
      lineItems: [],
      totalStroops: 25_000_000n,
      escrowContractId: DEMO_ESCROW_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
      issue,
      dispute: null,
    }),
    [issue]
  );

  const approvalsFixture = useMemo(
    () => buildApprovalFixture(approvalsCount),
    [approvalsCount]
  );

  return (
    <main className="container" style={{ paddingBottom: "4rem" }}>
      <header className="header">
        <h1>Delego — Feature Demos</h1>
        <p>Four new features: Pre-dispute flow, fee transparency, release eligibility, virtualized approvals.</p>
      </header>

      <nav
        role="tablist"
        aria-label="Feature demos"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1.5rem",
        }}
      >
        {([
          ["issues", "1. Pre-dispute resolution"],
          ["fees", "2. Escrow fee transparency"],
          ["release", "3. Release eligibility"],
          ["approvals", "4. Virtual approvals list"],
        ] as Array<[DemoTab, string]>).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
          >
            {label}
          </Button>
        ))}
      </nav>

      {tab === "issues" && (
        <section
          role="tabpanel"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <Card title={`Order #${sampleOrder.id} — status: ${sampleOrder.status}`}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}
            >
              <Chip variant="info">25.0000000 XLM held in escrow</Chip>
              {sampleOrder.issue && <IssueBadge issue={sampleOrder.issue} />}
            </div>

            {!sampleOrder.issue && !showReportForm && (
              <Button type="button" variant="secondary" onClick={() => setShowReportForm(true)}>
                Report a problem with this order
              </Button>
            )}

            {showReportForm && !sampleOrder.issue && (
              <ReportIssueForm
                orderId={sampleOrder.id}
                onCancel={() => setShowReportForm(false)}
                onSuccess={(newIssue) => {
                  setIssue(newIssue);
                  setShowReportForm(false);
                }}
              />
            )}

            {sampleOrder.issue && !disputePrefill && (
              <IssuePanel
                order={sampleOrder}
                issue={sampleOrder.issue}
                onEscalateToDispute={(prefill) =>
                  setDisputePrefill({
                    category: prefill.category as IssueCategory extends never
                      ? never
                      : any,
                    message: prefill.message,
                    issueId: prefill.issueId,
                  })
                }
              />
            )}

            {disputePrefill && (
              <DisputeForm
                orderId={sampleOrder.id}
                escrowId={sampleOrder.escrowContractId!}
                prefill={disputePrefill}
                onCancel={() => setDisputePrefill(null)}
                onSuccess={() => {
                  setIssue((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: "ESCALATED",
                          escalatedAt: new Date(),
                        }
                      : prev
                  );
                  setDisputePrefill(null);
                }}
              />
            )}
          </Card>
        </section>
      )}

      {tab === "fees" && (
        <section
          role="tabpanel"
          style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}
        >
          <EscrowReceipt
            orderId={DEMO_ORDER_ID}
            escrowId={DEMO_ESCROW_ID}
            grossStroops={25_000_000n}
            fees={SAMPLE_FEES}
          />

          <Card title="Fees missing-config fallback">
            <EscrowFeeBreakdown fees={null} />
          </Card>

          <Card title="Fees with Estimated badge (dynamic)">
            <EscrowFeeBreakdown
              fees={{
                ...SAMPLE_FEES,
                hasEstimates: true,
                lines: SAMPLE_FEES.lines.map((l) => ({
                  ...l,
                  estimated: true,
                  feePercentageBps: null,
                })),
              }}
            />
          </Card>

          <Card title="Compact single-treasury view">
            <EscrowFeeBreakdown
              compact
              fees={{
                grossStroops: 5_000_000n,
                totalFeeStroops: 50_000n,
                netProceedsStroops: 4_950_000n,
                lines: [],
                hasEstimates: false,
              }}
            />
          </Card>
        </section>
      )}

      {tab === "release" && (
        <section
          role="tabpanel"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <Card title="Escrow release — eligibility-aware CTA">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "0.5rem 0",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#374151" }}>
                The button below is guarded by the on-chain
                <code style={{ margin: "0 0.25rem", padding: "0 0.25rem", background: "#f3f4f6", borderRadius: "0.25rem" }}>
                  release_eligibility
                </code>
                getter. If the contract reports any unmet conditions, the CTA is disabled
                and a tooltip/popover lists <em>exactly</em> why.
              </p>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.25rem",
                  fontSize: "0.8125rem",
                  color: "#6b7280",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <li>Results are cached per (escrowId, caller) with a 15 s TTL.</li>
                <li>A submit-handler guard <em>absolutely prevents</em> firing a release attempt when ineligible.</li>
                <li>On successful release the cache is invalidated and eligibility refetches.</li>
              </ul>

              <div style={{ marginTop: "0.5rem" }}>
                <ReleaseEscrowButton
                  escrowId={DEMO_ESCROW_ID}
                  callerAddress={DEMO_BUYER}
                  variant="primary"
                />
              </div>
            </div>
          </Card>
        </section>
      )}

      {tab === "approvals" && (
        <section
          role="tabpanel"
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <Card title={`Virtualized approvals (${approvalsCount.toLocaleString()} items)`}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}
            >
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Fixture size:</span>
              {[100, 500, 1000, 5000].map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={approvalsCount === n ? "primary" : "ghost"}
                  onClick={() => setApprovalsCount(n)}
                >
                  {n.toLocaleString()}
                </Button>
              ))}
            </div>

            <details
              style={{
                marginBottom: "1rem",
                padding: "0.5rem 0.75rem",
                background: "#f9fafb",
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                Hotkeys (j/k, u/d, g/G, x, s/a, r, A, R)
              </summary>
              <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0, color: "#374151" }}>
                <li><kbd>j</kbd> / <kbd>↓</kbd> — focus next (logical)</li>
                <li><kbd>k</kbd> / <kbd>↑</kbd> — focus previous (logical)</li>
                <li><kbd>d</kbd> / <kbd>PgDn</kbd> — page down</li>
                <li><kbd>u</kbd> / <kbd>PgUp</kbd> — page up</li>
                <li><kbd>g</kbd> / <kbd>Home</kbd> — jump to first; <kbd>G</kbd> / <kbd>End</kbd> — last</li>
                <li><kbd>x</kbd> / <kbd>Space</kbd> — toggle select focused; <kbd>Enter</kbd> — open</li>
                <li><kbd>s</kbd> or <kbd>a</kbd> — approve focused; <kbd>r</kbd> — reject focused</li>
                <li><kbd>A</kbd> — bulk approve selection; <kbd>R</kbd> — bulk reject selection</li>
              </ul>
            </details>

            <VirtualApprovalsList
              items={approvalsFixture}
              rowHeight={72}
              overscan={12}
            />
          </Card>
        </section>
      )}
    </main>
  );
}
