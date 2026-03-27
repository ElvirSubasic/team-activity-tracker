import { useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type { DashboardFilters, DashboardTotals } from "../types";

type DashboardTotalsProps = {
  totals: DashboardTotals;
  isLoading: boolean;
  onLoad: (filters: DashboardFilters) => Promise<void>;
};

function toDateFilterStart(date: string): string | undefined {
  return date ? `${date} 00:00:00` : undefined;
}

function toDateFilterEnd(date: string): string | undefined {
  return date ? `${date} 23:59:59` : undefined;
}

export function DashboardTotalsPanel({ totals, isLoading, onLoad }: DashboardTotalsProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const globalTotals = Array.from(
    totals.byMonth.reduce((acc, row) => {
      const current = acc.get(row.currency) ?? 0;
      acc.set(row.currency, current + row.total);
      return acc;
    }, new Map<string, number>())
  ).sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB));

  const handleLoad = async () => {
    setError(null);
    try {
      await onLoad({
        start_date: toDateFilterStart(startDate),
        end_date: toDateFilterEnd(endDate)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard totals");
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Dashboard Totals</h2>
      </div>

      <div className="form-row">
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        <button type="button" className="ghost" onClick={handleLoad}>
          Refresh Totals
        </button>
      </div>

      {isLoading ? <p className="hint">Loading dashboard...</p> : null}
      <FeedbackNotice message={error} variant="error" />

      <h3>Global Total</h3>
      {globalTotals.length > 0 ? (
        <div className="stats-grid dashboard-total-grid">
          {globalTotals.map(([currency, total]) => (
            <article className="stat-card" key={currency}>
              <p className="hint">{currency}</p>
              <strong>{total.toFixed(2)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="hint">No totals available.</p>
      )}

      <h3>By Month</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Currency</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.byMonth.map((row) => (
              <tr key={`${row.month}-${row.currency}`}>
                <td>{row.month}</td>
                <td>{row.currency}</td>
                <td>{row.total.toFixed(2)}</td>
              </tr>
            ))}
            {totals.byMonth.length === 0 ? (
              <tr>
                <td colSpan={3} className="hint center">
                  No totals available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h3>By Category</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Currency</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.byCategory.map((row) => (
              <tr key={`${row.category_id}-${row.currency}`}>
                <td>{row.category_name}</td>
                <td>{row.currency}</td>
                <td>{row.total.toFixed(2)}</td>
              </tr>
            ))}
            {totals.byCategory.length === 0 ? (
              <tr>
                <td colSpan={3} className="hint center">
                  No totals available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
