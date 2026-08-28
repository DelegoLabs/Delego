"use client";

import { useState } from "react";
import { Card, Button } from "@delego/ui";
import { useOrder } from "../../hooks/useOrder";
import { useOrderIssues } from "../../hooks/useOrderIssues";
import { IssueList } from "./IssueList";
import { ReportProblemForm } from "./ReportProblemForm";

export function OrderDetailView({ orderId }: { orderId: string }) {
  const [reporting, setReporting] = useState(false);
  const { data: order, isLoading: orderLoading, error: orderError } = useOrder(orderId);
  const { data: issues, isLoading: issuesLoading } = useOrderIssues(orderId);

  if (orderLoading) {
    return (
      <main className="container">
        <p>Loading order...</p>
      </main>
    );
  }

  if (orderError || !order) {
    return (
      <main className="container">
        <p>Order not found.</p>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Order {order.id.slice(0, 8)}</h1>
        <p>Status: {order.status}</p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Card title="Issues">
          {issuesLoading ? <p>Loading issues...</p> : <IssueList issues={issues ?? []} />}
          {!reporting ? (
            <div style={{ marginTop: "1rem" }}>
              <Button variant="secondary" onClick={() => setReporting(true)}>
                Report a problem
              </Button>
            </div>
          ) : (
            <div style={{ marginTop: "1rem" }}>
              <ReportProblemForm
                orderId={orderId}
                onSuccess={() => setReporting(false)}
                onCancel={() => setReporting(false)}
              />
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
