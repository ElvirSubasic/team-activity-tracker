export type Category = {
  id: number;
  name: string;
  created_at: string;
};

export type Transaction = {
  id: number;
  category_id: number;
  title: string;
  amount: number;
  currency: string;
  note: string | null;
  created_at: string;
};

export type TransactionFilters = {
  text?: string;
  category_id?: number;
  start_date?: string;
  end_date?: string;
};

export type DashboardTotals = {
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

export type DashboardFilters = {
  start_date?: string;
  end_date?: string;
};

export type BackupRestoreResult = {
  ok: boolean;
  cancelled?: boolean;
  path?: string;
  error?: string;
};

export type Person = {
  id: number;
  index_num: string;
  name: string;
  role: string;
  phone_number: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type PersonFilters = {
  text?: string;
  is_active?: boolean;
  page?: number;
  pageSize?: number;
};

export type PaginatedPersons = {
  items: Person[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PersonCsvImportResult = BackupRestoreResult & {
  inserted?: number;
  updated?: number;
  skipped?: number;
};

export type ScoreConfigVersion = {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  activated_at: string | null;
  notes: string | null;
};

export type ScoreConfigActivityType = {
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

export type ScoreConfigGroup = {
  id: number;
  config_version_id: number;
  code: string;
  name: string;
  base_xp: number;
  sort_order: number;
  is_active: number;
  activity_types: ScoreConfigActivityType[];
};

export type ScoreConfigSnapshot = {
  version: ScoreConfigVersion;
  groups: ScoreConfigGroup[];
};

export type ScoreConfigActivityTypeInput = {
  code: string;
  name: string;
  percent_of_group_base?: number;
  parent_activity_type_code?: string | null;
  percent_of_parent_type?: number;
  fixed_points?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

export type ScoreConfigGroupInput = {
  code: string;
  name: string;
  base_xp: number;
  sort_order?: number;
  is_active?: boolean;
  activity_types: ScoreConfigActivityTypeInput[];
};

export type ScoreConfigSnapshotCreateInput = {
  source_version_id?: number | null;
  name: string;
  notes?: string | null;
  activate?: boolean;
  apply_to_historical_logs?: boolean;
  groups: ScoreConfigGroupInput[];
};

export type RecalculationRunScope = "all" | "person" | "date_range";

export type RecalculationRunResult = {
  scope: RecalculationRunScope;
  config_version_id: number;
  updated_items: number;
  affected_logs: number;
  filters?: {
    person_id?: number;
    from?: string;
    to?: string;
  };
};

export type ScoreConfigJsonImportResult = BackupRestoreResult & {
  version_id?: number;
  version_name?: string;
};

export type ActivityLogItemEntryInput = {
  activity_type_id: number;
  quantity?: number;
  notes?: string | null;
};

export type ActivityLogSaveInput = {
  person_id: number;
  activity_date: string;
  group_id: number;
  notes?: string | null;
  items: ActivityLogItemEntryInput[];
};

export type ActivityLogBatchSaveInput = {
  person_ids: number[];
  activity_date: string;
  group_id: number;
  notes?: string | null;
  items: ActivityLogItemEntryInput[];
};

export type ActivityLogBatchSaveResult = {
  created: number;
  log_ids: number[];
};

export type ActivityScorePreviewItem = {
  activity_type_id: number;
  quantity: number;
  points_per_unit: number;
  total_points: number;
};

export type ActivityScorePreview = {
  group_id: number;
  config_version_id: number;
  total_points: number;
  items: ActivityScorePreviewItem[];
};

export type ActivityEntryCatalog = {
  config_version_id: number;
  config_version_name: string;
  groups: ScoreConfigGroup[];
};

export type ActivityLogListFilters = {
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

export type ActivityLogListItem = {
  id: number;
  person_id: number;
  person_name: string;
  activity_date: string;
  group_id: number;
  group_name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  total_points: number;
};

export type ActivityLogItemDetail = {
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
};

export type ActivityLogDetail = {
  log: {
    id: number;
    person_id: number;
    activity_date: string;
    group_id: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  items: ActivityLogItemDetail[];
  total_points: number;
};

export type PaginatedActivityLogs = {
  items: ActivityLogListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PersonTransparencyFilters = {
  start_date?: string;
  end_date?: string;
  group_id?: number;
  activity_type_id?: number;
  sort_by?: "activity_date" | "total_points" | "created_at";
  sort_dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type PersonTransparencySummary = {
  total_points: number;
  participation_percent: number;
  log_count: number;
  last_activity_date: string | null;
};

export type PersonGroupBreakdown = {
  group_id: number;
  group_code: string;
  group_name: string;
  log_count: number;
  total_points: number;
};

export type PersonTypeBreakdown = {
  activity_type_id: number;
  activity_type_code: string;
  activity_type_name: string;
  group_code: string;
  group_name: string;
  log_count: number;
  total_points: number;
};

export type PersonTrendPoint = {
  activity_date: string;
  log_count: number;
  total_points: number;
};

export type PersonTransparencyData = {
  person_id: number;
  summary: PersonTransparencySummary;
  breakdown_by_group: PersonGroupBreakdown[];
  breakdown_by_type: PersonTypeBreakdown[];
  trend_by_date: PersonTrendPoint[];
  logs: PaginatedActivityLogs;
};

export type TeamDashboardFilters = {
  start_date?: string;
  end_date?: string;
  inactive_days?: number;
};

export type TeamLeaderboardRow = {
  person_id: number;
  index_num: string;
  name: string;
  role: string;
  total_points: number;
  log_count: number;
  participation_percent: number;
  last_activity_date: string | null;
};

export type ContributionDistributionRow = {
  person_id: number;
  index_num: string;
  name: string;
  total_points: number;
  contribution_percent: number;
};

export type WeeklyActivityVolumeRow = {
  week_label: string;
  log_count: number;
  total_points: number;
};

export type InactiveMemberRow = {
  person_id: number;
  index_num: string;
  name: string;
  role: string;
  last_activity_date: string | null;
  days_since_last_activity: number | null;
};

export type TeamDashboardReport = {
  team_total_points: number;
  total_logs: number;
  leaderboard: TeamLeaderboardRow[];
  contribution_distribution: ContributionDistributionRow[];
  weekly_activity_volume: WeeklyActivityVolumeRow[];
  inactive_members: InactiveMemberRow[];
};
