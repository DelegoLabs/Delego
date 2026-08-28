"use client";

import { use, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { WidgetBoundary } from "./WidgetBoundary";
import {
  clearResource,
  delayedResource,
  getResource,
} from "../../lib/suspenseResource";

function FastWidget() {
  const value = use(getResource("widget-fast", () => Promise.resolve("fast-ready")));
  return <p>{value}</p>;
}

function SlowWidget() {
  const value = use(
    delayedResource("widget-slow", () => Promise.resolve("slow-ready"), 60)
  );
  return <p>{value}</p>;
}

function BoomWidget(): ReactNode {
  throw new Error("boom");
}

describe("WidgetBoundary (#625)", () => {
  beforeEach(() => {
    clearResource();
  });

  it("lets a delayed widget stream in last without blocking siblings", async () => {
    render(
      <>
        <WidgetBoundary name="fast" minHeight="4rem">
          <FastWidget />
        </WidgetBoundary>
        <WidgetBoundary name="slow" minHeight="8rem">
          <SlowWidget />
        </WidgetBoundary>
      </>
    );

    expect(await screen.findByText("fast-ready")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading slow")).toBeInTheDocument();
    expect(screen.queryByText("slow-ready")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("slow-ready")).toBeInTheDocument();
    });
  });

  it("reserves the same minHeight on skeleton and content (no CLS)", async () => {
    render(
      <WidgetBoundary name="chart" minHeight="20rem">
        <FastWidget />
      </WidgetBoundary>
    );
    const skeleton = screen.queryByLabelText("Loading chart");
    if (skeleton) {
      expect(skeleton).toHaveStyle({ minHeight: "20rem" });
    }
    const content = await screen.findByText("fast-ready");
    expect(content.parentElement).toHaveStyle({ minHeight: "20rem" });
  });

  it("keeps siblings visible when one widget throws", async () => {
    render(
      <>
        <WidgetBoundary name="fast" minHeight="4rem">
          <FastWidget />
        </WidgetBoundary>
        <WidgetBoundary name="broken" minHeight="8rem">
          <BoomWidget />
        </WidgetBoundary>
      </>
    );

    expect(await screen.findByText("fast-ready")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load this widget/i)).toBeInTheDocument();
  });
});
