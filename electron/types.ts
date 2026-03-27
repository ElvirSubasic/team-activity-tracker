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

export type CategoryCreateInput = {
  name: string;
};

export type CategoryUpdateInput = {
  id: number;
  name: string;
};

export type TransactionCreateInput = {
  category_id: number;
  title: string;
  amount: number;
  currency: string;
  note?: string | null;
  created_at?: string;
};

export type TransactionUpdateInput = {
  id: number;
  category_id: number;
  title: string;
  amount: number;
  currency: string;
  note?: string | null;
  created_at?: string;
};

export type TransactionListFilters = {
  text?: string;
  category_id?: number;
  start_date?: string;
  end_date?: string;
};

export type DashboardFilters = {
  start_date?: string;
  end_date?: string;
};

export type DashboardMonthlyTotal = {
  month: string;
  currency: string;
  total: number;
};

export type DashboardCategoryTotal = {
  category_id: number;
  category_name: string;
  currency: string;
  total: number;
};

export type DashboardTotals = {
  byMonth: DashboardMonthlyTotal[];
  byCategory: DashboardCategoryTotal[];
};

export type PaginationInput = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

export type PersonCreateInput = {
  index_num: string;
  name: string;
  role: string;
  phone_number?: string | null;
  is_active?: boolean;
};

export type PersonUpdateInput = {
  id: number;
  name?: string;
  role?: string;
  phone_number?: string | null;
  is_active?: boolean;
};

export type PersonListFilters = PaginationInput & {
  text?: string;
  is_active?: boolean;
};

export type ScoreConfigVersion = {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  activated_at: string | null;
  notes: string | null;
};

export type ScoreConfigVersionCreateInput = {
  name: string;
  notes?: string | null;
  is_active?: boolean;
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

export type ScoreConfigJsonVersion = {
  id?: number;
  name: string;
  notes?: string | null;
  isActive?: boolean;
  createdAt?: string;
  activatedAt?: string | null;
};

export type ScoreConfigJsonActivity = {
  code: string;
  name: string;
  percent?: number;
  fixedPoints?: number | null;
  isActive?: boolean;
  sortOrder?: number;
  subActivities?: ScoreConfigJsonActivity[];
};

export type ScoreConfigJsonGroup = {
  code: string;
  name: string;
  baseXp: number;
  sortOrder?: number;
  isActive?: boolean;
  activities: ScoreConfigJsonActivity[];
};

export type ScoreConfigJsonDocument = {
  version: ScoreConfigJsonVersion;
  groups: ScoreConfigJsonGroup[];
};

export type ActivityGroup = {
  id: number;
  config_version_id: number;
  code: string;
  name: string;
  base_xp: number;
  sort_order: number;
  is_active: number;
};

export type ActivityGroupCreateInput = {
  config_version_id: number;
  code: string;
  name: string;
  base_xp: number;
  sort_order?: number;
  is_active?: boolean;
};

export type ActivityType = {
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

export type ActivityTypeCreateInput = {
  group_id: number;
  code: string;
  name: string;
  percent_of_group_base?: number;
  parent_activity_type_id?: number | null;
  percent_of_parent_type?: number | null;
  fixed_points?: number | null;
  is_active?: boolean;
  sort_order?: number;
};

export type ActivityLog = {
  id: number;
  person_id: number;
  activity_date: string;
  group_id: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLogCreateInput = {
  person_id: number;
  activity_date: string;
  group_id: number;
  notes?: string | null;
};

export type ActivityLogFilters = PaginationInput & {
  person_id?: number;
  group_id?: number;
  start_date?: string;
  end_date?: string;
};

export type ActivityLogItem = {
  id: number;
  activity_log_id: number;
  activity_type_id: number;
  quantity: number;
  notes: string | null;
  created_at: string;
};

export type ActivityLogItemCreateInput = {
  activity_log_id: number;
  activity_type_id: number;
  quantity?: number;
  notes?: string | null;
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

export type ActivityLogDuplicateTemplateRequest = {
  person_id: number;
  activity_date?: string;
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

export type ActivityLogListFilters = PaginationInput & {
  person_id?: number;
  group_id?: number;
  activity_type_id?: number;
  start_date?: string;
  end_date?: string;
  sort_by?: "activity_date" | "total_points" | "created_at";
  sort_dir?: "asc" | "desc";
};

export type ActivityLogListItem = {
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

export type ActivityLogItemDetail = ActivityLogItem & {
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
  log: ActivityLog;
  items: ActivityLogItemDetail[];
  total_points: number;
};

export type ActivityLogItemScore = {
  id: number;
  activity_log_item_id: number;
  points_per_unit: number;
  quantity: number;
  total_points: number;
  config_version_id: number;
  computed_at: string;
};

export type AuditEvent = {
  id: number;
  entity_name: string;
  entity_id: number | null;
  action: string;
  payload_json: string | null;
  created_at: string;
};

export type AuditEventCreateInput = {
  entity_name: string;
  entity_id?: number | null;
  action: string;
  payload_json?: string | null;
};

export type ActivityLogItemWithContext = ActivityLogItem & {
  log_group_id: number;
  config_version_id: number;
  type_group_id: number;
  type_percent_of_group_base: number;
  type_parent_activity_type_id: number | null;
  type_percent_of_parent_type: number | null;
  parent_type_percent_of_group_base: number | null;
  parent_type_fixed_points: number | null;
  type_fixed_points: number | null;
  group_base_xp: number;
};

export type PersonTransparencyFilters = PaginationInput & {
  start_date?: string;
  end_date?: string;
  group_id?: number;
  activity_type_id?: number;
  sort_by?: "activity_date" | "total_points" | "created_at";
  sort_dir?: "asc" | "desc";
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
  logs: PaginatedResult<ActivityLogListItem>;
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
