import { ipcMain } from "electron";
import type {
  ActivityLogBatchSaveInput,
  ActivityLogDuplicateTemplateRequest,
  ActivityLogItemEntryInput,
  ActivityLogListFilters,
  ActivityLogSaveInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  DashboardFilters,
  PersonCreateInput,
  PersonListFilters,
  PersonTransparencyFilters,
  PersonUpdateInput,
  ScoreConfigVersion,
  ScoreConfigSnapshotCreateInput,
  TeamDashboardFilters,
  TransactionCreateInput,
  TransactionListFilters,
  TransactionUpdateInput
} from "./types";
import type { TrackerService } from "./services/trackerService";
import type { TeamActivityService } from "./services/teamActivityService";

export type BackupRestoreResult = {
  ok: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
};

type TrackerIpcContext = {
  getService: () => TrackerService;
  getTeamActivityService: () => TeamActivityService;
  openWhatsAppShare: (message: string) => Promise<{ ok: true }>;
  copyTextShare: (text: string) => Promise<{ ok: true }>;
  exportBackup: () => Promise<BackupRestoreResult>;
  importBackup: () => Promise<BackupRestoreResult>;
  exportPersonsCsv: (filters: PersonListFilters) => Promise<BackupRestoreResult>;
  importPersonsCsv: () => Promise<
    BackupRestoreResult & {
      inserted?: number;
      updated?: number;
      skipped?: number;
    }
  >;
  exportScoreConfigJson: (versionId: number) => Promise<BackupRestoreResult>;
  importScoreConfigJson: () => Promise<
    BackupRestoreResult & {
      version_id?: number;
      version_name?: string;
    }
  >;
  deactivateScoreConfigVersion: (id: number) => ScoreConfigVersion;
  deleteScoreConfigVersion: (id: number) => void;
  exportAllLogsGroupedCsv: (filters: TeamDashboardFilters) => Promise<BackupRestoreResult>;
  exportPersonLogsExcel: (personId: number, filters: TeamDashboardFilters) => Promise<BackupRestoreResult>;
  exportLeaderboardCsv: (filters: TeamDashboardFilters) => Promise<BackupRestoreResult>;
  exportScoreConfigHistoryCsv: () => Promise<BackupRestoreResult>;
};

export function registerTrackerIpcHandlers(context: TrackerIpcContext): void {
  ipcMain.handle("share:openWhatsApp", (_event, message: string) => {
    return context.openWhatsAppShare(message);
  });

  ipcMain.handle("share:copyText", (_event, text: string) => {
    return context.copyTextShare(text);
  });

  ipcMain.handle("category:create", (_event, input: CategoryCreateInput) => {
    return context.getService().createCategory(input);
  });

  ipcMain.handle("category:list", () => {
    return context.getService().listCategories();
  });

  ipcMain.handle("category:get", (_event, id: number) => {
    return context.getService().getCategory(id);
  });

  ipcMain.handle("category:update", (_event, input: CategoryUpdateInput) => {
    return context.getService().updateCategory(input);
  });

  ipcMain.handle("category:delete", (_event, id: number) => {
    return context.getService().deleteCategory(id);
  });

  ipcMain.handle("transaction:create", (_event, input: TransactionCreateInput) => {
    return context.getService().createTransaction(input);
  });

  ipcMain.handle("transaction:list", (_event, filters: TransactionListFilters = {}) => {
    return context.getService().listTransactions(filters);
  });

  ipcMain.handle("transaction:get", (_event, id: number) => {
    return context.getService().getTransaction(id);
  });

  ipcMain.handle("transaction:update", (_event, input: TransactionUpdateInput) => {
    return context.getService().updateTransaction(input);
  });

  ipcMain.handle("transaction:delete", (_event, id: number) => {
    return context.getService().deleteTransaction(id);
  });

  ipcMain.handle("dashboard:totals", (_event, filters: DashboardFilters = {}) => {
    return context.getService().getDashboardTotals(filters);
  });

  ipcMain.handle("backup:export", async () => {
    return context.exportBackup();
  });

  ipcMain.handle("backup:import", async () => {
    return context.importBackup();
  });

  ipcMain.handle("person:create", (_event, input: PersonCreateInput) => {
    return context.getTeamActivityService().createPerson(input);
  });

  ipcMain.handle("person:list", (_event, filters: PersonListFilters = {}) => {
    return context.getTeamActivityService().listPersons(filters);
  });

  ipcMain.handle("person:get", (_event, id: number) => {
    return context.getTeamActivityService().getPerson(id);
  });

  ipcMain.handle("person:update", (_event, input: PersonUpdateInput) => {
    return context.getTeamActivityService().updatePerson(input);
  });

  ipcMain.handle("person:delete", (_event, id: number) => {
    return context.getTeamActivityService().deletePerson(id);
  });

  ipcMain.handle("person:deactivate", (_event, id: number) => {
    return context.getTeamActivityService().deactivatePerson(id);
  });

  ipcMain.handle("person:reactivate", (_event, id: number) => {
    return context.getTeamActivityService().reactivatePerson(id);
  });

  ipcMain.handle("person:exportCsv", (_event, filters: PersonListFilters = {}) => {
    return context.exportPersonsCsv(filters);
  });

  ipcMain.handle("person:importCsv", async () => {
    return context.importPersonsCsv();
  });

  ipcMain.handle("person:getTransparency", (_event, personId: number, filters: PersonTransparencyFilters = {}) => {
    return context.getTeamActivityService().getPersonTransparency(personId, filters);
  });

  ipcMain.handle("scoreConfig:listVersions", () => {
    return context.getTeamActivityService().listScoreConfigVersions();
  });

  ipcMain.handle("scoreConfig:getSnapshot", (_event, id: number) => {
    return context.getTeamActivityService().getScoreConfigSnapshot(id);
  });

  ipcMain.handle("scoreConfig:createSnapshot", (_event, input: ScoreConfigSnapshotCreateInput) => {
    return context.getTeamActivityService().createScoreConfigSnapshot(input);
  });

  ipcMain.handle("scoreConfig:activate", (_event, id: number) => {
    return context.getTeamActivityService().activateScoreConfigVersion(id);
  });

  ipcMain.handle("scoreConfig:deactivate", (_event, id: number) => {
    return context.deactivateScoreConfigVersion(id);
  });

  ipcMain.handle("scoreConfig:delete", (_event, id: number) => {
    return context.deleteScoreConfigVersion(id);
  });

  ipcMain.handle("scoreConfig:exportJson", (_event, versionId: number) => {
    return context.exportScoreConfigJson(versionId);
  });

  ipcMain.handle("scoreConfig:importJson", async () => {
    return context.importScoreConfigJson();
  });

  ipcMain.handle("teamDashboard:get", (_event, filters: TeamDashboardFilters = {}) => {
    return context.getTeamActivityService().getTeamDashboardReport(filters);
  });

  ipcMain.handle("report:exportAllLogsGroupedCsv", (_event, filters: TeamDashboardFilters = {}) => {
    return context.exportAllLogsGroupedCsv(filters);
  });

  ipcMain.handle("report:exportPersonLogsExcel", (_event, personId: number, filters: TeamDashboardFilters = {}) => {
    return context.exportPersonLogsExcel(personId, filters);
  });

  ipcMain.handle("report:exportLeaderboardCsv", (_event, filters: TeamDashboardFilters = {}) => {
    return context.exportLeaderboardCsv(filters);
  });

  ipcMain.handle("report:exportScoreConfigHistoryCsv", async () => {
    return context.exportScoreConfigHistoryCsv();
  });

  ipcMain.handle("activity:getCatalog", () => {
    return context.getTeamActivityService().getActivityEntryCatalog();
  });

  ipcMain.handle(
    "activity:preview",
    (_event, input: { group_id: number; items: ActivityLogItemEntryInput[] }) => {
      return context.getTeamActivityService().previewActivityScores(input);
    }
  );

  ipcMain.handle("activity:create", (_event, input: ActivityLogSaveInput) => {
    return context.getTeamActivityService().createActivityLogWithItems(input);
  });

  ipcMain.handle("activity:createBatch", (_event, input: ActivityLogBatchSaveInput) => {
    return context.getTeamActivityService().createActivityLogsBatch(input);
  });

  ipcMain.handle("activity:duplicateTemplate", (_event, input: ActivityLogDuplicateTemplateRequest) => {
    return context.getTeamActivityService().getPreviousLogTemplateForPerson(input);
  });

  ipcMain.handle("activity:list", (_event, filters: ActivityLogListFilters = {}) => {
    return context.getTeamActivityService().listActivityLogsForAdmin(filters);
  });

  ipcMain.handle("activity:get", (_event, id: number) => {
    return context.getTeamActivityService().getActivityLogDetail(id);
  });

  ipcMain.handle("activity:update", (_event, input: { id: number } & ActivityLogSaveInput) => {
    return context.getTeamActivityService().updateActivityLogWithItems(input);
  });

  ipcMain.handle("activity:delete", (_event, id: number) => {
    return context.getTeamActivityService().deleteActivityLog(id);
  });

  ipcMain.handle("activity:recalculateAll", () => {
    return context.getTeamActivityService().recalculateAll();
  });

  ipcMain.handle("activity:recalculatePerson", (_event, personId: number) => {
    return context.getTeamActivityService().recalculatePerson(personId);
  });

  ipcMain.handle("activity:recalculateDateRange", (_event, input: { from: string; to: string }) => {
    return context.getTeamActivityService().recalculateDateRange(input.from, input.to);
  });
}
