import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { BackupRestorePanel } from "./components/BackupRestorePanel";
import { ActivityLogWorkflow } from "./components/ActivityLogWorkflow";
import { FeedbackNotice } from "./components/FeedbackNotice";
import { PersonsManager } from "./components/PersonsManager";
import { ReportExportCenter } from "./components/ReportExportCenter";
import { ScoreConfigAdmin } from "./components/ScoreConfigAdmin";
import { TeamDashboardReports } from "./components/TeamDashboardReports";
import type { BackupRestoreResult } from "./types";

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.message.includes("FOREIGN KEY constraint failed")) {
      return new Error("Cannot delete category with existing transactions.");
    }

    if (error.message.includes("UNIQUE constraint failed")) {
      return new Error("This name already exists.");
    }

    return error;
  }

  return new Error("An unexpected error occurred.");
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    return window.localStorage.getItem("mtt-theme") === "light" ? "light" : "dark";
  });

  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const initializeApp = useCallback(async () => {
    setGlobalError(null);
  }, []);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("mtt-theme", theme);
  }, [theme]);

  const topNavItems = [
    { to: "/settings", label: "Settings" },
    { to: "/persons", label: "Persons" },
    { to: "/activity-log", label: "Activity Log" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/exports", label: "Exports" }
  ];

  return (
    <main className="app-shell">
      <div className="container-fluid app-container">
        <header className="app-header mb-3">
          <div className="header-row">
            <h1>Team Activity Tracker</h1>
            <button
              type="button"
              className="theme-toggle-switch"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            >
              <span className={`theme-icon ${theme === "dark" ? "active" : ""}`} aria-hidden="true">
                🌙
              </span>
              <span className={`theme-icon ${theme === "light" ? "active" : ""}`} aria-hidden="true">
                ☀️
              </span>
            </button>
          </div>
        </header>

        <nav className="top-nav mb-3" aria-label="Primary">
          {topNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-chip ${isActive ? "active" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <FeedbackNotice message={globalError} variant="error" />

        <Routes>
          <Route path="/" element={<Navigate to="/settings" replace />} />

          <Route
            path="/persons"
            element={
              <PersonsManager normalizeError={normalizeError} />
            }
          />

          <Route
            path="/settings"
            element={
              <div className="stack-layout settings-layout">
                <ScoreConfigAdmin normalizeError={normalizeError} />
              </div>
            }
          />

          <Route path="/activity-log" element={<ActivityLogWorkflow normalizeError={normalizeError} />} />

          <Route
            path="/dashboard"
            element={
              <div className="stack-layout dashboard-layout">
                <TeamDashboardReports normalizeError={normalizeError} />
              </div>
            }
          />

          <Route
            path="/exports"
            element={
              <div className="stack-layout exports-layout">
                <ReportExportCenter normalizeError={normalizeError} />

                <div className="grid-layout">
                  <BackupRestorePanel
                    isBusy={isBackupBusy}
                    onExport={async (): Promise<BackupRestoreResult> => {
                      setIsBackupBusy(true);
                      try {
                        return await window.desktop.backup.exportDb();
                      } finally {
                        setIsBackupBusy(false);
                      }
                    }}
                    onImport={async (): Promise<BackupRestoreResult> => {
                      setIsBackupBusy(true);
                      try {
                        const result = await window.desktop.backup.importDb();
                        if (result.ok) {
                          await initializeApp();
                        }

                        return result;
                      } finally {
                        setIsBackupBusy(false);
                      }
                    }}
                  />
                </div>
              </div>
            }
          />

          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </div>
    </main>
  );
}
