import { app, BrowserWindow, clipboard, dialog, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { openDatabase, type SqliteDatabase } from "./db/client";
import { registerTrackerIpcHandlers } from "./ipc";
import { createTrackerService, type TrackerService } from "./services/trackerService";
import {
  createTeamActivityService,
  type TeamActivityService
} from "./services/teamActivityService";
import type { PersonListFilters, TeamDashboardFilters } from "./types";

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let db: SqliteDatabase | null = null;
let service: TrackerService | null = null;
let teamActivityService: TeamActivityService | null = null;

// Improves compatibility on some Linux environments where GPU compositing causes a blank window.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("use-gl", "swiftshader");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.maximize();

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const dbPath = path.join(app.getPath("userData"), "tracker.sqlite3");
  const createRuntime = () => {
    db = openDatabase(dbPath);
    service = createTrackerService(db);
    teamActivityService = createTeamActivityService(db);
  };

  createRuntime();

  registerTrackerIpcHandlers({
    openWhatsAppShare: async (message: string) => {
      const text = message.trim();
      if (!text) {
        throw new Error("Message is required");
      }

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      await shell.openExternal(url);
      return { ok: true };
    },
    copyTextShare: async (text: string) => {
      const value = text.trim();
      if (!value) {
        throw new Error("Text is required");
      }

      clipboard.writeText(value);
      return { ok: true };
    },
    getService: () => {
      if (!service) {
        throw new Error("Database service is not ready");
      }

      return service;
    },
    getTeamActivityService: () => {
      if (!teamActivityService) {
        throw new Error("Team activity service is not ready");
      }

      return teamActivityService;
    },
    exportBackup: async () => {
      if (!db) {
        return { ok: false, error: "Database is not initialized" };
      }

      const defaultFileName = `tracker-backup-${new Date().toISOString().slice(0, 10)}.sqlite3`;
      const result = await dialog.showSaveDialog({
        title: "Export database backup",
        defaultPath: path.join(app.getPath("documents"), defaultFileName),
        filters: [{ name: "SQLite Database", extensions: ["sqlite3", "db", "sqlite"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      await db.backup(result.filePath);
      return { ok: true, path: result.filePath };
    },
    importBackup: async () => {
      const result = await dialog.showOpenDialog({
        title: "Import database backup",
        properties: ["openFile"],
        filters: [{ name: "SQLite Database", extensions: ["sqlite3", "db", "sqlite"] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }

      const sourcePath = result.filePaths[0];
      if (path.resolve(sourcePath) === path.resolve(dbPath)) {
        return { ok: false, error: "Selected file is already the active database" };
      }

      try {
        if (db) {
          db.close();
          db = null;
        }

        fs.copyFileSync(sourcePath, dbPath);
        createRuntime();

        return { ok: true, path: sourcePath };
      } catch (error) {
        try {
          if (!db) {
            createRuntime();
          }
        } catch {
          // ignore recovery failure
        }

        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to import backup"
        };
      }
    },
    exportPersonsCsv: async (filters: PersonListFilters) => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const defaultFileName = `persons-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const result = await dialog.showSaveDialog({
        title: "Export persons CSV",
        defaultPath: path.join(app.getPath("documents"), defaultFileName),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const csv = teamActivityService.exportPersonsCsv(filters);
      fs.writeFileSync(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    },
    importPersonsCsv: async () => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showOpenDialog({
        title: "Import persons CSV",
        properties: ["openFile"],
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }

      const sourcePath = result.filePaths[0];

      try {
        const csvText = fs.readFileSync(sourcePath, "utf8");
        const imported = teamActivityService.importPersonsCsv(csvText);
        return {
          ok: true,
          path: sourcePath,
          ...imported
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to import CSV"
        };
      }
    },
    exportScoreConfigJson: async (versionId: number) => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const defaultFileName = `score-config-${versionId}-${new Date().toISOString().slice(0, 10)}.json`;
      const result = await dialog.showSaveDialog({
        title: "Export score config JSON",
        defaultPath: path.join(app.getPath("documents"), defaultFileName),
        filters: [{ name: "JSON", extensions: ["json"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const json = teamActivityService.exportScoreConfigVersionJson(versionId);
      fs.writeFileSync(result.filePath, json, "utf8");
      return { ok: true, path: result.filePath };
    },
    importScoreConfigJson: async () => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showOpenDialog({
        title: "Import score config JSON",
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }

      const sourcePath = result.filePaths[0];

      try {
        const jsonText = fs.readFileSync(sourcePath, "utf8");
        const snapshot = teamActivityService.importScoreConfigVersionJson(jsonText);
        return {
          ok: true,
          path: sourcePath,
          version_id: snapshot.version.id,
          version_name: snapshot.version.name
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to import JSON"
        };
      }
    },
    deactivateScoreConfigVersion: (id: number) => {
      if (!teamActivityService) {
        throw new Error("Team activity service is not initialized");
      }

      return teamActivityService.deactivateScoreConfigVersion(id);
    },
    deleteScoreConfigVersion: (id: number) => {
      if (!teamActivityService) {
        throw new Error("Team activity service is not initialized");
      }

      teamActivityService.deleteScoreConfigVersion(id);
    },
    exportAllLogsGroupedCsv: async (filters: TeamDashboardFilters) => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showSaveDialog({
        title: "Export all logs grouped by person",
        defaultPath: path.join(app.getPath("documents"), `team-logs-grouped-${new Date().toISOString().slice(0, 10)}.csv`),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const csv = teamActivityService.exportAllLogsGroupedByPersonCsv(filters);
      fs.writeFileSync(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    },
    exportPersonLogsCsv: async (personId: number, filters: TeamDashboardFilters) => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showSaveDialog({
        title: "Export person logs CSV",
        defaultPath: path.join(app.getPath("documents"), `person-${personId}-logs-${new Date().toISOString().slice(0, 10)}.csv`),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const csv = teamActivityService.exportPersonLogsCsv(personId, filters);
      fs.writeFileSync(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    },
    exportLeaderboardCsv: async (filters: TeamDashboardFilters) => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showSaveDialog({
        title: "Export leaderboard CSV",
        defaultPath: path.join(app.getPath("documents"), `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const csv = teamActivityService.exportLeaderboardCsv(filters);
      fs.writeFileSync(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    },
    exportScoreConfigHistoryCsv: async () => {
      if (!teamActivityService) {
        return { ok: false, error: "Team activity service is not initialized" };
      }

      const result = await dialog.showSaveDialog({
        title: "Export scoring config and change history CSV",
        defaultPath: path.join(app.getPath("documents"), `score-config-history-${new Date().toISOString().slice(0, 10)}.csv`),
        filters: [{ name: "CSV", extensions: ["csv"] }]
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, cancelled: true };
      }

      const csv = teamActivityService.exportScoreConfigChangeHistoryCsv();
      fs.writeFileSync(result.filePath, csv, "utf8");
      return { ok: true, path: result.filePath };
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (db) {
    db.close();
    db = null;
  }

  service = null;
  teamActivityService = null;
});
