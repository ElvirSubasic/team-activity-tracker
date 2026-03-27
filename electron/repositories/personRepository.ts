import type { SqliteDatabase } from "../db/client";
import type { PaginatedResult, Person, PersonCreateInput, PersonListFilters, PersonUpdateInput } from "../types";

type CountRow = { count: number };

type SqlParams = Record<string, number | string>;

export class PersonRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: PersonCreateInput): Person {
    const result = this.db
      .prepare(
        `INSERT INTO persons (index_num, name, role, phone_number, is_active, created_at, updated_at)
         VALUES (@index_num, @name, @role, @phone_number, @is_active, datetime('now'), datetime('now'))`
      )
      .run({
        index_num: input.index_num,
        name: input.name,
        role: input.role,
        phone_number: input.phone_number ?? null,
        is_active: input.is_active ?? true ? 1 : 0
      });

    return this.getById(Number(result.lastInsertRowid)) as Person;
  }

  getById(id: number): Person | null {
    const row = this.db.prepare("SELECT * FROM persons WHERE id = @id").get({ id });
    return (row as Person | undefined) ?? null;
  }

  getByIndexNum(indexNum: string): Person | null {
    const row = this.db
      .prepare("SELECT * FROM persons WHERE index_num = @index_num")
      .get({ index_num: indexNum });

    return (row as Person | undefined) ?? null;
  }

  update(input: PersonUpdateInput): Person {
    const existing = this.getById(input.id);
    if (!existing) {
      throw new Error("Person not found");
    }

    this.db
      .prepare(
        `UPDATE persons
         SET name = @name,
             role = @role,
             phone_number = @phone_number,
             is_active = @is_active,
             updated_at = datetime('now')
         WHERE id = @id`
      )
      .run({
        id: input.id,
        name: input.name ?? existing.name,
        role: input.role ?? existing.role,
        phone_number:
          input.phone_number === undefined ? existing.phone_number : (input.phone_number ?? null),
        is_active: input.is_active === undefined ? existing.is_active : input.is_active ? 1 : 0
      });

    const updated = this.getById(input.id);
    if (!updated) {
      throw new Error("Person not found");
    }

    return updated;
  }

  list(filters: PersonListFilters): PaginatedResult<Person> {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.text) {
      clauses.push("(name LIKE @text OR index_num LIKE @text OR role LIKE @text)");
      params.text = `%${filters.text}%`;
    }

    if (filters.is_active !== undefined) {
      clauses.push("is_active = @is_active");
      params.is_active = filters.is_active ? 1 : 0;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;
    const offset = (page - 1) * pageSize;

    const items = this.db
      .prepare(
        `SELECT *
         FROM persons
         ${where}
         ORDER BY name COLLATE NOCASE ASC, id ASC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: pageSize, offset }) as Person[];

    const total = (
      this.db.prepare(`SELECT COUNT(1) AS count FROM persons ${where}`).get(params) as CountRow
    ).count;

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
    };
  }

  remove(id: number): void {
    const result = this.db.prepare("DELETE FROM persons WHERE id = @id").run({ id });
    if (result.changes === 0) {
      throw new Error("Person not found");
    }
  }
}
