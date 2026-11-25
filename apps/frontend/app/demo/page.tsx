"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { enableDemoMode } from "../../lib/demoMode";

const SCENARIOS = [
  {
    name: "Buyer Dashboard",
    description: "Review delegations, approvals, orders, and spend.",
    href: "/",
    variant: "primary",
  },
  {
    name: "Merchant Portal",
    description: "Inspect catalog, incoming orders, and payouts.",
    href: "/merchant",
    variant: "secondary",
  },
  {
    name: "Dispute Review",
    description: "Open escrows and follow an active dispute.",
    href: "/escrows",
    variant: "secondary",
  },
] as const;

function DemoScenarioPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoStart = searchParams.get("auto") === "1";

  useEffect(() => {
    if (!autoStart) return;
    enableDemoMode();
    router.replace("/");
  }, [autoStart, router]);

  if (autoStart) {
    return (
      <div className="settings-page">
        <p>Starting the demo…</p>
      </div>
    );
  }

  const launch = (href: string) => {
    enableDemoMode();
    router.push(href);
  };

  return (
    <div className="settings-page demo-picker-page">
      <header className="header">
        <h1>Explore the Delego demo</h1>
        <p>
          Choose a starting point. Demo mode uses sample data and never changes
          real account state.
        </p>
      </header>

      <Card title="Choose a scenario" titleLevel={2}>
        <div className="grid">
          {SCENARIOS.map((scenario) => (
            <Button
              key={scenario.name}
              variant={scenario.variant}
              className="demo-scenario-button"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "0.375rem",
                minHeight: "7rem",
                padding: "1rem",
                textAlign: "left",
              }}
              onClick={() => launch(scenario.href)}
            >
              <span className="demo-scenario-title">{scenario.name}</span>
              <span className="demo-scenario-description">
                {scenario.description}
              </span>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function DemoEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="settings-page">
          <p>Loading demo scenarios…</p>
        </div>
      }
    >
      <DemoScenarioPicker />
    </Suspense>
  );
}
