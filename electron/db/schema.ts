import type Database from "better-sqlite3";

type Migration = {
  id: number;
  name: string;
  sql: string;
};

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init_expense_tracker_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
      CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_title ON transactions(title);
    `
  },
  {
    id: 2,
    name: "init_team_activity_tables",
    sql: `
      CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        index_num TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        phone_number TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS score_config_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        activated_at TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS activity_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_version_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        base_xp REAL NOT NULL CHECK (base_xp >= 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        FOREIGN KEY (config_version_id) REFERENCES score_config_versions(id) ON DELETE CASCADE,
        UNIQUE (config_version_id, code)
      );

      CREATE TABLE IF NOT EXISTS activity_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        percent_of_group_base REAL NOT NULL DEFAULT 0 CHECK (percent_of_group_base >= 0),
        fixed_points REAL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE,
        UNIQUE (group_id, code)
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        activity_date TEXT NOT NULL,
        group_id INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (person_id) REFERENCES persons(id),
        FOREIGN KEY (group_id) REFERENCES activity_groups(id)
      );

      CREATE TABLE IF NOT EXISTS activity_log_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_log_id INTEGER NOT NULL,
        activity_type_id INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (activity_log_id) REFERENCES activity_logs(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_type_id) REFERENCES activity_types(id)
      );

      CREATE TABLE IF NOT EXISTS activity_log_item_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_log_item_id INTEGER NOT NULL UNIQUE,
        points_per_unit REAL NOT NULL,
        quantity REAL NOT NULL CHECK (quantity > 0),
        total_points REAL NOT NULL,
        config_version_id INTEGER NOT NULL,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (activity_log_item_id) REFERENCES activity_log_items(id) ON DELETE CASCADE,
        FOREIGN KEY (config_version_id) REFERENCES score_config_versions(id)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_name TEXT NOT NULL,
        entity_id INTEGER,
        action TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_persons_name_id ON persons(name COLLATE NOCASE, id);
      CREATE INDEX IF NOT EXISTS idx_persons_is_active ON persons(is_active);

      CREATE INDEX IF NOT EXISTS idx_score_config_versions_active_created
        ON score_config_versions(is_active, created_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_activity_groups_config_sort
        ON activity_groups(config_version_id, sort_order ASC, id ASC);
      CREATE INDEX IF NOT EXISTS idx_activity_types_group_sort
        ON activity_types(group_id, sort_order ASC, id ASC);

      CREATE INDEX IF NOT EXISTS idx_activity_logs_person_date_id
        ON activity_logs(person_id, activity_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_group_date_id
        ON activity_logs(group_id, activity_date DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_activity_log_items_log_id
        ON activity_log_items(activity_log_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_log_items_type_id
        ON activity_log_items(activity_type_id, id DESC);

      CREATE INDEX IF NOT EXISTS idx_activity_log_item_scores_config_computed
        ON activity_log_item_scores(config_version_id, computed_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_events_entity_created
        ON audit_events(entity_name, entity_id, created_at DESC, id DESC);
    `
  },
  {
    id: 3,
    name: "enforce_single_active_score_config",
    sql: `
      UPDATE score_config_versions
      SET is_active = CASE
        WHEN id = (
          SELECT id
          FROM score_config_versions
          WHERE is_active = 1
          ORDER BY activated_at DESC, created_at DESC, id DESC
          LIMIT 1
        ) THEN 1
        ELSE 0
      END,
      activated_at = CASE
        WHEN id = (
          SELECT id
          FROM score_config_versions
          WHERE is_active = 1
          ORDER BY activated_at DESC, created_at DESC, id DESC
          LIMIT 1
        ) THEN COALESCE(activated_at, datetime('now'))
        ELSE NULL
      END
      WHERE is_active = 1;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_score_config_one_active
      ON score_config_versions(is_active)
      WHERE is_active = 1;
    `
  },
  {
    id: 4,
    name: "add_activity_type_subgroup_fields",
    sql: `
      ALTER TABLE activity_types ADD COLUMN parent_activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE SET NULL;
      ALTER TABLE activity_types ADD COLUMN percent_of_parent_type REAL CHECK (percent_of_parent_type >= 0);

      CREATE INDEX IF NOT EXISTS idx_activity_types_parent
        ON activity_types(parent_activity_type_id, sort_order ASC, id ASC);
    `
  }
];

export function runSchemaMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const hasMigrationStmt = db.prepare("SELECT 1 FROM schema_migrations WHERE id = @id LIMIT 1");
  const markAppliedStmt = db.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (@id, @name, datetime('now'))"
  );

  const applyMigration = db.transaction((migration: Migration) => {
    const alreadyApplied = hasMigrationStmt.get({ id: migration.id });
    if (alreadyApplied) {
      return;
    }

    db.exec(migration.sql);
    markAppliedStmt.run({ id: migration.id, name: migration.name });
  });

  for (const migration of MIGRATIONS) {
    applyMigration(migration);
  }
}
