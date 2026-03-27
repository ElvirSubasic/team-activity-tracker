import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "../db/client";
import { createTeamActivityService, type TeamActivityService } from "./teamActivityService";

function createTestContext(): {
  db: SqliteDatabase;
  service: TeamActivityService;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-activity-db-test-"));
  const dbPath = path.join(tempDir, "test.sqlite3");
  const db = openDatabase(dbPath);
  const service = createTeamActivityService(db);

  return {
    db,
    service,
    cleanup: () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    cleanup?.();
  }
});

describe("TeamActivityService", () => {
  it("creates migration-managed tables idempotently", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const tables = ctx.db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (
             'schema_migrations',
             'persons',
             'score_config_versions',
             'activity_groups',
             'activity_types',
             'activity_logs',
             'activity_log_items',
             'activity_log_item_scores',
             'audit_events'
           )
         ORDER BY name`
      )
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(9);

    const migrationsCount = (
      ctx.db.prepare("SELECT COUNT(1) AS count FROM schema_migrations").get() as { count: number }
    ).count;

    expect(migrationsCount).toBeGreaterThanOrEqual(2);
  });

  it("supports deterministic scoring and recalculation", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({
      index_num: "MK-001",
      name: "Alice",
      role: "Coordinator"
    });

    const config = ctx.service.createScoreConfigVersion({
      name: "marketing-semester-v1",
      is_active: true
    });

    const group = ctx.service.createActivityGroup({
      config_version_id: config.id,
      code: "CONTENT",
      name: "Content",
      base_xp: 20
    });

    const type = ctx.service.createActivityType({
      group_id: group.id,
      code: "POST",
      name: "Post",
      percent_of_group_base: 25
    });

    const log = ctx.service.createActivityLog({
      person_id: person.id,
      group_id: group.id,
      activity_date: "2026-03-25"
    });

    const itemWithScore = ctx.service.addActivityLogItem({
      activity_log_id: log.id,
      activity_type_id: type.id,
      quantity: 3
    });

    expect(itemWithScore.score.points_per_unit).toBe(5);
    expect(itemWithScore.score.total_points).toBe(15);

    const rescored = ctx.service.recalculateActivityLogItemScore(itemWithScore.item.id);
    expect(rescored.total_points).toBe(15);
  });

  it("calculates percentage scores deterministically with rounding", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({
      index_num: "ROUND-1",
      name: "Rounder",
      role: "Member"
    });

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Rounding Config",
      activate: true,
      groups: [
        {
          code: "MEDIA",
          name: "Media",
          base_xp: 99,
          activity_types: [{ code: "REEL", name: "Reel", percent_of_group_base: 33.3333 }]
        }
      ]
    });

    const group = snapshot.groups[0];
    const type = group.activity_types[0];
    const detail = ctx.service.createActivityLogWithItems({
      person_id: person.id,
      activity_date: "2026-03-18",
      group_id: group.id,
      items: [{ activity_type_id: type.id, quantity: 3 }]
    });

    expect(detail.items[0].points_per_unit).toBe(33);
    expect(detail.items[0].total_points).toBe(99);
  });

  it("paginates logs with default page size 10", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({
      index_num: "MK-002",
      name: "Bob",
      role: "Member"
    });

    const config = ctx.service.createScoreConfigVersion({
      name: "config-paging",
      is_active: true
    });

    const group = ctx.service.createActivityGroup({
      config_version_id: config.id,
      code: "EVENT",
      name: "Events",
      base_xp: 10
    });

    for (let i = 0; i < 12; i += 1) {
      ctx.service.createActivityLog({
        person_id: person.id,
        group_id: group.id,
        activity_date: `2026-03-${String(10 + i).padStart(2, "0")}`
      });
    }

    const page1 = ctx.service.listActivityLogs({ person_id: person.id });
    expect(page1.pageSize).toBe(10);
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(12);

    const page2 = ctx.service.listActivityLogs({ person_id: person.id, page: 2 });
    expect(page2.items).toHaveLength(2);
  });

  it("supports person deactivate/reactivate and CSV import/export", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({
      index_num: "MK-900",
      name: "CSV User",
      role: "Analyst",
      phone_number: "1234",
      is_active: true
    });

    const deactivated = ctx.service.deactivatePerson(person.id);
    expect(deactivated.is_active).toBe(0);

    const reactivated = ctx.service.reactivatePerson(person.id);
    expect(reactivated.is_active).toBe(1);

    for (let i = 1; i <= 11; i += 1) {
      ctx.service.createPerson({
        index_num: `MK-A-${i}`,
        name: `Person ${i}`,
        role: "Member"
      });
    }

    const paged = ctx.service.listPersons({});
    expect(paged.pageSize).toBe(10);
    expect(paged.items).toHaveLength(10);

    const csv = ctx.service.exportPersonsCsv({});
    expect(csv.includes("index_num,name,role,phone_number,is_active")).toBe(true);

    const imported = ctx.service.importPersonsCsv(
      "index_num,name,role,phone_number,is_active\nMK-900,CSV User Updated,Lead,999,true\nMK-901,New User,Intern,,false\n"
    );

    expect(imported.updated).toBe(1);
    expect(imported.inserted).toBe(1);

    const updated = ctx.service.getPerson(person.id);
    expect(updated?.name).toBe("CSV User Updated");
    expect(updated?.role).toBe("Lead");
  });

  it("creates immutable score config versions, validates duplicates, and supports json import/export", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Marketing Semester v1",
      notes: "Initial model",
      activate: true,
      groups: [
        {
          code: "PADLET",
          name: "Padlet",
          base_xp: 200,
          activity_types: [
            {
              code: "POST",
              name: "Post",
              percent_of_group_base: 100
            },
            {
              code: "LIKE",
              name: "Like",
              fixed_points: 5
            }
          ]
        }
      ]
    });

    expect(snapshot.version.is_active).toBe(1);
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0].activity_types).toHaveLength(2);

    const exportedJson = ctx.service.exportScoreConfigVersionJson(snapshot.version.id);
    expect(exportedJson).toContain('"groups"');
    expect(exportedJson).toContain('"PADLET"');

    const imported = ctx.service.importScoreConfigVersionJson(exportedJson, { activate: false });
    expect(imported.version.id).not.toBe(snapshot.version.id);
    expect(imported.version.is_active).toBe(0);

    const versions = ctx.service.listScoreConfigVersions();
    expect(versions).toHaveLength(2);

    const activated = ctx.service.activateScoreConfigVersion(imported.version.id);
    expect(activated.is_active).toBe(1);

    const refreshedOriginal = ctx.service.getScoreConfigSnapshot(snapshot.version.id);
    const refreshedImported = ctx.service.getScoreConfigSnapshot(imported.version.id);
    expect(refreshedOriginal?.version.is_active).toBe(0);
    expect(refreshedImported?.version.is_active).toBe(1);

    expect(() =>
      ctx.service.createScoreConfigSnapshot({
        name: "Broken",
        groups: [
          {
            code: "PADLET",
            name: "Padlet",
            base_xp: 100,
            activity_types: [
              { code: "POST", name: "Post", percent_of_group_base: 50 },
              { code: "POST", name: "Post Duplicate", percent_of_group_base: 30 }
            ]
          }
        ]
      })
    ).toThrow("Duplicate activity code");

    expect(() =>
      ctx.service.createScoreConfigSnapshot({
        name: "Broken Percent",
        groups: [
          {
            code: "INSTAGRAM",
            name: "Instagram",
            base_xp: 100,
            activity_types: [{ code: "POST", name: "Post", percent_of_group_base: 150 }]
          }
        ]
      })
    ).toThrow("Invalid percent");
  });

  it("recalculates deterministically across all scopes and keeps recalculation audit trail", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const p1 = ctx.service.createPerson({ index_num: "R-1", name: "R Alpha", role: "Member" });
    const p2 = ctx.service.createPerson({ index_num: "R-2", name: "R Beta", role: "Member" });

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Recalc Config",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [{ code: "POST", name: "Post", percent_of_group_base: 25 }]
        }
      ]
    });

    const group = snapshot.groups[0];
    const postType = group.activity_types[0];

    const l1 = ctx.service.createActivityLogWithItems({
      person_id: p1.id,
      activity_date: "2026-03-20",
      group_id: group.id,
      items: [{ activity_type_id: postType.id, quantity: 2 }]
    });
    const l2 = ctx.service.createActivityLogWithItems({
      person_id: p1.id,
      activity_date: "2026-03-22",
      group_id: group.id,
      items: [{ activity_type_id: postType.id, quantity: 1 }]
    });
    const l3 = ctx.service.createActivityLogWithItems({
      person_id: p2.id,
      activity_date: "2026-03-25",
      group_id: group.id,
      items: [{ activity_type_id: postType.id, quantity: 4 }]
    });

    expect(l1.total_points).toBe(50);
    expect(l2.total_points).toBe(25);
    expect(l3.total_points).toBe(100);

    const all = ctx.service.recalculateAll();
    expect(all.scope).toBe("all");
    expect(all.updated_items).toBe(3);
    expect(all.affected_logs).toBe(3);

    const personOnly = ctx.service.recalculatePerson(p1.id);
    expect(personOnly.scope).toBe("person");
    expect(personOnly.updated_items).toBe(2);
    expect(personOnly.affected_logs).toBe(2);
    expect(personOnly.filters?.person_id).toBe(p1.id);

    const rangeOnly = ctx.service.recalculateDateRange("2026-03-21", "2026-03-26");
    expect(rangeOnly.scope).toBe("date_range");
    expect(rangeOnly.updated_items).toBe(2);
    expect(rangeOnly.affected_logs).toBe(2);

    const runAuditCount = (
      ctx.db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM audit_events
           WHERE entity_name = 'recalculation_runs'
             AND action = 'run'`
        )
        .get() as { count: number }
    ).count;

    expect(runAuditCount).toBe(3);
  });

  it("switches versions deterministically and can apply new version to historical logs", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({ index_num: "V-1", name: "Versioned", role: "Member" });

    const v1 = ctx.service.createScoreConfigSnapshot({
      name: "Version 1",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [{ code: "POST", name: "Post", percent_of_group_base: 50 }]
        }
      ]
    });

    const v1Group = v1.groups[0];
    const v1Post = v1Group.activity_types[0];

    const initial = ctx.service.createActivityLogWithItems({
      person_id: person.id,
      activity_date: "2026-03-10",
      group_id: v1Group.id,
      items: [{ activity_type_id: v1Post.id, quantity: 2 }]
    });
    expect(initial.total_points).toBe(100);

    const v2 = ctx.service.createScoreConfigSnapshot({
      source_version_id: v1.version.id,
      name: "Version 2",
      activate: true,
      apply_to_historical_logs: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 200,
          activity_types: [{ code: "POST", name: "Post", percent_of_group_base: 50 }]
        }
      ]
    });

    const activeCount = (
      ctx.db
        .prepare("SELECT COUNT(1) AS count FROM score_config_versions WHERE is_active = 1")
        .get() as { count: number }
    ).count;
    expect(activeCount).toBe(1);

    const activeVersion = ctx.service.listScoreConfigVersions().find((version) => version.is_active === 1);
    expect(activeVersion?.id).toBe(v2.version.id);

    const afterSwitch = ctx.service.getActivityLogDetail(initial.log.id);
    expect(afterSwitch).not.toBeNull();
    expect(afterSwitch?.total_points).toBe(200);

    const appliedAudit = (
      ctx.db
        .prepare(
          `SELECT COUNT(1) AS count
           FROM audit_events
           WHERE entity_name = 'score_config_versions'
             AND action = 'apply_to_historical_logs'
             AND entity_id = @entity_id`
        )
        .get({ entity_id: v2.version.id }) as { count: number }
    ).count;

    expect(appliedAudit).toBe(1);
  });

  it("supports activity log workflow with preview, duplicate, batch, list, update, and delete", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const p1 = ctx.service.createPerson({ index_num: "W-1", name: "Alpha", role: "Member" });
    const p2 = ctx.service.createPerson({ index_num: "W-2", name: "Beta", role: "Member" });

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Workflow Config",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [
            { code: "POST", name: "Post", percent_of_group_base: 50 },
            { code: "LIKE", name: "Like", fixed_points: 5 }
          ]
        }
      ]
    });

    const group = snapshot.groups[0];
    const postType = group.activity_types.find((t) => t.code === "POST");
    const likeType = group.activity_types.find((t) => t.code === "LIKE");
    expect(postType).toBeTruthy();
    expect(likeType).toBeTruthy();

    const preview = ctx.service.previewActivityScores({
      group_id: group.id,
      items: [
        { activity_type_id: postType!.id, quantity: 2 },
        { activity_type_id: likeType!.id, quantity: 3 }
      ]
    });

    expect(preview.total_points).toBe(115);

    const created = ctx.service.createActivityLogWithItems({
      person_id: p1.id,
      activity_date: "2026-03-26",
      group_id: group.id,
      notes: "initial",
      items: [
        { activity_type_id: postType!.id, quantity: 2 },
        { activity_type_id: likeType!.id, quantity: 3 }
      ]
    });

    expect(created.total_points).toBe(115);

    const duplicateTemplate = ctx.service.getPreviousLogTemplateForPerson({ person_id: p1.id });
    expect(duplicateTemplate?.items).toHaveLength(2);

    const batch = ctx.service.createActivityLogsBatch({
      person_ids: [p1.id, p2.id],
      activity_date: "2026-03-27",
      group_id: group.id,
      items: [{ activity_type_id: likeType!.id, quantity: 4 }]
    });

    expect(batch.created).toBe(2);

    const list = ctx.service.listActivityLogsForAdmin({
      person_id: p1.id,
      page: 1,
      pageSize: 10
    });

    expect(list.pageSize).toBe(10);
    expect(list.total).toBe(2);

    const updated = ctx.service.updateActivityLogWithItems({
      id: created.log.id,
      person_id: p1.id,
      activity_date: "2026-03-26",
      group_id: group.id,
      notes: "updated",
      items: [{ activity_type_id: postType!.id, quantity: 1 }]
    });

    expect(updated.total_points).toBe(50);

    const detail = ctx.service.getActivityLogDetail(created.log.id);
    expect(detail?.items).toHaveLength(1);

    const deleted = ctx.service.deleteActivityLog(created.log.id);
    expect(deleted.ok).toBe(true);
    expect(ctx.service.getActivityLogDetail(created.log.id)).toBeNull();
  });

  it("provides person transparency metrics and explain-score details", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const p1 = ctx.service.createPerson({ index_num: "T-1", name: "Trans A", role: "Member" });
    const p2 = ctx.service.createPerson({ index_num: "T-2", name: "Trans B", role: "Member" });

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Transparency Config",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [
            { code: "POST", name: "Post", percent_of_group_base: 50 },
            { code: "LIKE", name: "Like", fixed_points: 10 }
          ]
        }
      ]
    });

    const group = snapshot.groups[0];
    const post = group.activity_types.find((type) => type.code === "POST");
    const like = group.activity_types.find((type) => type.code === "LIKE");
    expect(post).toBeTruthy();
    expect(like).toBeTruthy();

    const log1 = ctx.service.createActivityLogWithItems({
      person_id: p1.id,
      activity_date: "2026-03-01",
      group_id: group.id,
      items: [{ activity_type_id: post!.id, quantity: 2 }]
    });

    const log2 = ctx.service.createActivityLogWithItems({
      person_id: p1.id,
      activity_date: "2026-03-02",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 3 }]
    });

    ctx.service.createActivityLogWithItems({
      person_id: p2.id,
      activity_date: "2026-03-03",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 1 }]
    });

    expect(log1.total_points).toBe(100);
    expect(log2.total_points).toBe(30);

    const transparency = ctx.service.getPersonTransparency(p1.id, {
      sort_by: "total_points",
      sort_dir: "desc",
      page: 1,
      pageSize: 10
    });

    expect(transparency.summary.total_points).toBe(130);
    expect(transparency.summary.log_count).toBe(2);
    expect(transparency.summary.last_activity_date).toBe("2026-03-02");
    expect(transparency.summary.participation_percent).toBeCloseTo(66.67, 2);
    expect(transparency.logs.pageSize).toBe(10);
    expect(transparency.logs.items[0].total_points).toBeGreaterThanOrEqual(
      transparency.logs.items[1].total_points
    );
    expect(transparency.breakdown_by_group).toHaveLength(1);
    expect(transparency.breakdown_by_type.length).toBeGreaterThanOrEqual(2);
    expect(transparency.trend_by_date).toHaveLength(2);

    const explain = ctx.service.getActivityLogDetail(log1.log.id);
    expect(explain).not.toBeNull();
    expect(explain?.items[0].config_version_id).toBe(snapshot.version.id);
    expect(explain?.items[0].formula).toContain("100 × 50%");
  });

  it("builds team dashboards and exports report files", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const alpha = ctx.service.createPerson({ index_num: "D-1", name: "Alpha", role: "Lead" });
    const beta = ctx.service.createPerson({ index_num: "D-2", name: "Beta", role: "Member" });
    const gamma = ctx.service.createPerson({ index_num: "D-3", name: "Gamma", role: "Member" });
    const delta = ctx.service.createPerson({ index_num: "D-4", name: "Delta", role: "Member" });

    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Dashboard Config",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [
            { code: "POST", name: "Post", percent_of_group_base: 50 },
            { code: "LIKE", name: "Like", fixed_points: 10 }
          ]
        }
      ]
    });

    const group = snapshot.groups[0];
    const post = group.activity_types.find((type) => type.code === "POST");
    const like = group.activity_types.find((type) => type.code === "LIKE");
    expect(post).toBeTruthy();
    expect(like).toBeTruthy();

    ctx.service.createActivityLogWithItems({
      person_id: alpha.id,
      activity_date: "2026-03-01",
      group_id: group.id,
      items: [{ activity_type_id: post!.id, quantity: 2 }]
    });
    ctx.service.createActivityLogWithItems({
      person_id: alpha.id,
      activity_date: "2026-03-08",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 1 }]
    });
    ctx.service.createActivityLogWithItems({
      person_id: beta.id,
      activity_date: "2026-03-08",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 3 }]
    });
    ctx.service.createActivityLogWithItems({
      person_id: beta.id,
      activity_date: "2026-02-20",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 1 }]
    });
    ctx.service.createActivityLogWithItems({
      person_id: gamma.id,
      activity_date: "2026-02-15",
      group_id: group.id,
      items: [{ activity_type_id: like!.id, quantity: 2 }]
    });
    ctx.service.createActivityLogWithItems({
      person_id: delta.id,
      activity_date: "2026-03-15",
      group_id: group.id,
      items: [{ activity_type_id: post!.id, quantity: 1 }]
    });

    const report = ctx.service.getTeamDashboardReport({ inactive_days: 15 });
    expect(report.team_total_points).toBe(220);
    expect(report.total_logs).toBe(6);
    expect(report.leaderboard[0].person_id).toBe(alpha.id);
    expect(report.leaderboard.map((row) => row.person_id)).toEqual([alpha.id, delta.id, beta.id, gamma.id]);
    expect(report.leaderboard.find((row) => row.person_id === beta.id)?.participation_percent).toBeCloseTo(33.33, 2);
    expect(report.contribution_distribution).toHaveLength(4);
    expect(report.contribution_distribution.map((row) => row.person_id)).toEqual([alpha.id, delta.id, beta.id, gamma.id]);
    expect(report.weekly_activity_volume.length).toBeGreaterThanOrEqual(2);
    expect(report.weekly_activity_volume[0]?.week_label).toBe("2026-W10");
    expect(report.weekly_activity_volume.at(-1)?.week_label).toBe("2026-W06");
    expect(report.inactive_members.map((member) => member.index_num)).toEqual(["D-3", "D-1", "D-2"]);

    const allLogsCsv = ctx.service.exportAllLogsGroupedByPersonCsv({});
    expect(allLogsCsv).toContain("person_id,person_name,index_num,log_id");
    expect(allLogsCsv).toContain("Alpha");

    const personWorkbook = XLSX.read(ctx.service.exportPersonLogsExcel(alpha.id, {}), { type: "buffer" });
    const personRows = XLSX.utils.sheet_to_json<string[]>(personWorkbook.Sheets[personWorkbook.SheetNames[0]], {
      header: 1,
      raw: false
    });
    expect(personRows[0]).toEqual(["log_id", "activity_date", "group_name", "activity_types", "total_points", "notes"]);
    expect(personRows.some((row) => row.includes("Content"))).toBe(true);
    expect(personRows.some((row) => row.includes("Post × 2"))).toBe(true);

    const leaderboardCsv = ctx.service.exportLeaderboardCsv({});
    expect(leaderboardCsv).toContain("participation_percent");
    expect(leaderboardCsv).toContain("Alpha");

    const configHistoryCsv = ctx.service.exportScoreConfigChangeHistoryCsv();
    expect(configHistoryCsv).toContain("record_type,entity_name,entity_id,action");
    expect(configHistoryCsv).toContain("score_config_versions");
  });

  it("applies pagination, filters, and sorting consistently across activity admin views and exports", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const person = ctx.service.createPerson({ index_num: "PAG-1", name: "Pager", role: "Lead" });
    const snapshot = ctx.service.createScoreConfigSnapshot({
      name: "Paging Config",
      activate: true,
      groups: [
        {
          code: "CONTENT",
          name: "Content",
          base_xp: 100,
          activity_types: [
            { code: "POST", name: "Post", percent_of_group_base: 50 },
            { code: "LIKE", name: "Like", fixed_points: 5 }
          ]
        }
      ]
    });

    const group = snapshot.groups[0];
    const post = group.activity_types.find((item) => item.code === "POST");
    const like = group.activity_types.find((item) => item.code === "LIKE");
    expect(post).toBeTruthy();
    expect(like).toBeTruthy();

    for (let i = 0; i < 12; i += 1) {
      ctx.service.createActivityLogWithItems({
        person_id: person.id,
        activity_date: `2026-03-${String(i + 1).padStart(2, "0")}`,
        group_id: group.id,
        items: [
          { activity_type_id: i % 2 === 0 ? post!.id : like!.id, quantity: i + 1 }
        ]
      });
    }

    const firstPage = ctx.service.listActivityLogsForAdmin({
      person_id: person.id,
      sort_by: "total_points",
      sort_dir: "desc"
    });

    expect(firstPage.pageSize).toBe(10);
    expect(firstPage.items).toHaveLength(10);
    expect(firstPage.items[0].total_points).toBeGreaterThanOrEqual(firstPage.items[1].total_points);

    const filtered = ctx.service.getPersonTransparency(person.id, {
      activity_type_id: like!.id,
      page: 1,
      pageSize: 10,
      sort_by: "activity_date",
      sort_dir: "asc"
    });

    expect(filtered.logs.items.every((item) => item.group_id === group.id)).toBe(true);
    expect(filtered.logs.pageSize).toBe(10);

    const filteredWorkbook = XLSX.read(
      ctx.service.exportPersonLogsExcel(person.id, {
      start_date: "2026-03-05",
      end_date: "2026-03-06"
      }),
      { type: "buffer" }
    );
    const filteredRows = XLSX.utils.sheet_to_json<string[]>(filteredWorkbook.Sheets[filteredWorkbook.SheetNames[0]], {
      header: 1,
      raw: false
    });
    const activityDates = filteredRows.slice(1).map((row) => row[1]);
    const activityTypes = filteredRows.slice(1).map((row) => row[3]);
    expect(activityDates).toContain("2026-03-05");
    expect(activityDates).toContain("2026-03-06");
    expect(activityDates).not.toContain("2026-03-04");
    expect(activityDates[0]).toBe("2026-03-06");
    expect(activityDates[1]).toBe("2026-03-05");
    expect(activityTypes.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
  });
});
