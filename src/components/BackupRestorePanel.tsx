import { useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type { BackupRestoreResult } from "../types";

type BackupRestorePanelProps = {
  isBusy: boolean;
  onExport: () => Promise<BackupRestoreResult>;
  onImport: () => Promise<BackupRestoreResult>;
};

export function BackupRestorePanel({ isBusy, onExport, onImport }: BackupRestorePanelProps) {
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setMessage(null);
    const result = await onExport();

    if (result.cancelled) {
      setMessage("Backup export cancelled.");
      return;
    }

    if (!result.ok) {
      setMessage(result.error ?? "Failed to export backup.");
      return;
    }

    setMessage(`Backup exported to: ${result.path}`);
  };

  const handleImport = async () => {
    setMessage(null);
    const result = await onImport();

    if (result.cancelled) {
      setMessage("Backup restore cancelled.");
      return;
    }

    if (!result.ok) {
      setMessage(result.error ?? "Failed to restore backup.");
      return;
    }

    setMessage(`Backup restored from: ${result.path}`);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Backup & Restore</h2>
      </div>

      <div className="form-row">
        <button type="button" onClick={handleExport} disabled={isBusy}>
          Export Backup
        </button>
        <button type="button" className="ghost" onClick={handleImport} disabled={isBusy}>
          Import / Restore Backup
        </button>
      </div>

      <p className="hint">
        Restore replaces your current local database file. Use this only with trusted backup files.
      </p>

      <FeedbackNotice message={message} variant="info" />
    </section>
  );
}
