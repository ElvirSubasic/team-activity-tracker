import type { SqliteDatabase } from "../db/client";
import type { AuditEvent, AuditEventCreateInput } from "../types";

export class AuditRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: AuditEventCreateInput): AuditEvent {
    const result = this.db
      .prepare(
        `INSERT INTO audit_events (entity_name, entity_id, action, payload_json, created_at)
         VALUES (@entity_name, @entity_id, @action, @payload_json, datetime('now'))`
      )
      .run({
        entity_name: input.entity_name,
        entity_id: input.entity_id ?? null,
        action: input.action,
        payload_json: input.payload_json ?? null
      });

    const row = this.db
      .prepare("SELECT * FROM audit_events WHERE id = @id")
      .get({ id: Number(result.lastInsertRowid) });

    return row as AuditEvent;
  }

  listByEntityNames(entityNames: string[]): AuditEvent[] {
    if (entityNames.length === 0) {
      return [];
    }

    const placeholders = entityNames.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT *
         FROM audit_events
         WHERE entity_name IN (${placeholders})
         ORDER BY created_at DESC, id DESC`
      )
      .all(...entityNames) as AuditEvent[];
  }
}
