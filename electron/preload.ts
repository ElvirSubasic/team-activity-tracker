import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersions: async () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }),
  category: {
    create: (input: { name: string }) => ipcRenderer.invoke("category:create", input),
    list: () => ipcRenderer.invoke("category:list"),
    get: (id: number) => ipcRenderer.invoke("category:get", id),
    update: (input: { id: number; name: string }) => ipcRenderer.invoke("category:update", input),
    delete: (id: number) => ipcRenderer.invoke("category:delete", id)
  },
  transaction: {
    create: (input: {
      category_id: number;
      title: string;
      amount: number;
      currency: string;
      note?: string | null;
      created_at?: string;
    }) => ipcRenderer.invoke("transaction:create", input),
    list: (filters?: {
      text?: string;
      category_id?: number;
      start_date?: string;
      end_date?: string;
    }) => ipcRenderer.invoke("transaction:list", filters),
    get: (id: number) => ipcRenderer.invoke("transaction:get", id),
    update: (input: {
      id: number;
      category_id: number;
      title: string;
      amount: number;
      currency: string;
      note?: string | null;
      created_at?: string;
    }) => ipcRenderer.invoke("transaction:update", input),
    delete: (id: number) => ipcRenderer.invoke("transaction:delete", id)
  },
  dashboard: {
    totals: (filters?: { start_date?: string; end_date?: string }) =>
      ipcRenderer.invoke("dashboard:totals", filters)
  },
  teamDashboard: {
    get: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) =>
      ipcRenderer.invoke("teamDashboard:get", filters)
  },
  share: {
    openWhatsApp: (message: string) => ipcRenderer.invoke("share:openWhatsApp", message),
    copyText: (text: string) => ipcRenderer.invoke("share:copyText", text)
  },
  backup: {
    exportDb: () => ipcRenderer.invoke("backup:export"),
    importDb: () => ipcRenderer.invoke("backup:import")
  },
  person: {
    create: (input: {
      index_num: string;
      name: string;
      role: string;
      phone_number?: string | null;
      is_active?: boolean;
    }) => ipcRenderer.invoke("person:create", input),
    list: (filters?: {
      text?: string;
      is_active?: boolean;
      page?: number;
      pageSize?: number;
    }) => ipcRenderer.invoke("person:list", filters),
    get: (id: number) => ipcRenderer.invoke("person:get", id),
    update: (input: {
      id: number;
      name?: string;
      role?: string;
      phone_number?: string | null;
      is_active?: boolean;
    }) => ipcRenderer.invoke("person:update", input),
    delete: (id: number) => ipcRenderer.invoke("person:delete", id),
    deactivate: (id: number) => ipcRenderer.invoke("person:deactivate", id),
    reactivate: (id: number) => ipcRenderer.invoke("person:reactivate", id),
    exportCsv: (filters?: {
      text?: string;
      is_active?: boolean;
      page?: number;
      pageSize?: number;
    }) => ipcRenderer.invoke("person:exportCsv", filters),
    importCsv: () => ipcRenderer.invoke("person:importCsv"),
    getTransparency: (personId: number, filters?: {
      start_date?: string;
      end_date?: string;
      group_id?: number;
      activity_type_id?: number;
      sort_by?: "activity_date" | "total_points" | "created_at";
      sort_dir?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    }) => ipcRenderer.invoke("person:getTransparency", personId, filters)
  },
  scoreConfig: {
    listVersions: () => ipcRenderer.invoke("scoreConfig:listVersions"),
    getSnapshot: (id: number) => ipcRenderer.invoke("scoreConfig:getSnapshot", id),
    createSnapshot: (input: {
      source_version_id?: number | null;
      name: string;
      notes?: string | null;
      activate?: boolean;
      apply_to_historical_logs?: boolean;
      groups: Array<{
        code: string;
        name: string;
        base_xp: number;
        sort_order?: number;
        is_active?: boolean;
        activity_types: Array<{
          code: string;
          name: string;
          percent_of_group_base?: number;
          parent_activity_type_code?: string | null;
          percent_of_parent_type?: number;
          fixed_points?: number | null;
          is_active?: boolean;
          sort_order?: number;
        }>;
      }>;
    }) => ipcRenderer.invoke("scoreConfig:createSnapshot", input),
    activate: (id: number) => ipcRenderer.invoke("scoreConfig:activate", id),
    deactivate: (id: number) => ipcRenderer.invoke("scoreConfig:deactivate", id),
    delete: (id: number) => ipcRenderer.invoke("scoreConfig:delete", id),
    exportJson: (versionId: number) => ipcRenderer.invoke("scoreConfig:exportJson", versionId),
    importJson: () => ipcRenderer.invoke("scoreConfig:importJson")
  },
  activity: {
    getCatalog: () => ipcRenderer.invoke("activity:getCatalog"),
    preview: (input: {
      group_id: number;
      items: Array<{
        activity_type_id: number;
        quantity?: number;
        notes?: string | null;
      }>;
    }) => ipcRenderer.invoke("activity:preview", input),
    create: (input: {
      person_id: number;
      activity_date: string;
      group_id: number;
      notes?: string | null;
      items: Array<{
        activity_type_id: number;
        quantity?: number;
        notes?: string | null;
      }>;
    }) => ipcRenderer.invoke("activity:create", input),
    createBatch: (input: {
      person_ids: number[];
      activity_date: string;
      group_id: number;
      notes?: string | null;
      items: Array<{
        activity_type_id: number;
        quantity?: number;
        notes?: string | null;
      }>;
    }) => ipcRenderer.invoke("activity:createBatch", input),
    duplicateTemplate: (input: { person_id: number; activity_date?: string }) =>
      ipcRenderer.invoke("activity:duplicateTemplate", input),
    list: (filters?: {
      person_id?: number;
      group_id?: number;
      activity_type_id?: number;
      start_date?: string;
      end_date?: string;
      sort_by?: "activity_date" | "total_points" | "created_at";
      sort_dir?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    }) => ipcRenderer.invoke("activity:list", filters),
    get: (id: number) => ipcRenderer.invoke("activity:get", id),
    update: (input: {
      id: number;
      person_id: number;
      activity_date: string;
      group_id: number;
      notes?: string | null;
      items: Array<{
        activity_type_id: number;
        quantity?: number;
        notes?: string | null;
      }>;
    }) => ipcRenderer.invoke("activity:update", input),
    delete: (id: number) => ipcRenderer.invoke("activity:delete", id),
    recalculateAll: () => ipcRenderer.invoke("activity:recalculateAll"),
    recalculatePerson: (personId: number) => ipcRenderer.invoke("activity:recalculatePerson", personId),
    recalculateDateRange: (input: { from: string; to: string }) =>
      ipcRenderer.invoke("activity:recalculateDateRange", input)
  },
  report: {
    exportAllLogsGroupedCsv: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) =>
      ipcRenderer.invoke("report:exportAllLogsGroupedCsv", filters),
    exportPersonLogsCsv: (
      personId: number,
      filters?: { start_date?: string; end_date?: string; inactive_days?: number }
    ) => ipcRenderer.invoke("report:exportPersonLogsCsv", personId, filters),
    exportLeaderboardCsv: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) =>
      ipcRenderer.invoke("report:exportLeaderboardCsv", filters),
    exportScoreConfigHistoryCsv: () => ipcRenderer.invoke("report:exportScoreConfigHistoryCsv")
  }
});
