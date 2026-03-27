import type { SqliteDatabase } from "../db/client";
import type {
  ActivityLogDetail,
  ActivityLogItemDetail,
  ActivityLogListFilters,
  ActivityLogListItem,
  ActivityGroup,
  ActivityGroupCreateInput,
  ActivityLog,
  ActivityLogCreateInput,
  ActivityLogFilters,
  ActivityLogItem,
  ActivityLogItemCreateInput,
  ActivityLogItemScore,
  ActivityLogItemWithContext,
  ActivityType,
  ActivityTypeCreateInput,
  PaginatedResult,
  ContributionDistributionRow,
  InactiveMemberRow,
  PersonGroupBreakdown,
  PersonTrendPoint,
  PersonTransparencyFilters,
  PersonTransparencySummary,
  PersonTypeBreakdown,
  ScoreConfigGroup,
  TeamDashboardFilters,
  TeamLeaderboardRow,
  WeeklyActivityVolumeRow
} from "../types";

type SqlParams = Record<string, number | string | null>;
type CountRow = { count: number };
type ItemIdRow = { id: number; activity_log_id: number };

export class ActivityRepository {
  constructor(private readonly db: SqliteDatabase) {}

  listGroupsWithTypesByConfigVersion(configVersionId: number): ScoreConfigGroup[] {
    const groups = this.db
      .prepare(
        `SELECT *
         FROM activity_groups
         WHERE config_version_id = @config_version_id
         ORDER BY sort_order ASC, id ASC`
      )
      .all({ config_version_id: configVersionId }) as ActivityGroup[];

    if (groups.length === 0) {
      return [];
    }

    const groupIds = groups.map((group) => group.id);
    const placeholders = groupIds.map(() => `?`).join(", ");
    const types = this.db
      .prepare(
        `SELECT *
         FROM activity_types
         WHERE group_id IN (${placeholders})
         ORDER BY sort_order ASC, id ASC`
      )
      .all(...groupIds) as ActivityType[];

    return groups.map((group) => ({
      ...group,
      activity_types: types.filter((activityType) => activityType.group_id === group.id)
    }));
  }

  createGroup(input: ActivityGroupCreateInput): ActivityGroup {
    const result = this.db
      .prepare(
        `INSERT INTO activity_groups (config_version_id, code, name, base_xp, sort_order, is_active)
         VALUES (@config_version_id, @code, @name, @base_xp, @sort_order, @is_active)`
      )
      .run({
        config_version_id: input.config_version_id,
        code: input.code,
        name: input.name,
        base_xp: input.base_xp,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true ? 1 : 0
      });

    return this.getGroupById(Number(result.lastInsertRowid)) as ActivityGroup;
  }

  getGroupById(id: number): ActivityGroup | null {
    const row = this.db.prepare("SELECT * FROM activity_groups WHERE id = @id").get({ id });
    return (row as ActivityGroup | undefined) ?? null;
  }

  createType(input: ActivityTypeCreateInput): ActivityType {
    const result = this.db
      .prepare(
        `INSERT INTO activity_types
           (group_id, code, name, percent_of_group_base, parent_activity_type_id, percent_of_parent_type, fixed_points, is_active, sort_order)
         VALUES
           (@group_id, @code, @name, @percent_of_group_base, @parent_activity_type_id, @percent_of_parent_type, @fixed_points, @is_active, @sort_order)`
      )
      .run({
        group_id: input.group_id,
        code: input.code,
        name: input.name,
        percent_of_group_base: input.percent_of_group_base ?? 0,
        parent_activity_type_id: input.parent_activity_type_id ?? null,
        percent_of_parent_type: input.percent_of_parent_type ?? null,
        fixed_points: input.fixed_points ?? null,
        is_active: input.is_active ?? true ? 1 : 0,
        sort_order: input.sort_order ?? 0
      });

    return this.getTypeById(Number(result.lastInsertRowid)) as ActivityType;
  }

  getTypeById(id: number): ActivityType | null {
    const row = this.db.prepare("SELECT * FROM activity_types WHERE id = @id").get({ id });
    return (row as ActivityType | undefined) ?? null;
  }

  createLog(input: ActivityLogCreateInput): ActivityLog {
    const result = this.db
      .prepare(
        `INSERT INTO activity_logs (person_id, activity_date, group_id, notes, created_at, updated_at)
         VALUES (@person_id, @activity_date, @group_id, @notes, datetime('now'), datetime('now'))`
      )
      .run({
        person_id: input.person_id,
        activity_date: input.activity_date,
        group_id: input.group_id,
        notes: input.notes ?? null
      });

    return this.getLogById(Number(result.lastInsertRowid)) as ActivityLog;
  }

  getLogById(id: number): ActivityLog | null {
    const row = this.db.prepare("SELECT * FROM activity_logs WHERE id = @id").get({ id });
    return (row as ActivityLog | undefined) ?? null;
  }

  getLatestLogByPerson(personId: number): ActivityLog | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM activity_logs
         WHERE person_id = @person_id
         ORDER BY activity_date DESC, id DESC
         LIMIT 1`
      )
      .get({ person_id: personId });

    return (row as ActivityLog | undefined) ?? null;
  }

  updateLog(input: { id: number; activity_date: string; group_id: number; notes: string | null }): ActivityLog {
    this.db
      .prepare(
        `UPDATE activity_logs
         SET activity_date = @activity_date,
             group_id = @group_id,
             notes = @notes,
             updated_at = datetime('now')
         WHERE id = @id`
      )
      .run(input);

    return this.getLogById(input.id) as ActivityLog;
  }

  removeLog(id: number): void {
    const result = this.db.prepare("DELETE FROM activity_logs WHERE id = @id").run({ id });
    if (result.changes === 0) {
      throw new Error("Activity log not found");
    }
  }

  removeLogItemsByLogId(activityLogId: number): void {
    this.db
      .prepare("DELETE FROM activity_log_items WHERE activity_log_id = @activity_log_id")
      .run({ activity_log_id: activityLogId });
  }

  listLogItemsByLogId(activityLogId: number): ActivityLogItemDetail[] {
    return this.db
      .prepare(
        `SELECT ali.id,
                ali.activity_log_id,
                ali.activity_type_id,
                ali.quantity,
                ali.notes,
                ali.created_at,
                at.code AS activity_type_code,
                at.name AS activity_type_name,
                COALESCE(alis.config_version_id, ag.config_version_id) AS config_version_id,
                ag.code AS group_code,
                ag.name AS group_name,
                ag.base_xp AS group_base_xp,
                at.percent_of_group_base AS type_percent_of_group_base,
                  at.percent_of_parent_type AS type_percent_of_parent_type,
                  pat.name AS parent_activity_type_name,
                  pat.percent_of_group_base AS parent_percent_of_group_base,
                  pat.fixed_points AS parent_fixed_points,
                at.fixed_points AS type_fixed_points,
                COALESCE(alis.points_per_unit, 0) AS points_per_unit,
                COALESCE(alis.total_points, 0) AS total_points,
                '' AS formula
         FROM activity_log_items ali
         INNER JOIN activity_logs al ON al.id = ali.activity_log_id
         INNER JOIN activity_types at ON at.id = ali.activity_type_id
                LEFT JOIN activity_types pat ON pat.id = at.parent_activity_type_id
         INNER JOIN activity_groups ag ON ag.id = al.group_id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         WHERE ali.activity_log_id = @activity_log_id
         ORDER BY ali.id ASC`
      )
      .all({ activity_log_id: activityLogId }) as ActivityLogItemDetail[];
  }

  getLogDetailById(id: number): ActivityLogDetail | null {
    const log = this.getLogById(id);
    if (!log) {
      return null;
    }

    const items = this.listLogItemsByLogId(id);
    const total_points = items.reduce((sum, item) => sum + item.total_points, 0);

    return {
      log,
      items,
      total_points
    };
  }

  listLogsForAdmin(filters: ActivityLogListFilters): PaginatedResult<ActivityLogListItem> {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.person_id) {
      clauses.push("al.person_id = @person_id");
      params.person_id = filters.person_id;
    }

    if (filters.group_id) {
      clauses.push("al.group_id = @group_id");
      params.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      clauses.push(
        `EXISTS (
          SELECT 1
          FROM activity_log_items ali_filter
          WHERE ali_filter.activity_log_id = al.id
            AND ali_filter.activity_type_id = @activity_type_id
        )`
      );
      params.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const offset = (page - 1) * pageSize;
    const sortBy = filters.sort_by ?? "activity_date";
    const sortDir = (filters.sort_dir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const orderByClause =
      sortBy === "total_points"
        ? `ORDER BY total_points ${sortDir}, al.activity_date DESC, al.id DESC`
        : sortBy === "created_at"
          ? `ORDER BY al.created_at ${sortDir}, al.id ${sortDir}`
          : `ORDER BY al.activity_date ${sortDir}, al.id ${sortDir}`;

    const items = this.db
      .prepare(
        `SELECT al.id,
                al.person_id,
                p.name AS person_name,
                al.activity_date,
                al.group_id,
                ag.name AS group_name,
                al.notes,
                al.created_at,
                al.updated_at,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         INNER JOIN persons p ON p.id = al.person_id
         INNER JOIN activity_groups ag ON ag.id = al.group_id
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}
         GROUP BY al.id, p.name, ag.name
        ${orderByClause}
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset }) as ActivityLogListItem[];

    const total = (
      this.db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM activity_logs al
           ${where}`
        )
        .get(params) as CountRow
    ).count;

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    };
  }

  listLogs(filters: ActivityLogFilters): PaginatedResult<ActivityLog> {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.person_id) {
      clauses.push("person_id = @person_id");
      params.person_id = filters.person_id;
    }

    if (filters.group_id) {
      clauses.push("group_id = @group_id");
      params.group_id = filters.group_id;
    }

    if (filters.start_date) {
      clauses.push("activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const items = this.db
      .prepare(
        `SELECT *
         FROM activity_logs
         ${where}
         ORDER BY activity_date DESC, id DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset }) as ActivityLog[];

    const total = (
      this.db
        .prepare(`SELECT COUNT(1) AS count FROM activity_logs ${where}`)
        .get(params) as CountRow
    ).count;

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    };
  }

  createLogItem(input: ActivityLogItemCreateInput): ActivityLogItem {
    const result = this.db
      .prepare(
        `INSERT INTO activity_log_items (activity_log_id, activity_type_id, quantity, notes, created_at)
         VALUES (@activity_log_id, @activity_type_id, @quantity, @notes, datetime('now'))`
      )
      .run({
        activity_log_id: input.activity_log_id,
        activity_type_id: input.activity_type_id,
        quantity: input.quantity ?? 1,
        notes: input.notes ?? null
      });

    return this.getLogItemById(Number(result.lastInsertRowid)) as ActivityLogItem;
  }

  getLogItemById(id: number): ActivityLogItem | null {
    const row = this.db.prepare("SELECT * FROM activity_log_items WHERE id = @id").get({ id });
    return (row as ActivityLogItem | undefined) ?? null;
  }

  getLogItemWithContext(id: number): ActivityLogItemWithContext | null {
    const row = this.db
      .prepare(
        `SELECT ali.*,
                al.group_id AS log_group_id,
                ag.config_version_id,
                at.group_id AS type_group_id,
                at.percent_of_group_base AS type_percent_of_group_base,
                  at.parent_activity_type_id AS type_parent_activity_type_id,
                  at.percent_of_parent_type AS type_percent_of_parent_type,
                  pat.percent_of_group_base AS parent_type_percent_of_group_base,
                  pat.fixed_points AS parent_type_fixed_points,
                at.fixed_points AS type_fixed_points,
                ag.base_xp AS group_base_xp
         FROM activity_log_items ali
         INNER JOIN activity_logs al ON al.id = ali.activity_log_id
         INNER JOIN activity_types at ON at.id = ali.activity_type_id
                LEFT JOIN activity_types pat ON pat.id = at.parent_activity_type_id
         INNER JOIN activity_groups ag ON ag.id = at.group_id
         WHERE ali.id = @id`
      )
      .get({ id });

    return (row as ActivityLogItemWithContext | undefined) ?? null;
  }

  upsertLogItemScore(input: {
    activity_log_item_id: number;
    points_per_unit: number;
    quantity: number;
    total_points: number;
    config_version_id: number;
  }): ActivityLogItemScore {
    this.db
      .prepare(
        `INSERT INTO activity_log_item_scores
           (activity_log_item_id, points_per_unit, quantity, total_points, config_version_id, computed_at)
         VALUES
           (@activity_log_item_id, @points_per_unit, @quantity, @total_points, @config_version_id, datetime('now'))
         ON CONFLICT(activity_log_item_id)
         DO UPDATE SET
           points_per_unit = excluded.points_per_unit,
           quantity = excluded.quantity,
           total_points = excluded.total_points,
           config_version_id = excluded.config_version_id,
           computed_at = datetime('now')`
      )
      .run(input);

    return this.getLogItemScoreByLogItemId(input.activity_log_item_id) as ActivityLogItemScore;
  }

  getLogItemScoreByLogItemId(activityLogItemId: number): ActivityLogItemScore | null {
    const row = this.db
      .prepare("SELECT * FROM activity_log_item_scores WHERE activity_log_item_id = @activity_log_item_id")
      .get({ activity_log_item_id: activityLogItemId });

    return (row as ActivityLogItemScore | undefined) ?? null;
  }

  listLogItemsWithContextByConfigVersion(configVersionId: number): ActivityLogItemWithContext[] {
    return this.db
      .prepare(
        `SELECT ali.*,
                al.group_id AS log_group_id,
                ag.config_version_id,
                at.group_id AS type_group_id,
                at.percent_of_group_base AS type_percent_of_group_base,
                  at.parent_activity_type_id AS type_parent_activity_type_id,
                  at.percent_of_parent_type AS type_percent_of_parent_type,
                  pat.percent_of_group_base AS parent_type_percent_of_group_base,
                  pat.fixed_points AS parent_type_fixed_points,
                at.fixed_points AS type_fixed_points,
                ag.base_xp AS group_base_xp
         FROM activity_log_items ali
         INNER JOIN activity_logs al ON al.id = ali.activity_log_id
         INNER JOIN activity_types at ON at.id = ali.activity_type_id
                LEFT JOIN activity_types pat ON pat.id = at.parent_activity_type_id
         INNER JOIN activity_groups ag ON ag.id = at.group_id
         WHERE ag.config_version_id = @config_version_id`
      )
      .all({ config_version_id: configVersionId }) as ActivityLogItemWithContext[];
  }

  listLogItemIdsForRecalculation(filters: {
    person_id?: number;
    start_date?: string;
    end_date?: string;
  }): Array<{ id: number; activity_log_id: number }> {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.person_id !== undefined) {
      clauses.push("al.person_id = @person_id");
      params.person_id = filters.person_id;
    }

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT ali.id,
                ali.activity_log_id
         FROM activity_log_items ali
         INNER JOIN activity_logs al ON al.id = ali.activity_log_id
         ${where}
         ORDER BY ali.id ASC`
      )
      .all(params) as ItemIdRow[];
  }

  remapHistoricalLogsToConfigVersion(configVersionId: number): {
    logs_updated: number;
    items_updated: number;
  } {
    const runRemap = this.db.transaction((versionId: number) => {
      const logsResult = this.db
        .prepare(
          `UPDATE activity_logs
           SET group_id = (
             SELECT ng.id
             FROM activity_groups og
             INNER JOIN activity_groups ng
               ON ng.code = og.code
              AND ng.config_version_id = @config_version_id
             WHERE og.id = activity_logs.group_id
           )
           WHERE EXISTS (
             SELECT 1
             FROM activity_groups og
             INNER JOIN activity_groups ng
               ON ng.code = og.code
              AND ng.config_version_id = @config_version_id
             WHERE og.id = activity_logs.group_id
               AND ng.id != activity_logs.group_id
           )`
        )
        .run({ config_version_id: versionId });

      const itemsResult = this.db
        .prepare(
          `UPDATE activity_log_items
           SET activity_type_id = (
             SELECT nt.id
             FROM activity_types ot
             INNER JOIN activity_logs al ON al.id = activity_log_items.activity_log_id
             INNER JOIN activity_groups ng ON ng.id = al.group_id
             INNER JOIN activity_types nt
               ON nt.group_id = ng.id
              AND nt.code = ot.code
             WHERE ot.id = activity_log_items.activity_type_id
           )
           WHERE EXISTS (
             SELECT 1
             FROM activity_types ot
             INNER JOIN activity_logs al ON al.id = activity_log_items.activity_log_id
             INNER JOIN activity_groups ng ON ng.id = al.group_id
             INNER JOIN activity_types nt
               ON nt.group_id = ng.id
              AND nt.code = ot.code
             WHERE ot.id = activity_log_items.activity_type_id
               AND nt.id != activity_log_items.activity_type_id
           )`
        )
        .run();

      return {
        logs_updated: logsResult.changes,
        items_updated: itemsResult.changes
      };
    });

    return runRemap(configVersionId);
  }

  getPersonTransparencySummary(
    personId: number,
    filters: PersonTransparencyFilters
  ): PersonTransparencySummary {
    const personClauses: string[] = ["al.person_id = @person_id"];
    const personParams: SqlParams = { person_id: personId };

    if (filters.group_id) {
      personClauses.push("al.group_id = @group_id");
      personParams.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      personClauses.push(
        `EXISTS (
          SELECT 1
          FROM activity_log_items ali_filter
          WHERE ali_filter.activity_log_id = al.id
            AND ali_filter.activity_type_id = @activity_type_id
        )`
      );
      personParams.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      personClauses.push("al.activity_date >= @start_date");
      personParams.start_date = filters.start_date;
    }

    if (filters.end_date) {
      personClauses.push("al.activity_date <= @end_date");
      personParams.end_date = filters.end_date;
    }

    const personWhere = `WHERE ${personClauses.join(" AND ")}`;

    const personRow = this.db
      .prepare(
        `SELECT COUNT(DISTINCT al.id) AS log_count,
                MAX(al.activity_date) AS last_activity_date,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${personWhere}`
      )
      .get(personParams) as {
      log_count: number;
      last_activity_date: string | null;
      total_points: number;
    };

    const allClauses: string[] = [];
    const allParams: SqlParams = {};

    if (filters.group_id) {
      allClauses.push("al.group_id = @group_id");
      allParams.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      allClauses.push(
        `EXISTS (
          SELECT 1
          FROM activity_log_items ali_filter
          WHERE ali_filter.activity_log_id = al.id
            AND ali_filter.activity_type_id = @activity_type_id
        )`
      );
      allParams.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      allClauses.push("al.activity_date >= @start_date");
      allParams.start_date = filters.start_date;
    }

    if (filters.end_date) {
      allClauses.push("al.activity_date <= @end_date");
      allParams.end_date = filters.end_date;
    }

    const allWhere = allClauses.length > 0 ? `WHERE ${allClauses.join(" AND ")}` : "";
    const allRow = this.db
      .prepare(
        `SELECT COUNT(1) AS total_logs
         FROM activity_logs al
         ${allWhere}`
      )
      .get(allParams) as { total_logs: number };

    const participationPercent =
      allRow.total_logs > 0 ? Math.round(((personRow.log_count / allRow.total_logs) * 100 + Number.EPSILON) * 100) / 100 : 0;

    return {
      total_points: personRow.total_points,
      participation_percent: participationPercent,
      log_count: personRow.log_count,
      last_activity_date: personRow.last_activity_date
    };
  }

  getPersonBreakdownByGroup(personId: number, filters: PersonTransparencyFilters): PersonGroupBreakdown[] {
    const clauses: string[] = ["al.person_id = @person_id"];
    const params: SqlParams = { person_id: personId };

    if (filters.group_id) {
      clauses.push("al.group_id = @group_id");
      params.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      clauses.push(
        `EXISTS (
          SELECT 1
          FROM activity_log_items ali_filter
          WHERE ali_filter.activity_log_id = al.id
            AND ali_filter.activity_type_id = @activity_type_id
        )`
      );
      params.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return this.db
      .prepare(
        `SELECT ag.id AS group_id,
                ag.code AS group_code,
                ag.name AS group_name,
                COUNT(DISTINCT al.id) AS log_count,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         INNER JOIN activity_groups ag ON ag.id = al.group_id
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}
         GROUP BY ag.id, ag.code, ag.name
         ORDER BY total_points DESC, ag.name ASC`
      )
      .all(params) as PersonGroupBreakdown[];
  }

  getPersonBreakdownByType(personId: number, filters: PersonTransparencyFilters): PersonTypeBreakdown[] {
    const clauses: string[] = ["al.person_id = @person_id"];
    const params: SqlParams = { person_id: personId };

    if (filters.group_id) {
      clauses.push("al.group_id = @group_id");
      params.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      clauses.push("at.id = @activity_type_id");
      params.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return this.db
      .prepare(
        `SELECT at.id AS activity_type_id,
                at.code AS activity_type_code,
                at.name AS activity_type_name,
                ag.code AS group_code,
                ag.name AS group_name,
                COUNT(DISTINCT al.id) AS log_count,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         INNER JOIN activity_groups ag ON ag.id = al.group_id
         INNER JOIN activity_log_items ali ON ali.activity_log_id = al.id
         INNER JOIN activity_types at ON at.id = ali.activity_type_id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}
         GROUP BY at.id, at.code, at.name, ag.code, ag.name
         ORDER BY total_points DESC, at.name ASC`
      )
      .all(params) as PersonTypeBreakdown[];
  }

  getPersonTrendByDate(personId: number, filters: PersonTransparencyFilters): PersonTrendPoint[] {
    const clauses: string[] = ["al.person_id = @person_id"];
    const params: SqlParams = { person_id: personId };

    if (filters.group_id) {
      clauses.push("al.group_id = @group_id");
      params.group_id = filters.group_id;
    }

    if (filters.activity_type_id) {
      clauses.push(
        `EXISTS (
          SELECT 1
          FROM activity_log_items ali_filter
          WHERE ali_filter.activity_log_id = al.id
            AND ali_filter.activity_type_id = @activity_type_id
        )`
      );
      params.activity_type_id = filters.activity_type_id;
    }

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = `WHERE ${clauses.join(" AND ")}`;
    return this.db
      .prepare(
        `SELECT al.activity_date,
                COUNT(DISTINCT al.id) AS log_count,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}
         GROUP BY al.activity_date
         ORDER BY al.activity_date ASC`
      )
      .all(params) as PersonTrendPoint[];
  }

  getTeamTotalPoints(filters: TeamDashboardFilters): { team_total_points: number; total_logs: number } {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(
        `SELECT COALESCE(SUM(alis.total_points), 0) AS team_total_points,
                COUNT(DISTINCT al.id) AS total_logs
         FROM activity_logs al
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}`
      )
      .get(params) as { team_total_points: number; total_logs: number };
  }

  getLeaderboard(filters: TeamDashboardFilters): TeamLeaderboardRow[] {
    const clauses: string[] = [];
    const params: SqlParams = {};
    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }
    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalLogs = this.getTeamTotalPoints(filters).total_logs;

    const rows = this.db
      .prepare(
        `SELECT p.id AS person_id,
                p.index_num,
                p.name,
                p.role,
                COALESCE(SUM(alis.total_points), 0) AS total_points,
                COUNT(DISTINCT al.id) AS log_count,
                MAX(al.activity_date) AS last_activity_date
         FROM persons p
         LEFT JOIN activity_logs al ON al.person_id = p.id
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where.replaceAll("al.", "al.")}
         GROUP BY p.id, p.index_num, p.name, p.role
         ORDER BY log_count DESC, total_points DESC, p.name ASC`
      )
      .all(params) as Array<Omit<TeamLeaderboardRow, "participation_percent">>;

    return rows
      .map((row) => ({
        ...row,
        participation_percent:
          totalLogs > 0 ? Math.round(((row.log_count / totalLogs) * 100 + Number.EPSILON) * 100) / 100 : 0
      }))
      .sort((a, b) => b.participation_percent - a.participation_percent || b.total_points - a.total_points || a.name.localeCompare(b.name));
  }

  getContributionDistribution(filters: TeamDashboardFilters): ContributionDistributionRow[] {
    const leaderboard = this.getLeaderboard(filters).filter((row) => row.total_points > 0);
    const totalPoints = leaderboard.reduce((sum, row) => sum + row.total_points, 0);
    return leaderboard.map((row) => ({
      person_id: row.person_id,
      index_num: row.index_num,
      name: row.name,
      total_points: row.total_points,
      contribution_percent:
        totalPoints > 0 ? Math.round(((row.total_points / totalPoints) * 100 + Number.EPSILON) * 100) / 100 : 0
    }));
  }

  getWeeklyActivityVolume(filters: TeamDashboardFilters): WeeklyActivityVolumeRow[] {
    const clauses: string[] = [];
    const params: SqlParams = {};
    if (filters.start_date) {
      clauses.push("al.activity_date >= @start_date");
      params.start_date = filters.start_date;
    }
    if (filters.end_date) {
      clauses.push("al.activity_date <= @end_date");
      params.end_date = filters.end_date;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(
        `SELECT printf('%s-W%02d', strftime('%Y', al.activity_date), CAST(strftime('%W', al.activity_date) AS INTEGER)) AS week_label,
                COUNT(DISTINCT al.id) AS log_count,
                COALESCE(SUM(alis.total_points), 0) AS total_points
         FROM activity_logs al
         LEFT JOIN activity_log_items ali ON ali.activity_log_id = al.id
         LEFT JOIN activity_log_item_scores alis ON alis.activity_log_item_id = ali.id
         ${where}
         GROUP BY week_label
         ORDER BY week_label ASC`
      )
      .all(params) as WeeklyActivityVolumeRow[];
  }

  getInactiveMembers(days: number): InactiveMemberRow[] {
    return this.db
      .prepare(
        `SELECT p.id AS person_id,
                p.index_num,
                p.name,
                p.role,
                MAX(al.activity_date) AS last_activity_date,
                CASE
                  WHEN MAX(al.activity_date) IS NULL THEN NULL
                  ELSE CAST(julianday('now') - julianday(MAX(al.activity_date)) AS INTEGER)
                END AS days_since_last_activity
         FROM persons p
         LEFT JOIN activity_logs al ON al.person_id = p.id
         WHERE p.is_active = 1
         GROUP BY p.id, p.index_num, p.name, p.role
         HAVING MAX(al.activity_date) IS NULL
            OR julianday('now') - julianday(MAX(al.activity_date)) > @days
         ORDER BY last_activity_date ASC, p.name ASC`
      )
      .all({ days }) as InactiveMemberRow[];
  }

  listAllLogsForExport(filters: TeamDashboardFilters & { person_id?: number }): ActivityLogListItem[] {
    return this.listLogsForAdmin({
      person_id: filters.person_id,
      start_date: filters.start_date,
      end_date: filters.end_date,
      sort_by: "activity_date",
      sort_dir: "desc",
      page: 1,
      pageSize: 100
    }).items;
  }
}
