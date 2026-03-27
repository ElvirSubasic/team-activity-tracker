import { useCallback, useEffect, useState } from "react";
import type { BackupRestoreResult, Person, TeamDashboardFilters } from "../types";
import { FeedbackNotice } from "./FeedbackNotice";

type Props = {
  normalizeError: (error: unknown) => Error;
};

export function ReportExportCenter({ normalizeError }: Props) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [filters, setFilters] = useState<TeamDashboardFilters>({ inactive_days: 30 });
  const [selectedPersonId, setSelectedPersonId] = useState<number>(0);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadPersons = useCallback(async () => {
    const allPersons: Person[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await window.desktop.person.list({ page, pageSize: 100 });
      allPersons.push(...response.items);
      hasMore = page < response.totalPages;
      page += 1;
    }

    setPersons(allPersons);
    if (allPersons.length > 0 && selectedPersonId === 0) {
      setSelectedPersonId(allPersons[0].id);
    }
  }, [selectedPersonId]);

  useEffect(() => {
    void loadPersons();
  }, [loadPersons]);

  const runExport = async (runner: () => Promise<BackupRestoreResult>, label: string) => {
    setError(null);
    setStatus(null);
    setIsBusy(true);
    try {
      const result = await runner();
      if (result.ok) {
        setStatus(`${label} exported to ${result.path}`);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Exports & Generated Reports</h2>
          <p className="hint">Generate CSV and Excel reports with structured filters and grouped actions.</p>
        </div>
      </div>

      <FeedbackNotice message={error} variant="error" />
      <FeedbackNotice message={status} variant="success" />

      <div className="form-section">
        <h3 className="section-title">Export Filters</h3>
        <div className="grid-form">
          <label>
            Start Date
            <input
              type="date"
              value={filters.start_date ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, start_date: event.target.value || undefined }))}
            />
          </label>
          <label>
            End Date
            <input
              type="date"
              value={filters.end_date ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, end_date: event.target.value || undefined }))}
            />
          </label>
          <label>
            <span className="label-with-info">
              Inactive Threshold (days)
              <span className="info-badge" tabIndex={0} aria-label="What is inactive threshold days?">
                i
                <span className="info-popup" role="tooltip">
                  Used by dashboard and leaderboard reports to flag members with no recent activity.
                </span>
              </span>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={filters.inactive_days ?? 30}
              onChange={(event) => setFilters((prev) => ({ ...prev, inactive_days: Number(event.target.value) || 0 }))}
            />
          </label>
        </div>
      </div>

      <div className="form-section">
        <h3 className="section-title">Team Exports</h3>
        <div className="form-row">
          <button
            className="ghost"
            onClick={() => void runExport(() => window.desktop.report.exportAllLogsGroupedCsv(filters), "All logs grouped")}
            disabled={isBusy}
          >
            Export all logs CSV
          </button>
          <button
            className="ghost"
            onClick={() => void runExport(() => window.desktop.report.exportLeaderboardCsv(filters), "Leaderboard")}
            disabled={isBusy}
          >
            Export leaderboard CSV
          </button>
          <button
            className="ghost"
            onClick={() => void runExport(() => window.desktop.report.exportScoreConfigHistoryCsv(), "Score config history")}
            disabled={isBusy}
          >
            Export score config + history CSV
          </button>
        </div>
      </div>

      {persons.length > 0 ? (
        <div className="form-section">
          <h3 className="section-title">Per-Person Report</h3>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runExport(() => window.desktop.report.exportPersonLogsExcel(selectedPersonId, filters), "Per-person Excel report");
            }}
          >
            <label>
              Select Person
              <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(Number(event.target.value))}>
                {persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.index_num} · {person.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost" type="submit" disabled={isBusy || !selectedPersonId}>
              Export selected person report Excel
            </button>
          </form>
        </div>
      ) : (
        <p className="hint">Create persons first to enable per-person reports.</p>
      )}
    </section>
  );
}
