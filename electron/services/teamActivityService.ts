import type { SqliteDatabase } from "../db/client";
import * as XLSX from "xlsx";
import { ActivityRepository } from "../repositories/activityRepository";
import { AuditRepository } from "../repositories/auditRepository";
import { PersonRepository } from "../repositories/personRepository";
import { ScoreConfigRepository } from "../repositories/scoreConfigRepository";
import type {
  ActivityEntryCatalog,
  ActivityGroup,
  ActivityGroupCreateInput,
  ActivityLogBatchSaveInput,
  ActivityLogBatchSaveResult,
  ActivityLogDetail,
  ActivityLogDuplicateTemplateRequest,
  ActivityLog,
  ActivityLogCreateInput,
  ActivityLogFilters,
  ActivityLogItemEntryInput,
  ActivityLogListFilters,
  ActivityLogListItem,
  ActivityLogSaveInput,
  ActivityScorePreview,
  ActivityLogItem,
  ActivityLogItemCreateInput,
  ActivityLogItemScore,
  ActivityType,
  ActivityTypeCreateInput,
  PaginatedResult,
  Person,
  PersonCreateInput,
  PersonTransparencyData,
  PersonTransparencyFilters,
  PersonListFilters,
  PersonUpdateInput,
  RecalculationRunResult,
  ScoreConfigJsonDocument,
  ScoreConfigActivityTypeInput,
  ScoreConfigSnapshot,
  ScoreConfigSnapshotCreateInput,
  ScoreConfigVersion,
  ScoreConfigVersionCreateInput,
  TeamDashboardFilters,
  TeamDashboardReport
} from "../types";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export class TeamActivityService {
  constructor(
    private readonly persons: PersonRepository,
    private readonly scoreConfigs: ScoreConfigRepository,
    private readonly activities: ActivityRepository,
    private readonly audits: AuditRepository,
    private readonly db: SqliteDatabase
  ) {}

  createPerson(input: PersonCreateInput): Person {
    const payload: PersonCreateInput = {
      index_num: this.requiredTrim(input.index_num, "index_num", 40),
      name: this.requiredTrim(input.name, "name", 160),
      role: this.requiredTrim(input.role, "role", 80),
      phone_number: this.optionalTrim(input.phone_number, 40),
      is_active: input.is_active ?? true
    };

    const person = this.persons.create(payload);
    this.logAudit("persons", person.id, "create", person);
    return person;
  }

  getPerson(id: number): Person | null {
    this.ensurePositiveInteger(id, "person id");
    return this.persons.getById(id);
  }

  updatePerson(input: PersonUpdateInput): Person {
    this.ensurePositiveInteger(input.id, "person id");

    const payload: PersonUpdateInput = {
      id: input.id,
      name: input.name !== undefined ? this.requiredTrim(input.name, "name", 160) : undefined,
      role: input.role !== undefined ? this.requiredTrim(input.role, "role", 80) : undefined,
      phone_number: input.phone_number === undefined ? undefined : this.optionalTrim(input.phone_number, 40),
      is_active: input.is_active
    };

    const updated = this.persons.update(payload);
    this.logAudit("persons", updated.id, "update", updated);
    return updated;
  }

  deletePerson(id: number): { ok: true } {
    this.ensurePositiveInteger(id, "person id");
    this.persons.remove(id);
    this.logAudit("persons", id, "delete", { id });
    return { ok: true };
  }

  deactivatePerson(id: number): Person {
    this.ensurePositiveInteger(id, "person id");
    const updated = this.persons.update({ id, is_active: false });
    this.logAudit("persons", id, "deactivate", updated);
    return updated;
  }

  reactivatePerson(id: number): Person {
    this.ensurePositiveInteger(id, "person id");
    const updated = this.persons.update({ id, is_active: true });
    this.logAudit("persons", id, "reactivate", updated);
    return updated;
  }

  listPersons(filters: PersonListFilters): PaginatedResult<Person> {
    return this.persons.list({
      ...filters,
      text: filters.text?.trim(),
      page: this.normalizePage(filters.page),
      pageSize: this.normalizePageSize(filters.pageSize)
    });
  }

  listScoreConfigVersions(): ScoreConfigVersion[] {
    return this.scoreConfigs.list();
  }

  getScoreConfigSnapshot(id: number): ScoreConfigSnapshot | null {
    this.ensurePositiveInteger(id, "config version id");
    const version = this.scoreConfigs.getById(id);
    if (!version) {
      return null;
    }

    return {
      version,
      groups: this.activities.listGroupsWithTypesByConfigVersion(id)
    };
  }

  createScoreConfigSnapshot(input: ScoreConfigSnapshotCreateInput): ScoreConfigSnapshot {
    const normalized = this.normalizeScoreConfigSnapshotInput(input);

    const runCreate = this.db.transaction((payload: ScoreConfigSnapshotCreateInput) => {
      const version = this.scoreConfigs.create({
        name: payload.name,
        notes: payload.notes,
        is_active: false
      });

      this.logAudit("score_config_versions", version.id, "create", {
        id: version.id,
        name: version.name,
        source_version_id: payload.source_version_id ?? null
      });

      for (const [groupIndex, group] of payload.groups.entries()) {
        const createdGroup = this.activities.createGroup({
          config_version_id: version.id,
          code: group.code,
          name: group.name,
          base_xp: group.base_xp,
          sort_order: group.sort_order ?? groupIndex,
          is_active: group.is_active ?? true
        });

        this.logAudit("activity_groups", createdGroup.id, "create", createdGroup);

        const createdTypeIdsByCode = new Map<string, number>();

        for (const [typeIndex, activityType] of group.activity_types.entries()) {
          const parentActivityTypeId = activityType.parent_activity_type_code
            ? createdTypeIdsByCode.get(activityType.parent_activity_type_code)
            : null;

          if (activityType.parent_activity_type_code && !parentActivityTypeId) {
            throw new Error(
              `Parent activity type not found in ${group.code}: ${activityType.parent_activity_type_code}`
            );
          }

          const createdType = this.activities.createType({
            group_id: createdGroup.id,
            code: activityType.code,
            name: activityType.name,
            percent_of_group_base: activityType.percent_of_group_base,
            parent_activity_type_id: parentActivityTypeId,
            percent_of_parent_type: activityType.percent_of_parent_type ?? null,
            fixed_points: activityType.fixed_points ?? null,
            is_active: activityType.is_active ?? true,
            sort_order: activityType.sort_order ?? typeIndex
          });

          createdTypeIdsByCode.set(createdType.code, createdType.id);

          this.logAudit("activity_types", createdType.id, "create", createdType);
        }
      }

      if (payload.activate) {
        this.scoreConfigs.activate(version.id);
        this.logAudit("score_config_versions", version.id, "activate", { id: version.id });

        if (payload.apply_to_historical_logs) {
          const remapped = this.activities.remapHistoricalLogsToConfigVersion(version.id);
          const recalculated = this.recalculateAll();
          this.logAudit("score_config_versions", version.id, "apply_to_historical_logs", {
            version_id: version.id,
            remapped,
            recalculated
          });
        }
      } else {
        this.scoreConfigs.ensureSingleActiveVersion();
      }

      this.assertSingleActiveScoreConfigVersion();

      const snapshot = this.getScoreConfigSnapshot(version.id);
      if (!snapshot) {
        throw new Error("Failed to load created score config snapshot");
      }

      return snapshot;
    });

    return runCreate(normalized);
  }

  exportPersonsCsv(filters: PersonListFilters): string {
    const pageSize = MAX_PAGE_SIZE;
    const firstPage = this.listPersons({
      ...filters,
      page: 1,
      pageSize
    });

    const allItems = [...firstPage.items];
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const nextPage = this.listPersons({ ...filters, page, pageSize });
      allItems.push(...nextPage.items);
    }

    const headers = [
      "id",
      "index_num",
      "name",
      "role",
      "phone_number",
      "is_active",
      "created_at",
      "updated_at"
    ];

    const rows = allItems.map((person) => [
      String(person.id),
      person.index_num,
      person.name,
      person.role,
      person.phone_number ?? "",
      person.is_active === 1 ? "1" : "0",
      person.created_at,
      person.updated_at
    ]);

    const csvLines = [headers, ...rows].map((row) => row.map(this.escapeCsvCell).join(","));
    return `${csvLines.join("\n")}\n`;
  }

  getTeamDashboardReport(filters: TeamDashboardFilters = {}): TeamDashboardReport {
    if (filters.start_date) {
      this.ensureDateLike(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureDateLike(filters.end_date, "end_date");
    }

    const inactiveDays = filters.inactive_days ?? 30;
    if (!Number.isInteger(inactiveDays) || inactiveDays < 0) {
      throw new Error("inactive_days must be a non-negative integer");
    }

    const totals = this.activities.getTeamTotalPoints(filters);
    return {
      team_total_points: totals.team_total_points,
      total_logs: totals.total_logs,
      leaderboard: this.activities.getLeaderboard(filters),
      contribution_distribution: this.activities.getContributionDistribution(filters),
      weekly_activity_volume: this.activities.getWeeklyActivityVolume(filters),
      inactive_members: this.activities.getInactiveMembers(inactiveDays)
    };
  }

  exportAllLogsGroupedByPersonCsv(filters: TeamDashboardFilters = {}): string {
    const rows = this.collectAllLogsForExport(filters).sort(
      (a, b) =>
        a.person_name.localeCompare(b.person_name) ||
        a.activity_date.localeCompare(b.activity_date) ||
        a.id - b.id
    );
    const headers = [
      "person_id",
      "person_name",
      "index_num",
      "log_id",
      "activity_date",
      "group_name",
      "total_points",
      "notes"
    ];

    const personMap = new Map<number, Person>();
    for (const person of this.collectAllPersons()) {
      personMap.set(person.id, person);
    }

    const csvRows = rows.map((row) => {
      const person = personMap.get(row.person_id);
      return [
        String(row.person_id),
        row.person_name,
        person?.index_num ?? "",
        String(row.id),
        row.activity_date,
        row.group_name,
        String(row.total_points),
        row.notes ?? ""
      ];
    });

    return this.rowsToCsv(headers, csvRows);
  }

  exportPersonLogsExcel(personId: number, filters: TeamDashboardFilters = {}): Buffer {
    this.ensurePositiveInteger(personId, "person id");
    const person = this.persons.getById(personId);
    if (!person) {
      throw new Error("Person not found");
    }

    const rows = this.collectAllLogsForExport({ ...filters, person_id: personId }).sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id
    );
    const headers = ["log_id", "activity_date", "group_name", "activity_types", "total_points", "notes"];
    const workbookRows = rows.map((row) => [
      String(row.id),
      row.activity_date,
      row.group_name,
      row.activity_types_summary,
      String(row.total_points),
      row.notes ?? ""
    ]);

    return this.rowsToWorkbook(`${person.index_num} ${person.name} Report`, headers, workbookRows);
  }

  exportLeaderboardCsv(filters: TeamDashboardFilters = {}): string {
    const report = this.getTeamDashboardReport(filters);
    const headers = [
      "person_id",
      "index_num",
      "name",
      "role",
      "participation_percent",
      "log_count",
      "total_points",
      "last_activity_date"
    ];
    const rows = report.leaderboard.map((row) => [
      String(row.person_id),
      row.index_num,
      row.name,
      row.role,
      String(row.participation_percent),
      String(row.log_count),
      String(row.total_points),
      row.last_activity_date ?? ""
    ]);
    return this.rowsToCsv(headers, rows);
  }

  exportScoreConfigChangeHistoryCsv(): string {
    const versions = this.listScoreConfigVersions();
    const audits = this.audits.listByEntityNames([
      "score_config_versions",
      "activity_groups",
      "activity_types"
    ]);

    const headers = [
      "record_type",
      "entity_name",
      "entity_id",
      "action",
      "version_id",
      "version_name",
      "is_active",
      "created_at",
      "payload_json"
    ];

    const versionRows = versions.map((version) => [
      "score_config_version",
      "score_config_versions",
      String(version.id),
      version.is_active === 1 ? "active_snapshot" : "snapshot",
      String(version.id),
      version.name,
      version.is_active === 1 ? "1" : "0",
      version.created_at,
      version.notes ?? ""
    ]);

    const auditRows = audits.map((audit) => [
      "audit_event",
      audit.entity_name,
      audit.entity_id === null ? "" : String(audit.entity_id),
      audit.action,
      "",
      "",
      "",
      audit.created_at,
      audit.payload_json ?? ""
    ]);

    return this.rowsToCsv(headers, [...versionRows, ...auditRows]);
  }

  importPersonsCsv(csvText: string): { inserted: number; updated: number; skipped: number } {
    if (!csvText.trim()) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    const parsed = this.parseCsv(csvText);
    if (parsed.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    const header = parsed[0].map((cell) => cell.trim().toLowerCase());
    const expected = ["index_num", "name", "role", "phone_number", "is_active"];
    const indexOf = (column: string) => header.indexOf(column);
    for (const col of expected) {
      if (indexOf(col) === -1) {
        throw new Error(`CSV missing required column: ${col}`);
      }
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const runImport = this.db.transaction(() => {
      for (let i = 1; i < parsed.length; i += 1) {
        const row = parsed[i];
        if (row.every((cell) => !cell.trim())) {
          skipped += 1;
          continue;
        }

        const indexNum = this.requiredTrim(row[indexOf("index_num")] ?? "", "index_num", 40);
        const name = this.requiredTrim(row[indexOf("name")] ?? "", "name", 160);
        const role = this.requiredTrim(row[indexOf("role")] ?? "", "role", 80);
        const phoneNumber = this.optionalTrim(row[indexOf("phone_number")] ?? null, 40);
        const isActiveRaw = (row[indexOf("is_active")] ?? "1").trim().toLowerCase();
        const isActive = isActiveRaw === "1" || isActiveRaw === "true" || isActiveRaw === "yes";

        const existing = this.persons.getByIndexNum(indexNum);
        if (!existing) {
          this.persons.create({
            index_num: indexNum,
            name,
            role,
            phone_number: phoneNumber,
            is_active: isActive
          });
          inserted += 1;
        } else {
          this.persons.update({
            id: existing.id,
            name,
            role,
            phone_number: phoneNumber,
            is_active: isActive
          });
          updated += 1;
        }
      }
    });

    runImport();
    this.logAudit("persons", null, "import_csv", { inserted, updated, skipped });

    return { inserted, updated, skipped };
  }

  createScoreConfigVersion(input: ScoreConfigVersionCreateInput): ScoreConfigVersion {
    const payload: ScoreConfigVersionCreateInput = {
      name: this.requiredTrim(input.name, "score config name", 120),
      notes: this.optionalTrim(input.notes, 2000),
      is_active: input.is_active ?? false
    };

    const configVersion = this.db.transaction((normalized: ScoreConfigVersionCreateInput) => {
      const created = this.scoreConfigs.create(normalized);
      this.scoreConfigs.ensureSingleActiveVersion();
      this.assertSingleActiveScoreConfigVersion();
      return this.scoreConfigs.getById(created.id) as ScoreConfigVersion;
    })(payload);

    this.logAudit("score_config_versions", configVersion.id, "create", configVersion);
    return configVersion;
  }

  activateScoreConfigVersion(id: number): ScoreConfigVersion {
    this.ensurePositiveInteger(id, "config version id");

    const activated = this.scoreConfigs.activate(id);
    this.assertSingleActiveScoreConfigVersion();
    this.logAudit("score_config_versions", activated.id, "activate", activated);
    return activated;
  }

  deactivateScoreConfigVersion(id: number): ScoreConfigVersion {
    this.ensurePositiveInteger(id, "config version id");

    const version = this.scoreConfigs.getById(id);
    if (!version) {
      throw new Error("Score config version not found");
    }

    if (version.is_active === 0) {
      return version;
    }

    const fallbackVersionId = this.scoreConfigs.findLatestOtherVersionId(id);
    if (!fallbackVersionId) {
      throw new Error("Cannot deactivate the only score config version");
    }

    this.scoreConfigs.activate(fallbackVersionId);
    const deactivated = this.scoreConfigs.deactivate(id);
    this.assertSingleActiveScoreConfigVersion();
    this.logAudit("score_config_versions", id, "deactivate", {
      id,
      fallback_activated_id: fallbackVersionId
    });
    return deactivated;
  }

  deleteScoreConfigVersion(id: number): void {
    this.ensurePositiveInteger(id, "config version id");

    const version = this.scoreConfigs.getById(id);
    if (!version) {
      throw new Error("Score config version not found");
    }

    if (version.is_active === 1) {
      throw new Error("Cannot delete the active score config version");
    }

    const usedByLogs = this.scoreConfigs.countUsageInLogs(id);
    const usedByScores = this.scoreConfigs.countUsageInScores(id);
    if (usedByLogs > 0 || usedByScores > 0) {
      throw new Error("Cannot delete a version that is used by activity logs");
    }

    this.scoreConfigs.delete(id);
    this.scoreConfigs.ensureSingleActiveVersion();
    this.assertSingleActiveScoreConfigVersion();
    this.logAudit("score_config_versions", id, "delete", { id });
  }

  exportScoreConfigVersionJson(id: number): string {
    const snapshot = this.getScoreConfigSnapshot(id);
    if (!snapshot) {
      throw new Error("Score config version not found");
    }

    const jsonDocument: ScoreConfigJsonDocument = {
      version: {
        id: snapshot.version.id,
        name: snapshot.version.name,
        notes: snapshot.version.notes,
        isActive: snapshot.version.is_active === 1,
        createdAt: snapshot.version.created_at,
        activatedAt: snapshot.version.activated_at
      },
      groups: snapshot.groups.map((group) => ({
        code: group.code,
        name: group.name,
        baseXp: group.base_xp,
        sortOrder: group.sort_order,
        isActive: group.is_active === 1,
        activities: group.activity_types
          .filter((activityType) => activityType.parent_activity_type_id === null)
          .map((activityType) => ({
            code: activityType.code,
            name: activityType.name,
            percent: activityType.percent_of_group_base,
            fixedPoints: activityType.fixed_points,
            sortOrder: activityType.sort_order,
            isActive: activityType.is_active === 1,
            subActivities: group.activity_types
              .filter((child) => child.parent_activity_type_id === activityType.id)
              .map((child) => ({
                code: child.code,
                name: child.name,
                percent: child.percent_of_parent_type ?? child.percent_of_group_base,
                fixedPoints: child.fixed_points,
                sortOrder: child.sort_order,
                isActive: child.is_active === 1
              }))
          }))
      }))
    };

    return `${JSON.stringify(jsonDocument, null, 2)}\n`;
  }

  importScoreConfigVersionJson(
    jsonText: string,
    options: { activate?: boolean } = {}
  ): ScoreConfigSnapshot {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Invalid JSON document");
    }

    const document = parsed as Partial<ScoreConfigJsonDocument>;
    if (!document.version || !document.groups || !Array.isArray(document.groups)) {
      throw new Error("JSON document must contain version and groups");
    }

    const snapshot = this.createScoreConfigSnapshot({
      name: this.requiredTrim(document.version.name ?? "", "score config name", 120),
      notes: this.optionalTrim(document.version.notes ?? null, 2000),
      activate: options.activate ?? Boolean(document.version.isActive),
      groups: document.groups.map((group, groupIndex) => ({
        code: this.requiredTrim(group.code ?? "", "group code", 40).toUpperCase(),
        name: this.requiredTrim(group.name ?? "", "group name", 120),
        base_xp: this.ensureNonNegativeNumber(Number(group.baseXp ?? 0), "baseXp"),
        sort_order: group.sortOrder ?? groupIndex,
        is_active: group.isActive ?? true,
        activity_types: this.flattenImportedActivities(group.activities ?? [])
      }))
    });

    this.logAudit("score_config_versions", snapshot.version.id, "import_json", {
      id: snapshot.version.id,
      name: snapshot.version.name
    });

    return snapshot;
  }

  createActivityGroup(input: ActivityGroupCreateInput): ActivityGroup {
    this.ensurePositiveInteger(input.config_version_id, "config version id");

    const payload: ActivityGroupCreateInput = {
      config_version_id: input.config_version_id,
      code: this.requiredTrim(input.code, "group code", 40).toUpperCase(),
      name: this.requiredTrim(input.name, "group name", 120),
      base_xp: this.ensureNonNegativeNumber(input.base_xp, "base_xp"),
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true
    };

    const group = this.activities.createGroup(payload);
    this.logAudit("activity_groups", group.id, "create", group);
    return group;
  }

  createActivityType(input: ActivityTypeCreateInput): ActivityType {
    this.ensurePositiveInteger(input.group_id, "group id");

    const fixedPoints = input.fixed_points ?? null;
    const percentOfBase = input.percent_of_group_base ?? 0;
    const percentOfParent = input.percent_of_parent_type ?? null;
    const parentActivityTypeId = input.parent_activity_type_id ?? null;

    if (parentActivityTypeId !== null) {
      this.ensurePositiveInteger(parentActivityTypeId, "parent_activity_type_id");
    }

    if (fixedPoints === null && percentOfBase <= 0 && (percentOfParent === null || percentOfParent <= 0)) {
      throw new Error("Either fixed_points, percent_of_group_base, or percent_of_parent_type must be greater than 0");
    }

    if (percentOfParent !== null && (percentOfParent < 0 || percentOfParent > 100)) {
      throw new Error("percent_of_parent_type must be between 0 and 100");
    }

    if (parentActivityTypeId !== null) {
      const parent = this.activities.getTypeById(parentActivityTypeId);
      if (!parent) {
        throw new Error("Parent activity type not found");
      }

      if (parent.group_id !== input.group_id) {
        throw new Error("Parent activity type must belong to the same group");
      }
    }

    const payload: ActivityTypeCreateInput = {
      group_id: input.group_id,
      code: this.requiredTrim(input.code, "type code", 40).toUpperCase(),
      name: this.requiredTrim(input.name, "type name", 120),
      percent_of_group_base: this.ensureNonNegativeNumber(percentOfBase, "percent_of_group_base"),
      parent_activity_type_id: parentActivityTypeId,
      percent_of_parent_type:
        percentOfParent === null ? null : this.ensureNonNegativeNumber(percentOfParent, "percent_of_parent_type"),
      fixed_points:
        fixedPoints === null ? null : this.ensureNonNegativeNumber(fixedPoints, "fixed_points"),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0
    };

    const activityType = this.activities.createType(payload);
    this.logAudit("activity_types", activityType.id, "create", activityType);
    return activityType;
  }

  getActivityEntryCatalog(): ActivityEntryCatalog {
    const activeVersion = this.scoreConfigs.getActive();
    if (!activeVersion) {
      return {
        config_version_id: 0,
        config_version_name: "No active scoring config",
        groups: []
      };
    }

    return {
      config_version_id: activeVersion.id,
      config_version_name: activeVersion.name,
      groups: this.activities.listGroupsWithTypesByConfigVersion(activeVersion.id).map((group) => ({
        ...group,
        activity_types: group.activity_types.filter((activityType) => activityType.is_active === 1)
      }))
    };
  }

  previewActivityScores(input: {
    group_id: number;
    items: ActivityLogItemEntryInput[];
  }): ActivityScorePreview {
    this.ensurePositiveInteger(input.group_id, "group id");
    const normalizedItems = this.normalizeActivityItems(input.items);

    const group = this.activities.getGroupById(input.group_id);
    if (!group) {
      throw new Error("Activity group not found");
    }

    const previewItems = normalizedItems.map((item) => {
      const activityType = this.activities.getTypeById(item.activity_type_id);
      if (!activityType) {
        throw new Error(`Activity type not found: ${item.activity_type_id}`);
      }

      if (activityType.group_id !== group.id) {
        throw new Error(`Activity type ${activityType.code} does not belong to selected group`);
      }

      const pointsPerUnitRaw = this.computePointsPerUnitForType(activityType, group.base_xp);

      const points_per_unit = this.roundScore(pointsPerUnitRaw);
      const quantity = this.roundScore(item.quantity ?? 1);
      const total_points = this.roundScore(points_per_unit * quantity);

      return {
        activity_type_id: item.activity_type_id,
        quantity,
        points_per_unit,
        total_points
      };
    });

    return {
      group_id: group.id,
      config_version_id: group.config_version_id,
      total_points: this.roundScore(previewItems.reduce((sum, item) => sum + item.total_points, 0)),
      items: previewItems
    };
  }

  createActivityLogWithItems(input: ActivityLogSaveInput): ActivityLogDetail {
    const payload = this.normalizeActivityLogSaveInput(input);
    const created = this.createActivityLogWithItemsInternal(payload);
    this.logAudit("activity_logs", created.log.id, "create_with_items", created);
    return created;
  }

  createActivityLogsBatch(input: ActivityLogBatchSaveInput): ActivityLogBatchSaveResult {
    if (input.person_ids.length === 0) {
      throw new Error("Batch requires at least one person");
    }

    const uniquePersonIds = [...new Set(input.person_ids)];
    for (const personId of uniquePersonIds) {
      this.ensurePositiveInteger(personId, "person id");
    }

    const createdLogIds: number[] = [];
    for (const personId of uniquePersonIds) {
      const created = this.createActivityLogWithItemsInternal({
        person_id: personId,
        activity_date: input.activity_date,
        group_id: input.group_id,
        notes: input.notes,
        items: input.items
      });

      createdLogIds.push(created.log.id);
      this.logAudit("activity_logs", created.log.id, "batch_create", created);
    }

    return {
      created: createdLogIds.length,
      log_ids: createdLogIds
    };
  }

  getPreviousLogTemplateForPerson(
    request: ActivityLogDuplicateTemplateRequest
  ): ActivityLogSaveInput | null {
    this.ensurePositiveInteger(request.person_id, "person id");

    const latest = this.activities.getLatestLogByPerson(request.person_id);
    if (!latest) {
      return null;
    }

    const detail = this.activities.getLogDetailById(latest.id);
    if (!detail) {
      return null;
    }

    return {
      person_id: request.person_id,
      activity_date: request.activity_date ?? latest.activity_date,
      group_id: latest.group_id,
      notes: latest.notes,
      items: detail.items.map((item) => ({
        activity_type_id: item.activity_type_id,
        quantity: item.quantity,
        notes: item.notes
      }))
    };
  }

  listActivityLogsForAdmin(filters: ActivityLogListFilters): PaginatedResult<ActivityLogListItem> {
    if (filters.person_id !== undefined) {
      this.ensurePositiveInteger(filters.person_id, "person id filter");
    }

    if (filters.group_id !== undefined) {
      this.ensurePositiveInteger(filters.group_id, "group id filter");
    }

    if (filters.activity_type_id !== undefined) {
      this.ensurePositiveInteger(filters.activity_type_id, "activity type id filter");
    }

    if (filters.start_date) {
      this.ensureDateLike(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureDateLike(filters.end_date, "end_date");
    }

    return this.activities.listLogsForAdmin({
      ...filters,
      page: this.normalizePage(filters.page),
      pageSize: this.normalizePageSize(filters.pageSize)
    });
  }

  getActivityLogDetail(id: number): ActivityLogDetail | null {
    this.ensurePositiveInteger(id, "activity log id");
    const detail = this.activities.getLogDetailById(id);
    if (!detail) {
      return null;
    }

    return {
      ...detail,
      items: detail.items.map((item) => ({
        ...item,
        formula:
          item.type_fixed_points !== null
            ? `${item.quantity} × ${item.type_fixed_points} = ${item.total_points}`
            : item.type_percent_of_parent_type !== null && item.parent_activity_type_name
              ? `${item.quantity} × ((` +
                `${item.parent_fixed_points !== null ? item.parent_fixed_points : `${item.group_base_xp} × ${item.parent_percent_of_group_base ?? 0}% / 100`}` +
                `) × ${item.type_percent_of_parent_type}% / 100) = ${item.total_points}`
            : `${item.quantity} × (${item.group_base_xp} × ${item.type_percent_of_group_base}% / 100) = ${item.total_points}`
      }))
    };
  }

  getPersonTransparency(personId: number, filters: PersonTransparencyFilters = {}): PersonTransparencyData {
    this.ensurePositiveInteger(personId, "person id");

    const person = this.persons.getById(personId);
    if (!person) {
      throw new Error("Person not found");
    }

    if (filters.group_id !== undefined) {
      this.ensurePositiveInteger(filters.group_id, "group id filter");
    }

    if (filters.activity_type_id !== undefined) {
      this.ensurePositiveInteger(filters.activity_type_id, "activity type id filter");
    }

    if (filters.start_date) {
      this.ensureDateLike(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureDateLike(filters.end_date, "end_date");
    }

    const sortBy = filters.sort_by ?? "activity_date";
    if (!["activity_date", "total_points", "created_at"].includes(sortBy)) {
      throw new Error("Invalid sort_by");
    }

    const sortDir = filters.sort_dir ?? "desc";
    if (!["asc", "desc"].includes(sortDir)) {
      throw new Error("Invalid sort_dir");
    }

    const page = this.normalizePage(filters.page);
    const pageSize = this.normalizePageSize(filters.pageSize);

    const normalizedFilters: PersonTransparencyFilters = {
      start_date: filters.start_date,
      end_date: filters.end_date,
      group_id: filters.group_id,
      activity_type_id: filters.activity_type_id,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      pageSize
    };

    const logs = this.activities.listLogsForAdmin({
      person_id: personId,
      start_date: normalizedFilters.start_date,
      end_date: normalizedFilters.end_date,
      group_id: normalizedFilters.group_id,
      activity_type_id: normalizedFilters.activity_type_id,
      sort_by: normalizedFilters.sort_by,
      sort_dir: normalizedFilters.sort_dir,
      page: normalizedFilters.page,
      pageSize: normalizedFilters.pageSize
    });

    return {
      person_id: personId,
      summary: this.activities.getPersonTransparencySummary(personId, normalizedFilters),
      breakdown_by_group: this.activities.getPersonBreakdownByGroup(personId, normalizedFilters),
      breakdown_by_type: this.activities.getPersonBreakdownByType(personId, normalizedFilters),
      trend_by_date: this.activities.getPersonTrendByDate(personId, normalizedFilters),
      logs
    };
  }

  updateActivityLogWithItems(input: { id: number } & ActivityLogSaveInput): ActivityLogDetail {
    this.ensurePositiveInteger(input.id, "activity log id");
    const existing = this.activities.getLogById(input.id);
    if (!existing) {
      throw new Error("Activity log not found");
    }

    const payload = this.normalizeActivityLogSaveInput(input);
    const updated = this.db.transaction(() => {
      this.activities.updateLog({
        id: input.id,
        activity_date: payload.activity_date,
        group_id: payload.group_id,
        notes: payload.notes ?? null
      });

      this.activities.removeLogItemsByLogId(input.id);
      for (const item of payload.items) {
        this.addActivityLogItem({
          activity_log_id: input.id,
          activity_type_id: item.activity_type_id,
          quantity: item.quantity ?? 1,
          notes: item.notes ?? null
        });
      }

      const detail = this.activities.getLogDetailById(input.id);
      if (!detail) {
        throw new Error("Failed to load updated activity log");
      }

      return detail;
    })();

    this.logAudit("activity_logs", updated.log.id, "update_with_items", updated);
    return updated;
  }

  deleteActivityLog(id: number): { ok: true } {
    this.ensurePositiveInteger(id, "activity log id");

    const existing = this.activities.getLogDetailById(id);
    if (!existing) {
      throw new Error("Activity log not found");
    }

    this.activities.removeLog(id);
    this.logAudit("activity_logs", id, "delete", existing);
    return { ok: true };
  }

  createActivityLog(input: ActivityLogCreateInput): ActivityLog {
    this.ensurePositiveInteger(input.person_id, "person id");
    this.ensurePositiveInteger(input.group_id, "group id");
    this.ensureDateLike(input.activity_date, "activity_date");

    const person = this.persons.getById(input.person_id);
    if (!person) {
      throw new Error("Person not found");
    }

    const group = this.activities.getGroupById(input.group_id);
    if (!group) {
      throw new Error("Activity group not found");
    }

    const activityLog = this.activities.createLog({
      person_id: input.person_id,
      group_id: input.group_id,
      activity_date: input.activity_date,
      notes: this.optionalTrim(input.notes, 2000)
    });

    this.logAudit("activity_logs", activityLog.id, "create", activityLog);
    return activityLog;
  }

  listActivityLogs(filters: ActivityLogFilters): PaginatedResult<ActivityLog> {
    if (filters.person_id !== undefined) {
      this.ensurePositiveInteger(filters.person_id, "person id filter");
    }

    if (filters.group_id !== undefined) {
      this.ensurePositiveInteger(filters.group_id, "group id filter");
    }

    if (filters.start_date) {
      this.ensureDateLike(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureDateLike(filters.end_date, "end_date");
    }

    return this.activities.listLogs({
      ...filters,
      page: this.normalizePage(filters.page),
      pageSize: this.normalizePageSize(filters.pageSize)
    });
  }

  addActivityLogItem(input: ActivityLogItemCreateInput): {
    item: ActivityLogItem;
    score: ActivityLogItemScore;
  } {
    this.ensurePositiveInteger(input.activity_log_id, "activity_log_id");
    this.ensurePositiveInteger(input.activity_type_id, "activity_type_id");

    const quantity = input.quantity ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("quantity must be greater than 0");
    }

    const createAndScore = this.db.transaction((payload: ActivityLogItemCreateInput) => {
      const log = this.activities.getLogById(payload.activity_log_id);
      if (!log) {
        throw new Error("Activity log not found");
      }

      const activityType = this.activities.getTypeById(payload.activity_type_id);
      if (!activityType) {
        throw new Error("Activity type not found");
      }

      if (log.group_id !== activityType.group_id) {
        throw new Error("Activity type does not belong to activity log group");
      }

      const item = this.activities.createLogItem(payload);
      const score = this.recalculateActivityLogItemScore(item.id);
      this.logAudit("activity_log_items", item.id, "create", { item, score });
      return { item, score };
    });

    return createAndScore({
      activity_log_id: input.activity_log_id,
      activity_type_id: input.activity_type_id,
      quantity,
      notes: this.optionalTrim(input.notes, 2000)
    });
  }

  recalculateActivityLogItemScore(activityLogItemId: number): ActivityLogItemScore {
    this.ensurePositiveInteger(activityLogItemId, "activity_log_item_id");

    const context = this.activities.getLogItemWithContext(activityLogItemId);
    if (!context) {
      throw new Error("Activity log item not found");
    }

    if (context.log_group_id !== context.type_group_id) {
      throw new Error("Invalid scoring context: log group and type group mismatch");
    }

    const parentPointsRaw =
      context.parent_type_fixed_points !== null
        ? context.parent_type_fixed_points
        : context.parent_type_percent_of_group_base !== null
          ? (context.group_base_xp * context.parent_type_percent_of_group_base) / 100
          : null;

    const pointsPerUnitRaw =
      context.type_fixed_points !== null
        ? context.type_fixed_points
        : context.type_parent_activity_type_id !== null
          ? ((parentPointsRaw ?? 0) * (context.type_percent_of_parent_type ?? 0)) / 100
          : (context.group_base_xp * context.type_percent_of_group_base) / 100;

    const pointsPerUnit = this.roundScore(pointsPerUnitRaw);
    const quantity = this.roundScore(context.quantity);
    const totalPoints = this.roundScore(pointsPerUnit * quantity);

    const score = this.activities.upsertLogItemScore({
      activity_log_item_id: activityLogItemId,
      points_per_unit: pointsPerUnit,
      quantity,
      total_points: totalPoints,
      config_version_id: context.config_version_id
    });

    this.logAudit("activity_log_item_scores", score.id, "recalculate", score);
    return score;
  }

  recalculateScoresForConfigVersion(configVersionId: number): { updated: number } {
    this.ensurePositiveInteger(configVersionId, "config_version_id");

    const items = this.activities.listLogItemsWithContextByConfigVersion(configVersionId);
    for (const item of items) {
      this.recalculateActivityLogItemScore(item.id);
    }

    this.logAudit("activity_log_item_scores", null, "recalculate_bulk", {
      config_version_id: configVersionId,
      updated: items.length
    });

    return { updated: items.length };
  }

  recalculateAll(): RecalculationRunResult {
    return this.runRecalculation("all", {});
  }

  recalculatePerson(personId: number): RecalculationRunResult {
    this.ensurePositiveInteger(personId, "person id");
    return this.runRecalculation("person", { person_id: personId });
  }

  recalculateDateRange(from: string, to: string): RecalculationRunResult {
    this.ensureDateLike(from, "from");
    this.ensureDateLike(to, "to");
    if (Date.parse(from) > Date.parse(to)) {
      throw new Error("from must be before or equal to to");
    }

    return this.runRecalculation("date_range", { from, to, start_date: from, end_date: to });
  }

  private normalizePage(page?: number): number {
    if (page === undefined) {
      return 1;
    }

    if (!Number.isInteger(page) || page <= 0) {
      throw new Error("page must be a positive integer");
    }

    return page;
  }

  private runRecalculation(
    scope: "all" | "person" | "date_range",
    filters: { person_id?: number; start_date?: string; end_date?: string; from?: string; to?: string }
  ): RecalculationRunResult {
    const active = this.getSingleActiveScoreConfigVersionOrThrow();

    const targets = this.activities.listLogItemIdsForRecalculation({
      person_id: filters.person_id,
      start_date: filters.start_date,
      end_date: filters.end_date
    });

    const affectedLogs = new Set<number>();
    for (const target of targets) {
      affectedLogs.add(target.activity_log_id);
      this.recalculateActivityLogItemScore(target.id);
    }

    const result: RecalculationRunResult = {
      scope,
      config_version_id: active.id,
      updated_items: targets.length,
      affected_logs: affectedLogs.size,
      filters:
        scope === "all"
          ? undefined
          : {
              person_id: filters.person_id,
              from: filters.from,
              to: filters.to
            }
    };

    this.logAudit("recalculation_runs", null, "run", result);
    return result;
  }

  private getSingleActiveScoreConfigVersionOrThrow(): ScoreConfigVersion {
    this.scoreConfigs.ensureSingleActiveVersion();
    this.assertSingleActiveScoreConfigVersion();

    const active = this.scoreConfigs.getActive();
    if (!active) {
      throw new Error("No active score config version found");
    }

    return active;
  }

  private assertSingleActiveScoreConfigVersion(): void {
    const activeCount = this.scoreConfigs.countActive();
    if (activeCount !== 1) {
      throw new Error(`Invalid score config state: expected exactly one active version, got ${activeCount}`);
    }
  }

  private normalizePageSize(pageSize?: number): number {
    if (pageSize === undefined) {
      return DEFAULT_PAGE_SIZE;
    }

    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > MAX_PAGE_SIZE) {
      throw new Error(`pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
    }

    return pageSize;
  }

  private requiredTrim(value: string, label: string, maxLength: number): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new Error(`${label} is required`);
    }

    if (normalized.length > maxLength) {
      throw new Error(`${label} must be <= ${maxLength} characters`);
    }

    return normalized;
  }

  private optionalTrim(value: string | null | undefined, maxLength: number): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new Error(`optional text must be <= ${maxLength} characters`);
    }

    return normalized;
  }

  private ensurePositiveInteger(value: number, label: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
  }

  private ensureDateLike(value: string, label: string): void {
    if (Number.isNaN(Date.parse(value))) {
      throw new Error(`${label} must be a valid date string`);
    }
  }

  private ensureNonNegativeNumber(value: number, label: string): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative number`);
    }

    return value;
  }

  private roundScore(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private normalizeScoreConfigSnapshotInput(
    input: ScoreConfigSnapshotCreateInput
  ): ScoreConfigSnapshotCreateInput {
    const name = this.requiredTrim(input.name, "score config name", 120);
    const notes = this.optionalTrim(input.notes, 2000);

    const seenGroupCodes = new Set<string>();
    const seenGroupNames = new Set<string>();

    const groups = input.groups.map((group, groupIndex) => {
      const code = this.requiredTrim(group.code, "group code", 40).toUpperCase();
      const nameValue = this.requiredTrim(group.name, "group name", 120);
      const codeKey = code.toUpperCase();
      const nameKey = nameValue.toLowerCase();

      if (seenGroupCodes.has(codeKey)) {
        throw new Error(`Duplicate group code: ${code}`);
      }

      if (seenGroupNames.has(nameKey)) {
        throw new Error(`Duplicate group name: ${nameValue}`);
      }

      seenGroupCodes.add(codeKey);
      seenGroupNames.add(nameKey);

      const seenTypeCodes = new Set<string>();
      const seenTypeNames = new Set<string>();

      const activityTypes = group.activity_types.map((activityType, typeIndex) => {
        const activityCode = this.requiredTrim(activityType.code, "activity code", 40).toUpperCase();
        const activityName = this.requiredTrim(activityType.name, "activity name", 120);
        const typeCodeKey = activityCode.toUpperCase();
        const typeNameKey = activityName.toLowerCase();

        if (seenTypeCodes.has(typeCodeKey)) {
          throw new Error(`Duplicate activity code in ${code}: ${activityCode}`);
        }

        if (seenTypeNames.has(typeNameKey)) {
          throw new Error(`Duplicate activity name in ${code}: ${activityName}`);
        }

        seenTypeCodes.add(typeCodeKey);
        seenTypeNames.add(typeNameKey);

        const percentValue =
          activityType.percent_of_group_base === undefined
            ? 0
            : this.ensureFiniteNumber(activityType.percent_of_group_base, "percent_of_group_base");
        const parentActivityTypeCode = activityType.parent_activity_type_code
          ? this.requiredTrim(activityType.parent_activity_type_code, "parent activity code", 40).toUpperCase()
          : null;
        const percentOfParentValue =
          activityType.percent_of_parent_type === undefined || activityType.percent_of_parent_type === null
            ? null
            : this.ensureFiniteNumber(activityType.percent_of_parent_type, "percent_of_parent_type");
        const fixedPointsValue =
          activityType.fixed_points === undefined || activityType.fixed_points === null
            ? null
            : this.ensureNonNegativeNumber(activityType.fixed_points, "fixed_points");

        if (percentValue < 0 || percentValue > 100) {
          throw new Error(`Invalid percent for ${activityCode}. Percent must be between 0 and 100`);
        }

        if (percentOfParentValue !== null && (percentOfParentValue < 0 || percentOfParentValue > 100)) {
          throw new Error(`Invalid percent_of_parent_type for ${activityCode}. Percent must be between 0 and 100`);
        }

        if (fixedPointsValue === null && percentValue <= 0 && (percentOfParentValue === null || percentOfParentValue <= 0)) {
          throw new Error(`Activity ${activityCode} must define a valid percent or fixed points`);
        }

        if (parentActivityTypeCode === activityCode) {
          throw new Error(`Activity ${activityCode} cannot be parent of itself`);
        }

        if (parentActivityTypeCode && !seenTypeCodes.has(parentActivityTypeCode)) {
          throw new Error(`Parent activity code ${parentActivityTypeCode} must be defined before ${activityCode}`);
        }

        return {
          code: activityCode,
          name: activityName,
          percent_of_group_base: percentValue,
          parent_activity_type_code: parentActivityTypeCode,
          percent_of_parent_type: percentOfParentValue ?? undefined,
          fixed_points: fixedPointsValue,
          is_active: activityType.is_active ?? true,
          sort_order: activityType.sort_order ?? typeIndex
        };
      });

      return {
        code,
        name: nameValue,
        base_xp: this.ensureNonNegativeNumber(group.base_xp, "base_xp"),
        sort_order: group.sort_order ?? groupIndex,
        is_active: group.is_active ?? true,
        activity_types: activityTypes
      };
    });

    return {
      source_version_id: input.source_version_id ?? null,
      name,
      notes,
      activate: input.activate ?? false,
      apply_to_historical_logs: input.apply_to_historical_logs ?? false,
      groups
    };
  }

  private normalizeActivityItems(items: ActivityLogItemEntryInput[]): ActivityLogItemEntryInput[] {
    if (items.length === 0) {
      throw new Error("At least one activity item is required");
    }

    const seenTypeIds = new Set<number>();
    return items.map((item) => {
      this.ensurePositiveInteger(item.activity_type_id, "activity_type_id");
      if (seenTypeIds.has(item.activity_type_id)) {
        throw new Error(`Duplicate activity type in entry: ${item.activity_type_id}`);
      }

      seenTypeIds.add(item.activity_type_id);
      const quantity = item.quantity ?? 1;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("quantity must be greater than 0");
      }

      return {
        activity_type_id: item.activity_type_id,
        quantity,
        notes: this.optionalTrim(item.notes, 2000)
      };
    });
  }

  private normalizeActivityLogSaveInput(input: ActivityLogSaveInput): ActivityLogSaveInput {
    this.ensurePositiveInteger(input.person_id, "person id");
    this.ensurePositiveInteger(input.group_id, "group id");
    this.ensureDateLike(input.activity_date, "activity_date");

    const person = this.persons.getById(input.person_id);
    if (!person) {
      throw new Error("Person not found");
    }

    const group = this.activities.getGroupById(input.group_id);
    if (!group) {
      throw new Error("Activity group not found");
    }

    const normalizedItems = this.normalizeActivityItems(input.items);
    for (const item of normalizedItems) {
      const activityType = this.activities.getTypeById(item.activity_type_id);
      if (!activityType) {
        throw new Error(`Activity type not found: ${item.activity_type_id}`);
      }

      if (activityType.group_id !== group.id) {
        throw new Error(`Activity type ${activityType.code} does not belong to selected group`);
      }
    }

    return {
      person_id: input.person_id,
      activity_date: input.activity_date,
      group_id: input.group_id,
      notes: this.optionalTrim(input.notes, 2000),
      items: normalizedItems
    };
  }

  private computePointsPerUnitForType(activityType: ActivityType, groupBaseXp: number): number {
    if (activityType.fixed_points !== null) {
      return activityType.fixed_points;
    }

    if (activityType.parent_activity_type_id !== null) {
      const parentType = this.activities.getTypeById(activityType.parent_activity_type_id);
      if (!parentType) {
        throw new Error(`Parent activity type not found for ${activityType.code}`);
      }

      if (parentType.group_id !== activityType.group_id) {
        throw new Error(`Parent activity type group mismatch for ${activityType.code}`);
      }

      const parentPoints = this.computePointsPerUnitForType(parentType, groupBaseXp);
      const percentOfParent = activityType.percent_of_parent_type ?? 0;
      return (parentPoints * percentOfParent) / 100;
    }

    return (groupBaseXp * activityType.percent_of_group_base) / 100;
  }

  private flattenImportedActivities(
    activities: NonNullable<ScoreConfigJsonDocument["groups"]>[number]["activities"]
  ): ScoreConfigActivityTypeInput[] {
    const flattened: ScoreConfigActivityTypeInput[] = [];

    const visit = (
      activity: NonNullable<ScoreConfigJsonDocument["groups"]>[number]["activities"][number],
      sortOrder: number,
      parentActivityTypeCode: string | null
    ) => {
      const code = this.requiredTrim(activity.code ?? "", "activity code", 40).toUpperCase();
      const percentValue = activity.percent === undefined ? undefined : Number(activity.percent);

      flattened.push({
        code,
        name: this.requiredTrim(activity.name ?? "", "activity name", 120),
        percent_of_group_base: parentActivityTypeCode === null ? percentValue : 0,
        parent_activity_type_code: parentActivityTypeCode,
        percent_of_parent_type: parentActivityTypeCode === null ? undefined : percentValue,
        fixed_points:
          activity.fixedPoints === undefined || activity.fixedPoints === null
            ? null
            : Number(activity.fixedPoints),
        sort_order: activity.sortOrder ?? sortOrder,
        is_active: activity.isActive ?? true
      });

      const subActivities = activity.subActivities ?? [];
      subActivities.forEach((subActivity, subIndex) => {
        visit(subActivity, subActivity.sortOrder ?? subIndex, code);
      });
    };

    activities.forEach((activity, index) => visit(activity, activity.sortOrder ?? index, null));
    return flattened;
  }

  private createActivityLogWithItemsInternal(input: ActivityLogSaveInput): ActivityLogDetail {
    const payload = this.normalizeActivityLogSaveInput(input);

    return this.db.transaction(() => {
      const log = this.activities.createLog({
        person_id: payload.person_id,
        activity_date: payload.activity_date,
        group_id: payload.group_id,
        notes: payload.notes ?? null
      });

      for (const item of payload.items) {
        this.addActivityLogItem({
          activity_log_id: log.id,
          activity_type_id: item.activity_type_id,
          quantity: item.quantity ?? 1,
          notes: item.notes ?? null
        });
      }

      const detail = this.activities.getLogDetailById(log.id);
      if (!detail) {
        throw new Error("Failed to load created activity log");
      }

      return detail;
    })();
  }

  private ensureFiniteNumber(value: number, label: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a valid number`);
    }

    return value;
  }

  private collectAllPersons(): Person[] {
    const firstPage = this.listPersons({ page: 1, pageSize: MAX_PAGE_SIZE });
    const allItems = [...firstPage.items];
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const nextPage = this.listPersons({ page, pageSize: MAX_PAGE_SIZE });
      allItems.push(...nextPage.items);
    }
    return allItems;
  }

  private collectAllLogsForExport(filters: TeamDashboardFilters & { person_id?: number }) {
    const firstPage = this.activities.listLogsForAdmin({
      person_id: filters.person_id,
      start_date: filters.start_date,
      end_date: filters.end_date,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      sort_by: "activity_date",
      sort_dir: "desc"
    });

    const allItems = [...firstPage.items];
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const nextPage = this.activities.listLogsForAdmin({
        person_id: filters.person_id,
        start_date: filters.start_date,
        end_date: filters.end_date,
        page,
        pageSize: MAX_PAGE_SIZE,
        sort_by: "activity_date",
        sort_dir: "desc"
      });
      allItems.push(...nextPage.items);
    }

    return allItems;
  }

  private rowsToCsv(headers: string[], rows: string[][]): string {
    const csvLines = [headers, ...rows].map((row) => row.map(this.escapeCsvCell).join(","));
    return `${csvLines.join("\n")}\n`;
  }

  private rowsToWorkbook(sheetName: string, headers: string[], rows: string[][]): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    const normalizedSheetName = this.normalizeWorksheetName(sheetName);

    worksheet["!cols"] = headers.map((header, columnIndex) => ({
      wch: Math.min(
        40,
        Math.max(
          header.length,
          ...rows.map((row) => (row[columnIndex] ?? "").length),
          12
        )
      )
    }));

    if (worksheet["!ref"]) {
      worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, normalizedSheetName);
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  private normalizeWorksheetName(name: string): string {
    const cleaned = name.replace(/[\\/?*:]/g, " ").replace(/\[|\]/g, " ").trim().replace(/\s+/g, " ");
    return (cleaned || "Report").slice(0, 31);
  }

  private escapeCsvCell(value: string): string {
    const escaped = value.replaceAll('"', '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  }

  private parseCsv(csvText: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i += 1) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }

        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i += 1;
        }

        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  private logAudit(
    entityName: string,
    entityId: number | null,
    action: string,
    payload: unknown
  ): void {
    this.audits.create({
      entity_name: entityName,
      entity_id: entityId,
      action,
      payload_json: JSON.stringify(payload)
    });
  }
}

export function createTeamActivityService(db: SqliteDatabase): TeamActivityService {
  return new TeamActivityService(
    new PersonRepository(db),
    new ScoreConfigRepository(db),
    new ActivityRepository(db),
    new AuditRepository(db),
    db
  );
}
