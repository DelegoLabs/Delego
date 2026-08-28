"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ApiResponse, Order } from "@delegolabs/types";
import { useRegisterCommands, type Command } from "./useCommandRegistry";
import { useNetwork } from "./useNetwork";
import { navItems } from "../components/layout/navItems";
import type { Delegation } from "@delegolabs/types";
import { api } from "../lib/api";
import { downloadCsv, toCsv } from "../lib/csv";
import { formatXlm } from "../lib/orders";
import {
  approvalDecisionsToCsv,
  deriveApprovalDecisions,
} from "../lib/approvals";
import { OPEN_DELEGATION_FORM_KEY } from "../lib/delegationFormIntent";

async function exportOrdersCsv(): Promise<void> {
  const res: ApiResponse<Order[]> = await api.getOrders({});
  if (res.error || !Array.isArray(res.data)) return;

  const rows = res.data.map((order) => [
    order.id,
    order.merchantId,
    order.status,
    formatXlm(order.totalStroops),
    order.createdAt.toISOString(),
  ]);

  downloadCsv(
    `delego-orders-${Date.now()}.csv`,
    toCsv(["Order", "Merchant", "Status", "Total (XLM)", "Created"], rows)
  );
}

/**
 * Decisions dataset (#568) — distinct from the orders export above: one row
 * per approve/reject decision, with the agent resolved via the delegation.
 * Column schema lives in lib/approvals.ts.
 */
async function exportApprovalDecisionsCsv(): Promise<void> {
  const [ordersRes, delegationsRes] = await Promise.all([
    api.getOrders({}),
    api.getDelegations(),
  ]);
  if (ordersRes.error || !Array.isArray(ordersRes.data)) return;

  const agentByDelegationId = new Map<string, string>();
  const delegations = delegationsRes?.data as Delegation[] | null | undefined;
  for (const delegation of delegations ?? []) {
    agentByDelegationId.set(delegation.id, delegation.agentId);
  }

  const records = deriveApprovalDecisions(ordersRes.data, {
    agentByDelegationId,
  });
  const { header, rows } = approvalDecisionsToCsv(records);
  downloadCsv(
    `delego-approval-decisions-${Date.now()}.csv`,
    toCsv(header, rows)
  );
}

/**
 * Registers the command palette's baseline commands: one "go to" entry per
 * nav route, plus the FE-024 quick actions (toggle network, new delegation,
 * export orders CSV). Other features can add their own via
 * `useRegisterCommands` without touching this file.
 */
export function useBuiltinCommands(): void {
  const router = useRouter();
  const t = useTranslations("nav");
  const { networkId, networks, setNetwork } = useNetwork();

  const commands = useMemo<Command[]>(() => {
    const navigateCommands: Command[] = navItems.map((item) => {
      const label = t(item.labelKey);
      return {
        id: `nav:${item.href}`,
        label: `Go to ${label}`,
        subtitle: item.href,
        icon: item.icon,
        keywords: [item.href, label],
        group: "navigate",
        perform: () => router.push(item.href),
      };
    });

    const otherNetwork = networks.find((network) => network.id !== networkId);

    const actionCommands: (Command | undefined)[] = [
      otherNetwork && {
        id: "action:toggle-network",
        label: `Switch to ${otherNetwork.label}`,
        subtitle: "Toggle active network",
        icon: "🌐",
        keywords: ["network", otherNetwork.label],
        group: "actions",
        perform: () => setNetwork(otherNetwork.id),
      },
      {
        id: "action:new-delegation",
        label: "New delegation",
        subtitle: "Grant spending authority to an agent",
        icon: "🤝",
        keywords: ["delegation", "create", "grant"],
        group: "actions",
        perform: () => {
          try {
            window.sessionStorage.setItem(OPEN_DELEGATION_FORM_KEY, "1");
          } catch {
            // sessionStorage may be unavailable — the page just won't auto-open the form.
          }
          router.push("/delegations");
        },
      },
      {
        id: "action:export-orders-csv",
        label: "Export orders as CSV",
        subtitle: "Download the current order list",
        icon: "📤",
        keywords: ["export", "csv", "orders", "download"],
        group: "actions",
        perform: exportOrdersCsv,
      },
      {
        id: "action:export-approval-decisions-csv",
        label: "Export approval decisions as CSV",
        subtitle: "Download your approve/reject history",
        icon: "📤",
        keywords: ["export", "csv", "approvals", "decisions", "history", "audit"],
        group: "actions",
        perform: exportApprovalDecisionsCsv,
      },
    ];

    return [
      ...navigateCommands,
      ...actionCommands.filter((c): c is Command => Boolean(c)),
    ];
  }, [router, t, networkId, networks, setNetwork]);

  useRegisterCommands(commands);
}
