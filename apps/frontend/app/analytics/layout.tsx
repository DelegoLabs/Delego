import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Analytics | Delego",
  description:
    "View real-time performance metrics, transaction trends, and operational insights on Delego.",
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}