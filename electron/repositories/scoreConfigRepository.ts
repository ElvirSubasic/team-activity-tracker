import type { SqliteDatabase } from "../db/client";
import type {
  ScoreConfigVersion,
  ScoreConfigVersionCreateInput
} from "../types";

export class ScoreConfigRepository {
  constructor(private readonly db: SqliteDatabase) {}

  findLatestOtherVersionId(excludeId: number): number | null {
    const row = this.db
      .prepare(
        `SELECT id
         FROM score_config_versions
         WHERE id != @excludeId
         ORDER BY is_active DESC, created_at DESC, id DESC
         LIMIT 1`
      )
      .get({ excludeId }) as { id: number } | undefined;

    return row?.id ?? null;
  }

  deactivate(id: number): ScoreConfigVersion {
    const result = this.db
      .prepare(
        `UPDATE score_config_versions
         SET is_active = 0,
             activated_at = NULL
         WHERE id = @id`
      )
      .run({ id });

    if (result.changes === 0) {
      throw new Error("Score config version not found");
    }

    return this.getById(id) as ScoreConfigVersion;
  }

  countUsageInScores(configVersionId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM activity_log_item_scores
         WHERE config_version_id = @config_version_id`
      )
      .get({ config_version_id: configVersionId }) as { count: number };

    return row.count;
  }

  countUsageInLogs(configVersionId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM activity_logs al
         INNER JOIN activity_groups ag ON ag.id = al.group_id
         WHERE ag.config_version_id = @config_version_id`
      )
      .get({ config_version_id: configVersionId }) as { count: number };

    return row.count;
  }

  delete(id: number): void {
    const result = this.db
      .prepare("DELETE FROM score_config_versions WHERE id = @id")
      .run({ id });

    if (result.changes === 0) {
      throw new Error("Score config version not found");
    }
  }

  countActive(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(1) AS count
         FROM score_config_versions
         WHERE is_active = 1`
      )
      .get() as { count: number };

    return row.count;
  }

  list(): ScoreConfigVersion[] {
    return this.db
      .prepare(
        `SELECT *
         FROM score_config_versions
         ORDER BY is_active DESC, created_at DESC, id DESC`
      )
      .all() as ScoreConfigVersion[];
  }

  create(input: ScoreConfigVersionCreateInput): ScoreConfigVersion {
    const runInsert = this.db.transaction((payload: ScoreConfigVersionCreateInput) => {
      if (payload.is_active) {
        this.db
          .prepare(
            `UPDATE score_config_versions
             SET is_active = 0,
                 activated_at = NULL
             WHERE is_active = 1`
          )
          .run();
      }

      const result = this.db
        .prepare(
          `INSERT INTO score_config_versions (name, is_active, created_at, activated_at, notes)
           VALUES (@name, @is_active, datetime('now'),
             CASE WHEN @is_active = 1 THEN datetime('now') ELSE NULL END,
             @notes)`
        )
        .run({
          name: payload.name,
          is_active: payload.is_active ? 1 : 0,
          notes: payload.notes ?? null
        });

      return Number(result.lastInsertRowid);
    });

    const insertedId = runInsert(input);
    return this.getById(insertedId) as ScoreConfigVersion;
  }

  getById(id: number): ScoreConfigVersion | null {
    const row = this.db.prepare("SELECT * FROM score_config_versions WHERE id = @id").get({ id });
    return (row as ScoreConfigVersion | undefined) ?? null;
  }

  getActive(): ScoreConfigVersion | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM score_config_versions
         WHERE is_active = 1
         ORDER BY activated_at DESC, id DESC
         LIMIT 1`
      )
      .get();

    return (row as ScoreConfigVersion | undefined) ?? null;
  }

  activate(id: number): ScoreConfigVersion {
    const runActivate = this.db.transaction((configVersionId: number) => {
      this.db
        .prepare(
          `UPDATE score_config_versions
           SET is_active = 0,
               activated_at = NULL
           WHERE is_active = 1`
        )
        .run();

      const result = this.db
        .prepare(
          `UPDATE score_config_versions
           SET is_active = 1,
               activated_at = datetime('now')
           WHERE id = @id`
        )
        .run({ id: configVersionId });

      if (result.changes === 0) {
        throw new Error("Score config version not found");
      }
    });

    runActivate(id);
    return this.getById(id) as ScoreConfigVersion;
  }

  ensureSingleActiveVersion(): void {
    const activeCount = this.countActive();
    if (activeCount === 1) {
      return;
    }

    if (activeCount > 1) {
      const latestActive = this.getActive();
      if (!latestActive) {
        throw new Error("Invalid score config state: multiple active versions");
      }

      this.activate(latestActive.id);
      return;
    }

    const newest = this.db
      .prepare(
        `SELECT *
         FROM score_config_versions
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get() as ScoreConfigVersion | undefined;

    if (newest) {
      this.activate(newest.id);
    }
  }
}
