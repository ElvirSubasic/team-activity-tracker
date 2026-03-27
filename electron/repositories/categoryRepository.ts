import type { SqliteDatabase } from "../db/client";
import type { Category } from "../types";

export class CategoryRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(name: string): Category {
    const result = this.db
      .prepare("INSERT INTO categories (name) VALUES (@name)")
      .run({ name });

    return this.getById(Number(result.lastInsertRowid)) as Category;
  }

  list(): Category[] {
    return this.db
      .prepare("SELECT id, name, created_at FROM categories ORDER BY name COLLATE NOCASE ASC")
      .all() as Category[];
  }

  getById(id: number): Category | null {
    const row = this.db
      .prepare("SELECT id, name, created_at FROM categories WHERE id = @id")
      .get({ id });

    return (row as Category | undefined) ?? null;
  }

  update(id: number, name: string): Category {
    this.db.prepare("UPDATE categories SET name = @name WHERE id = @id").run({ id, name });

    const category = this.getById(id);
    if (!category) {
      throw new Error("Category not found");
    }

    return category;
  }

  remove(id: number): void {
    const result = this.db.prepare("DELETE FROM categories WHERE id = @id").run({ id });

    if (result.changes === 0) {
      throw new Error("Category not found");
    }
  }
}
