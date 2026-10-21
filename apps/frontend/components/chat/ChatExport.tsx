"use client";

import { jsPDF } from "jspdf";
import { useRef, useState } from "react";
import { useNow } from "../../hooks/useNow";

let autoTableImported = false;

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
  txHash?: string;
}

export interface ChatExportOptions {
  format: "pdf" | "markdown";
  includeTimestamps: boolean;
  includeTxHashes: boolean;
  sessionId: string;
}

export interface ChatExportResult {
  content: string;
  blob: Blob;
  filename: string;
}

function ensureAutoTable() {
  if (!autoTableImported) {
    // jspdf-autotable is typically loaded globally by the app
    autoTableImported = true;
  }
}

export function useChatExport(
  messages: ChatMessage[],
  options: ChatExportOptions
): ChatExportResult {
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const now = useNow(60_000);

  const generateMarkdown = (): string => {
    const lines: string[] = [];

    if (options.includeTimestamps) {
      lines.push(`# Chat Export - ${now.toISOString()}`);
      lines.push(`**Session ID:** ${options.sessionId}`);
      lines.push("");
    } else {
      lines.push(`# Chat Export`);
      lines.push(`**Session ID:** ${options.sessionId}`);
      lines.push("");
    }

    lines.push("## Conversation");
    lines.push("");

    messages.forEach((msg, index) => {
      const roleLabel = msg.role === "user" ? "👤 User" : "🤖 Agent";
      const timeLabel = options.includeTimestamps
        ? `**${new Date(msg.timestamp).toLocaleString()}**`
        : "";
      const content = msg.content;

      lines.push(`### ${roleLabel} ${index + 1}`);
      if (timeLabel) {
        lines.push(timeLabel);
      }
      lines.push("```");
      lines.push(content);
      lines.push("```");
      lines.push("");

      if (options.includeTxHashes && msg.txHash) {
        lines.push(`**Transaction Hash:** \`${msg.txHash}\``);
        lines.push("");
      }
    });

    return lines.join("\n");
  };

  const generatePDF = (): Blob => {
    ensureAutoTable();

    const doc = new jsPDF();

    let yPos = 10;

    const headerText = options.includeTimestamps
      ? `Chat Export - ${now.toISOString()}`
      : "Chat Export";
    doc.setFontSize(16);
    doc.text(headerText, 14, yPos);
    yPos += 10;

    const sessionText = `Session ID: ${options.sessionId}`;
    doc.setFontSize(10);
    doc.text(sessionText, 14, yPos);
    yPos += 8;

    if (options.includeTxHashes) {
      const txHashText = messages.some((m) => m.txHash)
        ? "Includes transaction hashes"
        : "No transaction hashes";
      doc.text(txHashText, 14, yPos);
      yPos += 8;
    }

    yPos += 5;

    const columns = [
      { header: "Role", dataKey: "role" },
      { header: "Message", dataKey: "content" },
    ];

    if (options.includeTimestamps) {
      columns.unshift({ header: "Timestamp", dataKey: "timestamp" });
    }

    const rows = messages.map((msg) => {
      const row: any = {
        role: msg.role === "user" ? "User" : "Agent",
        content: msg.content,
      };

      if (options.includeTimestamps) {
        row.timestamp = msg.timestamp.toLocaleString();
      }

      return row;
    });

    ;(autoTable as any)(doc, {
      startY: yPos,
      columns,
      body: rows,
      head: [columns.map((col) => col.header)],
      theme: "grid",
      headStyles: {
        fill: [["#1e293b"]],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
    });

    const finalY = (autoTable as any).lastAutoTable?.finalY + 10 || yPos + 10;

    if (options.includeTxHashes && messages.some((m) => m.txHash)) {
      doc.setFontSize(10);
      doc.text(
        `Transaction hashes included: ${messages.filter((m) => m.txHash).length}`,
        14,
        finalY
      );
    }

    return doc.output("blob");
  };

  const exportFile = (): ChatExportResult => {
    if (options.format === "markdown") {
      const content = generateMarkdown();
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const filename = `chat-export-${now.toISOString()}.md`;

      if (!downloadTriggered) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadTriggered(true);
      }

      return { content, blob, filename };
    } else {
      const blob = generatePDF();
      const filename = `chat-export-${now.toISOString()}.pdf`;

      if (!downloadTriggered) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloadTriggered(true);
      }

      return { content: "", blob, filename };
    }
  };

  return { exportFile };
}