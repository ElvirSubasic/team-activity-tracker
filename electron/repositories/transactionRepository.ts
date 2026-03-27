import type { SqliteDatabase } from "../db/client";
import type {
  DashboardCategoryTotal,
  DashboardFilters,
  DashboardMonthlyTotal,
  Transaction,
  TransactionCreateInput,
  TransactionListFilters,
  TransactionUpdateInput
} from "../types";

type SqlParams = Record<string, string | number>;

export class TransactionRepository {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: TransactionCreateInput): Transaction {
    const result = this.db
      .prepare(
        `INSERT INTO transactions (category_id, title, amount, currency, note, created_at)
         VALUES (@category_id, @title, @amount, @currency, @note, COALESCE(@created_at, datetime('now')))`
      )
      .run({
        category_id: input.category_id,
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        note: input.note ?? null,
        created_at: input.created_at ?? null
      });

    return this.getById(Number(result.lastInsertRowid)) as Transaction;
  }

  getById(id: number): Transaction | null {
    const row = this.db
      .prepare(
        "SELECT id, category_id, title, amount, currency, note, created_at FROM transactions WHERE id = @id"
      )
      .get({ id });

    return (row as Transaction | undefined) ?? null;
  }

  update(input: TransactionUpdateInput): Transaction {
    this.db
      .prepare(
        `UPDATE transactions
         SET category_id = @category_id,
             title = @title,
             amount = @amount,
             currency = @currency,
             note = @note,
             created_at = COALESCE(@created_at, created_at)
         WHERE id = @id`
      )
      .run({
        id: input.id,
        category_id: input.category_id,
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        note: input.note ?? null,
        created_at: input.created_at ?? null
      });

    const transaction = this.getById(input.id);
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  }

  remove(id: number): void {
    const result = this.db.prepare("DELETE FROM transactions WHERE id = @id").run({ id });

    if (result.changes === 0) {
      throw new Error("Transaction not found");
    }
  }

  list(filters: TransactionListFilters): Transaction[] {
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.text) {
      clauses.push("(title LIKE @text OR COALESCE(note, '') LIKE @text)");
      params.text = `%${filters.text}%`;
    }

    if (filters.category_id) {
      clauses.push("category_id = @category_id");
      params.category_id = filters.category_id;
    }

    if (filters.start_date) {
      clauses.push("created_at >= @start_date");
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push("created_at <= @end_date");
      params.end_date = filters.end_date;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT id, category_id, title, amount, currency, note, created_at
         FROM transactions
         ${where}
         ORDER BY created_at DESC, id DESC`
      )
      .all(params) as Transaction[];
  }

  totalsByMonth(filters: DashboardFilters): DashboardMonthlyTotal[] {
    const { where, params } = this.dashboardWhere(filters);

    return this.db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) AS month,
                currency,
                SUM(amount) AS total
         FROM transactions
         ${where}
         GROUP BY month, currency
         ORDER BY month DESC, currency ASC`
      )
      .all(params) as DashboardMonthlyTotal[];
  }

  totalsByCategory(filters: DashboardFilters): DashboardCategoryTotal[] {
    const { where, params } = this.dashboardWhere(filters, "t");

    return this.db
      .prepare(
        `SELECT t.category_id,
                c.name AS category_name,
                t.currency,
                SUM(t.amount) AS total
         FROM transactions t
         INNER JOIN categories c ON c.id = t.category_id
         ${where}
         GROUP BY t.category_id, c.name, t.currency
         ORDER BY total DESC`
      )
      .all(params) as DashboardCategoryTotal[];
  }

  private dashboardWhere(filters: DashboardFilters, alias = ""): {
    where: string;
    params: SqlParams;
  } {
    const prefix = alias ? `${alias}.` : "";
    const clauses: string[] = [];
    const params: SqlParams = {};

    if (filters.start_date) {
      clauses.push(`${prefix}created_at >= @start_date`);
      params.start_date = filters.start_date;
    }

    if (filters.end_date) {
      clauses.push(`${prefix}created_at <= @end_date`);
      params.end_date = filters.end_date;
    }

    return {
      where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
      params
    };
  }
}
