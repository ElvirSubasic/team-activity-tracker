import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runSchemaMigrations } from "./schema";

export type SqliteDatabase = Database.Database;

export function openDatabase(dbFilePath: string): SqliteDatabase {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

  const db = new Database(dbFilePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  runSchemaMigrations(db);
  return db;
}
