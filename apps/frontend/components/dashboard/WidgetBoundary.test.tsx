"use client";

import { use, type ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { WidgetBoundary } from "./WidgetBoundary";
import {
  clearResource,
  getResource,
} from "../../lib/suspenseResource";

function FastWidget() {
  const value = use(getResource("widget-fast", () => Promise.resolve("fast-ready")));
  return <p>{value}</p>;
}

let resolveSlow: ((v: string) => void) | undefined;
function SlowWidget() {
  const value = use(
    getResource(
      "widget-slow",
      () =>
        new Promise<string>((resolve) => {
          resolveSlow = resolve;
        })
    )
  );
  return <p>{value}</p>;
}

function BoomWidget(): ReactNode {
  throw new Error("boom");
}

describe("WidgetBoundary (#625)", () => {
  beforeEach(() => {
    clearResource();
    resolveSlow = undefined;
  });

  it("lets a delayed widget stream in last without blocking siblings", async () => {
    await act(async () => {
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
    });

    expect(screen.getByText("fast-ready")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading slow")).toBeInTheDocument();
    expect(screen.queryByText("slow-ready")).not.toBeInTheDocument();

    await act(async () => {
      resolveSlow?.("slow-ready");
    });

    await waitFor(() => {
      expect(screen.getByText("slow-ready")).toBeInTheDocument();
    });
  });

  it("reserves the same minHeight on skeleton and content (no CLS)", async () => {
    await act(async () => {
      render(
        <WidgetBoundary name="chart" minHeight="20rem">
          <FastWidget />
        </WidgetBoundary>
      );
    });
    const content = screen.getByText("fast-ready");
    expect(content.parentElement).toHaveStyle({ minHeight: "20rem" });
  });

  it("keeps siblings visible when one widget throws", async () => {
    await act(async () => {
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
    });

    expect(screen.getByText("fast-ready")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load this widget/i)).toBeInTheDocument();
  });
});
