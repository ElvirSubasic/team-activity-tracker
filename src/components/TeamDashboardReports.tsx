import { useCallback, useEffect, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type { BackupRestoreResult, Person, TeamDashboardFilters, TeamDashboardReport } from "../types";
import { buildLeaderboardShareMessage } from "../utils/shareMessages";

type Props = {
  normalizeError: (error: unknown) => Error;
};

const emptyReport: TeamDashboardReport = {
  team_total_points: 0,
  total_logs: 0,
  leaderboard: [],
  contribution_distribution: [],
  weekly_activity_volume: [],
  inactive_members: []
};

const contributionChartColors = [
  "#4d8ef0",
  "#7aa9f7",
  "#52b788",
  "#74c69d",
  "#d19a53",
  "#f4b183",
  "#c77dff",
  "#f28482"
];

export function TeamDashboardReports({ normalizeError }: Props) {
  const [report, setReport] = useState<TeamDashboardReport>(emptyReport);
  const [persons, setPersons] = useState<Person[]>([]);
  const [filters, setFilters] = useState<TeamDashboardFilters>({ inactive_days: 30 });
  const [selectedPersonId, setSelectedPersonId] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
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

  const loadReport = useCallback(async (nextFilters: TeamDashboardFilters = filters) => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await window.desktop.teamDashboard.get(nextFilters);
      setReport(next);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [filters, normalizeError]);

  useEffect(() => {
    void Promise.all([loadPersons(), loadReport()]);
  }, [loadPersons, loadReport]);

  const refresh = async () => {
    await loadReport(filters);
  };

  const buildLeaderboardMessage = (): string => {
    return buildLeaderboardShareMessage(report.leaderboard);
  };

  const handleExport = async (runner: () => Promise<BackupRestoreResult>, successLabel: string) => {
    setError(null);
    setStatus(null);
    try {
      const result = await runner();
      if (result.ok) {
        setStatus(`${successLabel} exported to ${result.path}`);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const shareLeaderboardToWhatsApp = async () => {
    setError(null);
    setStatus(null);
    try {
      await window.desktop.share.openWhatsApp(buildLeaderboardMessage());
      setStatus("Opened WhatsApp share for leaderboard.");
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const copyLeaderboardMessage = async () => {
    setError(null);
    setStatus(null);
    try {
      await window.desktop.share.copyText(buildLeaderboardMessage());
      setStatus("Leaderboard message copied to clipboard.");
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const maxLeaderboardPoints = Math.max(1, ...report.leaderboard.map((row) => row.total_points));
  const maxWeeklyPoints = Math.max(1, ...report.weekly_activity_volume.map((row) => row.total_points));
  const contributionTotalPoints = report.contribution_distribution.reduce(
    (sum, row) => sum + row.total_points,
    0
  );
  const contributionSegments = report.contribution_distribution.map((row, index) => ({
    ...row,
    color: contributionChartColors[index % contributionChartColors.length],
    chart_percent: contributionTotalPoints > 0 ? (row.total_points / contributionTotalPoints) * 100 : 0
  }));
  const contributionPie = contributionSegments.length
    ? `conic-gradient(${contributionSegments
        .map((row, index) => {
          const start = contributionSegments
            .slice(0, index)
            .reduce((sum, entry) => sum + entry.chart_percent, 0);
          const end =
            index === contributionSegments.length - 1 ? 100 : Math.min(100, start + row.chart_percent);
          return `${row.color} ${start}% ${end}%`;
        })
        .join(", ")})`
    : undefined;

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Team Dashboards</h2>
            <p className="hint">Track team performance, activity trends, and inactive members in one place.</p>
          </div>
        </div>

        <FeedbackNotice message={error} variant="error" />
        <FeedbackNotice message={status} variant="success" />

        <div className="form-section">
          <h3 className="section-title">Dashboard Filters</h3>
          <form
            className="grid-form"
            onSubmit={(event) => {
              event.preventDefault();
              void refresh();
            }}
          >
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
                    A member is marked inactive when no activity was logged in the last N days.
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
            <div className="form-actions-row">
              <button className="ghost" type="submit" disabled={isLoading}>
                Refresh Team Dashboard
              </button>
            </div>
          </form>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <p className="hint">Team Total Points</p>
            <strong>{report.team_total_points}</strong>
          </div>
          <div className="stat-card">
            <p className="hint">Total Logs</p>
            <strong>{report.total_logs}</strong>
          </div>
          <div className="stat-card">
            <p className="hint">Inactive Members</p>
            <strong>{report.inactive_members.length}</strong>
          </div>
        </div>

        <h3>Leaderboard</h3>
        <div className="chart-card">
          {report.leaderboard.length === 0 ? (
            <p className="hint">No leaderboard data to chart.</p>
          ) : (
            <div className="bar-chart-list">
              {report.leaderboard.map((row) => {
                const widthPercent = (row.total_points / maxLeaderboardPoints) * 100;
                return (
                  <div className="bar-chart-row" key={`leader-${row.person_id}`}>
                    <div className="bar-chart-header">
                      <span>{row.name}</span>
                      <strong>{row.total_points}</strong>
                    </div>
                    <div className="bar-chart-track" aria-hidden="true">
                      <div className="bar-chart-fill" style={{ width: `${Math.max(widthPercent, 2)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Logs</th>
                <th>Total Points</th>
                <th>Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {report.leaderboard.map((row) => (
                <tr key={row.person_id}>
                  <td>
                    {row.index_num} · {row.name}
                  </td>
                  <td>{row.log_count}</td>
                  <td>{row.total_points}</td>
                  <td>{row.last_activity_date ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Contribution Distribution</h3>
        <div className="chart-card">
          {report.contribution_distribution.length === 0 ? (
            <p className="hint">No contribution data to chart.</p>
          ) : (
            <div className="pie-chart-layout">
              <div className="pie-chart" style={{ background: contributionPie }} aria-hidden="true" />
              <div className="pie-chart-legend">
                {contributionSegments.map((row) => (
                  <div className="pie-chart-legend-item" key={`contrib-${row.person_id}`}>
                    <span className="pie-chart-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
                    <span>{row.name}</span>
                    <strong>{row.contribution_percent.toFixed(2)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Total Points</th>
                <th>Contribution %</th>
              </tr>
            </thead>
            <tbody>
              {report.contribution_distribution.map((row) => (
                <tr key={row.person_id}>
                  <td>
                    {row.index_num} · {row.name}
                  </td>
                  <td>{row.total_points}</td>
                  <td>{row.contribution_percent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Weekly Activity Volume</h3>
        <div className="chart-card">
          {report.weekly_activity_volume.length === 0 ? (
            <p className="hint">No weekly data to chart.</p>
          ) : (
            <div className="bar-chart-list">
              {report.weekly_activity_volume.map((row) => {
                const widthPercent = (row.total_points / maxWeeklyPoints) * 100;
                return (
                  <div className="bar-chart-row" key={`week-${row.week_label}`}>
                    <div className="bar-chart-header">
                      <span>{row.week_label}</span>
                      <strong>{row.total_points} points</strong>
                    </div>
                    <div className="bar-chart-track" aria-hidden="true">
                      <div className="bar-chart-fill soft" style={{ width: `${Math.max(widthPercent, 2)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Logs</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {report.weekly_activity_volume.map((row) => (
                <tr key={row.week_label}>
                  <td>{row.week_label}</td>
                  <td>{row.log_count}</td>
                  <td>{row.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Inactive Members</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Last Activity</th>
                <th>Days Since Activity</th>
              </tr>
            </thead>
            <tbody>
              {report.inactive_members.map((row) => (
                <tr key={row.person_id}>
                  <td>
                    {row.index_num} · {row.name}
                  </td>
                  <td>{row.role}</td>
                  <td>{row.last_activity_date ?? "Never"}</td>
                  <td>{row.days_since_last_activity ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Reports</h2>
            <p className="hint">Share leaderboard summaries and generate person-level report exports.</p>
          </div>
        </div>

        <FeedbackNotice message={error} variant="error" />
        <FeedbackNotice message={status} variant="success" />

        {report.leaderboard.length > 0 ? (
          <div className="form-section">
            <h3 className="section-title">Leaderboard Sharing</h3>
            <div className="form-row">
              <button className="ghost" onClick={() => void shareLeaderboardToWhatsApp()} disabled={isLoading}>
                Share leaderboard to WhatsApp
              </button>
              <button className="ghost" onClick={() => void copyLeaderboardMessage()} disabled={isLoading}>
                Copy message to clipboard
              </button>
            </div>
          </div>
        ) : (
          <p className="hint">Generate dashboard data first to enable leaderboard sharing.</p>
        )}

        {persons.length > 0 ? (
          <div className="form-section export-person-section">
            <h3 className="section-title">Per-Person Report</h3>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleExport(
                  () => window.desktop.report.exportPersonLogsExcel(selectedPersonId, filters),
                  "Per-person Excel report"
                );
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
              <button className="ghost" type="submit" disabled={isLoading || !selectedPersonId}>
                Export selected person report Excel
              </button>
            </form>
          </div>
        ) : (
          <p className="hint">Create persons first to enable per-person reports.</p>
        )}
      </section>
    </>
  );
}
