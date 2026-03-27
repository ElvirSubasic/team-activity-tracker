export {};

type Category = {
  id: number;
  name: string;
  created_at: string;
};

type Transaction = {
  id: number;
  category_id: number;
  title: string;
  amount: number;
  currency: string;
  note: string | null;
  created_at: string;
};

type DashboardTotals = {
  byMonth: Array<{
    month: string;
    currency: string;
    total: number;
  }>;
  byCategory: Array<{
    category_id: number;
    category_name: string;
    currency: string;
    total: number;
  }>;
};

type BackupRestoreResult = {
  ok: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
};

type Person = {
  id: number;
  index_num: string;
  name: string;
  role: string;
  phone_number: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type PersonFilters = {
  text?: string;
  is_active?: boolean;
  page?: number;
  pageSize?: number;
};

type PaginatedPersons = {
  items: Person[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type PersonCsvImportResult = BackupRestoreResult & {
  inserted?: number;
  updated?: number;
  skipped?: number;
};

type ScoreConfigVersion = {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  activated_at: string | null;
  notes: string | null;
};

type ScoreConfigActivityType = {
  id: number;
  group_id: number;
  code: string;
  name: string;
  percent_of_group_base: number;
  parent_activity_type_id: number | null;
  percent_of_parent_type: number | null;
  fixed_points: number | null;
  is_active: number;
  sort_order: number;
};

type ScoreConfigGroup = {
  id: number;
  config_version_id: number;
  code: string;
  name: string;
  base_xp: number;
  sort_order: number;
  is_active: number;
  activity_types: ScoreConfigActivityType[];
};

type ScoreConfigSnapshot = {
  version: ScoreConfigVersion;
  groups: ScoreConfigGroup[];
};

type ScoreConfigSnapshotCreateInput = {
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
};

type ScoreConfigJsonImportResult = BackupRestoreResult & {
  version_id?: number;
  version_name?: string;
};

type ActivityLogItemEntryInput = {
  activity_type_id: number;
  quantity?: number;
  notes?: string | null;
};

type ActivityLogSaveInput = {
  person_id: number;
  activity_date: string;
  group_id: number;
  notes?: string | null;
  items: ActivityLogItemEntryInput[];
};

type ActivityLogBatchSaveInput = {
  person_ids: number[];
  activity_date: string;
  group_id: number;
  notes?: string | null;
  items: ActivityLogItemEntryInput[];
};

type ActivityLogBatchSaveResult = {
  created: number;
  log_ids: number[];
};

type ActivityScorePreview = {
  group_id: number;
  config_version_id: number;
  total_points: number;
  items: Array<{
    activity_type_id: number;
    quantity: number;
    points_per_unit: number;
    total_points: number;
  }>;
};

type ActivityEntryCatalog = {
  config_version_id: number;
  config_version_name: string;
  groups: ScoreConfigGroup[];
};

type ActivityLogListFilters = {
  person_id?: number;
  group_id?: number;
  activity_type_id?: number;
  start_date?: string;
  end_date?: string;
  sort_by?: "activity_date" | "total_points" | "created_at";
  sort_dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

type ActivityLogListItem = {
  id: number;
  person_id: number;
  person_name: string;
  activity_date: string;
  group_id: number;
  group_name: string;
  activity_types_summary: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_points: number;
};

type ActivityLogDetail = {
  log: {
    id: number;
    person_id: number;
    activity_date: string;
    group_id: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    id: number;
    activity_log_id: number;
    activity_type_id: number;
    quantity: number;
    notes: string | null;
    created_at: string;
    activity_type_code: string;
    activity_type_name: string;
    parent_activity_type_name: string | null;
    points_per_unit: number;
    total_points: number;
    config_version_id: number;
    group_code: string;
    group_name: string;
    group_base_xp: number;
    type_percent_of_group_base: number;
    type_percent_of_parent_type: number | null;
    parent_percent_of_group_base: number | null;
    parent_fixed_points: number | null;
    type_fixed_points: number | null;
    formula: string;
  }>;
  total_points: number;
};

type PaginatedActivityLogs = {
  items: ActivityLogListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type RecalculationRunResult = {
  scope: "all" | "person" | "date_range";
  config_version_id: number;
  updated_items: number;
  affected_logs: number;
  filters?: {
    person_id?: number;
    from?: string;
    to?: string;
  };
};

type TeamDashboardReport = {
  team_total_points: number;
  total_logs: number;
  leaderboard: Array<{
    person_id: number;
    index_num: string;
    name: string;
    role: string;
    total_points: number;
    log_count: number;
    participation_percent: number;
    last_activity_date: string | null;
  }>;
  contribution_distribution: Array<{
    person_id: number;
    index_num: string;
    name: string;
    total_points: number;
    contribution_percent: number;
  }>;
  weekly_activity_volume: Array<{
    week_label: string;
    log_count: number;
    total_points: number;
  }>;
  inactive_members: Array<{
    person_id: number;
    index_num: string;
    name: string;
    role: string;
    last_activity_date: string | null;
    days_since_last_activity: number | null;
  }>;
};

type PersonTransparencyFilters = {
  start_date?: string;
  end_date?: string;
  group_id?: number;
  activity_type_id?: number;
  sort_by?: "activity_date" | "total_points" | "created_at";
  sort_dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

type PersonTransparencyData = {
  person_id: number;
  summary: {
    total_points: number;
    participation_percent: number;
    log_count: number;
    last_activity_date: string | null;
  };
  breakdown_by_group: Array<{
    group_id: number;
    group_code: string;
    group_name: string;
    log_count: number;
    total_points: number;
  }>;
  breakdown_by_type: Array<{
    activity_type_id: number;
    activity_type_code: string;
    activity_type_name: string;
    group_code: string;
    group_name: string;
    log_count: number;
    total_points: number;
  }>;
  trend_by_date: Array<{
    activity_date: string;
    log_count: number;
    total_points: number;
  }>;
  logs: PaginatedActivityLogs;
};

declare global {
  interface Window {
    desktop: {
      getVersions: () => Promise<{
        electron: string;
        chrome: string;
        node: string;
      }>;
      category: {
        create: (input: { name: string }) => Promise<Category>;
        list: () => Promise<Category[]>;
        get: (id: number) => Promise<Category | null>;
        update: (input: { id: number; name: string }) => Promise<Category>;
        delete: (id: number) => Promise<{ ok: true }>;
      };
      transaction: {
        create: (input: {
          category_id: number;
          title: string;
          amount: number;
          currency: string;
          note?: string | null;
          created_at?: string;
        }) => Promise<Transaction>;
        list: (filters?: {
          text?: string;
          category_id?: number;
          start_date?: string;
          end_date?: string;
        }) => Promise<Transaction[]>;
        get: (id: number) => Promise<Transaction | null>;
        update: (input: {
          id: number;
          category_id: number;
          title: string;
          amount: number;
          currency: string;
          note?: string | null;
          created_at?: string;
        }) => Promise<Transaction>;
        delete: (id: number) => Promise<{ ok: true }>;
      };
      dashboard: {
        totals: (filters?: {
          start_date?: string;
          end_date?: string;
        }) => Promise<DashboardTotals>;
      };
      teamDashboard: {
        get: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) => Promise<TeamDashboardReport>;
      };
      share: {
        openWhatsApp: (message: string) => Promise<{ ok: true }>;
        copyText: (text: string) => Promise<{ ok: true }>;
      };
      backup: {
        exportDb: () => Promise<BackupRestoreResult>;
        importDb: () => Promise<BackupRestoreResult>;
      };
      person: {
        create: (input: {
          index_num: string;
          name: string;
          role: string;
          phone_number?: string | null;
          is_active?: boolean;
        }) => Promise<Person>;
        list: (filters?: PersonFilters) => Promise<PaginatedPersons>;
        get: (id: number) => Promise<Person | null>;
        update: (input: {
          id: number;
          name?: string;
          role?: string;
          phone_number?: string | null;
          is_active?: boolean;
        }) => Promise<Person>;
        delete: (id: number) => Promise<{ ok: true }>;
        deactivate: (id: number) => Promise<Person>;
        reactivate: (id: number) => Promise<Person>;
        exportCsv: (filters?: PersonFilters) => Promise<BackupRestoreResult>;
        importCsv: () => Promise<PersonCsvImportResult>;
        getTransparency: (personId: number, filters?: PersonTransparencyFilters) => Promise<PersonTransparencyData>;
      };
      scoreConfig: {
        listVersions: () => Promise<ScoreConfigVersion[]>;
        getSnapshot: (id: number) => Promise<ScoreConfigSnapshot | null>;
        createSnapshot: (input: ScoreConfigSnapshotCreateInput) => Promise<ScoreConfigSnapshot>;
        activate: (id: number) => Promise<ScoreConfigVersion>;
        deactivate: (id: number) => Promise<ScoreConfigVersion>;
        delete: (id: number) => Promise<void>;
        exportJson: (versionId: number) => Promise<BackupRestoreResult>;
        importJson: () => Promise<ScoreConfigJsonImportResult>;
      };
      activity: {
        getCatalog: () => Promise<ActivityEntryCatalog>;
        preview: (input: { group_id: number; items: ActivityLogItemEntryInput[] }) => Promise<ActivityScorePreview>;
        create: (input: ActivityLogSaveInput) => Promise<ActivityLogDetail>;
        createBatch: (input: ActivityLogBatchSaveInput) => Promise<ActivityLogBatchSaveResult>;
        duplicateTemplate: (input: { person_id: number; activity_date?: string }) => Promise<ActivityLogSaveInput | null>;
        list: (filters?: ActivityLogListFilters) => Promise<PaginatedActivityLogs>;
        get: (id: number) => Promise<ActivityLogDetail | null>;
        update: (input: { id: number } & ActivityLogSaveInput) => Promise<ActivityLogDetail>;
        delete: (id: number) => Promise<{ ok: true }>;
        recalculateAll: () => Promise<RecalculationRunResult>;
        recalculatePerson: (personId: number) => Promise<RecalculationRunResult>;
        recalculateDateRange: (input: { from: string; to: string }) => Promise<RecalculationRunResult>;
      };
      report: {
        exportAllLogsGroupedCsv: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) => Promise<BackupRestoreResult>;
        exportPersonLogsCsv: (
          personId: number,
          filters?: { start_date?: string; end_date?: string; inactive_days?: number }
        ) => Promise<BackupRestoreResult>;
        exportLeaderboardCsv: (filters?: { start_date?: string; end_date?: string; inactive_days?: number }) => Promise<BackupRestoreResult>;
        exportScoreConfigHistoryCsv: () => Promise<BackupRestoreResult>;
      };
    };
  }
}
