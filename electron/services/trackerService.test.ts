import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "../db/client";
import { createTrackerService, type TrackerService } from "./trackerService";

function createTestContext(): {
  db: SqliteDatabase;
  service: TrackerService;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-db-test-"));
  const dbPath = path.join(tempDir, "test.sqlite3");
  const db = openDatabase(dbPath);
  const service = createTrackerService(db);

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

describe("TrackerService database core", () => {
  it("initializes schema idempotently", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const tables = ctx.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('categories', 'transactions') ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((t) => t.name)).toEqual(["categories", "transactions"]);

    expect(() => {
      ctx.db.exec("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY)");
    }).not.toThrow();
  });

  it("supports category and transaction CRUD + filters + dashboard totals", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    const food = ctx.service.createCategory({ name: "Food" });
    const travel = ctx.service.createCategory({ name: "Travel" });

    const tx1 = ctx.service.createTransaction({
      category_id: food.id,
      title: "Lunch",
      amount: 12.5,
      currency: "usd",
      note: "team meal",
      created_at: "2026-03-01T10:00:00.000Z"
    });

    ctx.service.createTransaction({
      category_id: travel.id,
      title: "Cab",
      amount: 20,
      currency: "USD",
      note: "airport",
      created_at: "2026-03-15T10:00:00.000Z"
    });

    const updated = ctx.service.updateTransaction({
      id: tx1.id,
      category_id: food.id,
      title: "Lunch team",
      amount: 15,
      currency: "USD",
      note: "updated note",
      created_at: "2026-03-02T10:00:00.000Z"
    });

    expect(updated.amount).toBe(15);

    const filtered = ctx.service.listTransactions({
      text: "lunch",
      category_id: food.id,
      start_date: "2026-03-01T00:00:00.000Z",
      end_date: "2026-03-31T23:59:59.000Z"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Lunch team");

    const totals = ctx.service.getDashboardTotals({
      start_date: "2026-03-01T00:00:00.000Z",
      end_date: "2026-03-31T23:59:59.000Z"
    });

    expect(totals.byMonth).toHaveLength(1);
    expect(totals.byMonth[0].month).toBe("2026-03");
    expect(totals.byMonth[0].total).toBe(35);

    const foodTotal = totals.byCategory.find((t) => t.category_id === food.id);
    expect(foodTotal?.total).toBe(15);

    ctx.service.deleteTransaction(tx1.id);
    expect(ctx.service.getTransaction(tx1.id)).toBeNull();
  });

  it("validates required fields and amount", () => {
    const ctx = createTestContext();
    cleanups.push(ctx.cleanup);

    expect(() => ctx.service.createCategory({ name: " " })).toThrow("Category name is required");

    const category = ctx.service.createCategory({ name: "Ops" });

    expect(() =>
      ctx.service.createTransaction({
        category_id: category.id,
        title: "",
        amount: 10,
        currency: "USD"
      })
    ).toThrow("Transaction title is required");

    expect(() =>
      ctx.service.createTransaction({
        category_id: category.id,
        title: "Invalid amount",
        amount: 0,
        currency: "USD"
      })
    ).toThrow("Transaction amount must be greater than 0");
  });
});
