"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { useOrders } from "../../../hooks/useOrders";
import { formatXlm } from "../../../lib/orders";
import { downloadBlob } from "../../../lib/download";
import { downloadCsv } from "../../../lib/csv";
import {
  availableCategories,
  availableMerchants,
  buildExpenseReport,
  expenseReportFilename,
  expenseReportToCsv,
  expenseReportToJson,
  type ExpenseReportFilter,
} from "../../../lib/expenseReport";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

/**
 * Custom expense report builder for corporate buyers (#793). Filters the
 * loaded orders by date range, category, and merchant, previews the matching
 * rows, and downloads the result as a client-side generated CSV or JSON file.
 */
export default function ExpenseReportPage() {
  const { orders, loading } = useOrders();
  const [startDate, setStartDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - 29 * DAY_MS))
  );
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [downloaded, setDownloaded] = useState(false);

  const categories = useMemo(() => availableCategories(orders), [orders]);
  const merchants = useMemo(() => availableMerchants(orders), [orders]);

  const filter = useMemo<ExpenseReportFilter>(
    () => ({
      startDate: new Date(`${startDate}T00:00:00`),
      endDate: new Date(`${endDate}T23:59:59.999`),
      categories: selectedCategories,
      merchants: selectedMerchants,
      format,
    }),
    [startDate, endDate, selectedCategories, selectedMerchants, format]
  );

  const report = useMemo(
    () => buildExpenseReport(orders, filter),
    [orders, filter]
  );

  function handleDownload() {
    const filename = expenseReportFilename(report, format);
    if (format === "json") {
      downloadBlob(
        filename,
        new Blob([expenseReportToJson(report)], { type: "application/json" })
      );
    } else {
      downloadCsv(filename, expenseReportToCsv(report));
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }

  if (loading) {
    return <div className="settings-page">Loading…</div>;
  }

  return (
    <div className="settings-page expense-report-page">
      <header className="header no-print">
        <h1>Expense report</h1>
        <p>
          Build a custom report for a date range, categories, and merchants —
          then download it as CSV or JSON.
        </p>
      </header>

      <div className="report-controls no-print">
        <div className="expense-report-field">
          <label htmlFor="report-start-date">From</label>
          <input
            id="report-start-date"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="expense-report-field">
          <label htmlFor="report-end-date">To</label>
          <input
            id="report-end-date"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
        <div className="expense-report-field">
          <label htmlFor="report-format">Format</label>
          <select
            id="report-format"
            value={format}
            onChange={(event) =>
              setFormat(event.target.value === "json" ? "json" : "csv")
            }
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <Button variant="primary" type="button" onClick={handleDownload}>
          {`Download ${format.toUpperCase()}`}
        </Button>
        <span role="status" aria-live="polite" className="sr-only">
          {downloaded ? "Report downloaded." : ""}
        </span>
      </div>

      <div className="expense-report-filters no-print">
        <Card title="Categories">
          {categories.length === 0 ? (
            <p className="stat-label">No categories yet.</p>
          ) : (
            <ul className="expense-report-checkboxes">
              {categories.map((category) => (
                <li key={category}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() =>
                        setSelectedCategories((prev) =>
                          toggleValue(prev, category)
                        )
                      }
                    />
                    {category}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Merchants">
          {merchants.length === 0 ? (
            <p className="stat-label">No merchants yet.</p>
          ) : (
            <ul className="expense-report-checkboxes">
              {merchants.map((merchant) => (
                <li key={merchant}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMerchants.includes(merchant)}
                      onChange={() =>
                        setSelectedMerchants((prev) =>
                          toggleValue(prev, merchant)
                        )
                      }
                    />
                    {merchant}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Preview (${report.orderCount} orders)`}>
        {report.rows.length === 0 ? (
          <p className="stat-label">No orders match these filters.</p>
        ) : (
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Date</th>
                <th scope="col">Merchant</th>
                <th scope="col">Category</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.orderId}>
                  <td>{row.orderId}</td>
                  <td>{new Date(row.date).toLocaleDateString()}</td>
                  <td>{row.merchantId}</td>
                  <td>{row.category}</td>
                  <td>{formatXlm(BigInt(row.amountStroops))} XLM</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="expense-report-total">
          Total: {formatXlm(report.totalStroops)} XLM
        </p>
      </Card>
    </div>
  );
}
