import { CategoryRepository } from "../repositories/categoryRepository";
import { TransactionRepository } from "../repositories/transactionRepository";
import type { SqliteDatabase } from "../db/client";
import type {
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
  DashboardFilters,
  DashboardTotals,
  Transaction,
  TransactionCreateInput,
  TransactionListFilters,
  TransactionUpdateInput
} from "../types";

const MAX_CATEGORY_NAME = 80;
const MAX_TITLE = 120;
const MAX_CURRENCY = 10;
const MAX_NOTE = 1000;

export class TrackerService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository
  ) {}

  createCategory(input: CategoryCreateInput): Category {
    const name = this.validateCategoryName(input.name);
    return this.categories.create(name);
  }

  listCategories(): Category[] {
    return this.categories.list();
  }

  getCategory(id: number): Category | null {
    this.ensurePositiveInteger(id, "Category id");
    return this.categories.getById(id);
  }

  updateCategory(input: CategoryUpdateInput): Category {
    this.ensurePositiveInteger(input.id, "Category id");
    const name = this.validateCategoryName(input.name);
    return this.categories.update(input.id, name);
  }

  deleteCategory(id: number): { ok: true } {
    this.ensurePositiveInteger(id, "Category id");
    this.categories.remove(id);
    return { ok: true };
  }

  createTransaction(input: TransactionCreateInput): Transaction {
    const payload = this.validateTransactionInput(input);

    const category = this.categories.getById(payload.category_id);
    if (!category) {
      throw new Error("Category does not exist");
    }

    return this.transactions.create(payload);
  }

  getTransaction(id: number): Transaction | null {
    this.ensurePositiveInteger(id, "Transaction id");
    return this.transactions.getById(id);
  }

  updateTransaction(input: TransactionUpdateInput): Transaction {
    this.ensurePositiveInteger(input.id, "Transaction id");

    const payload = this.validateTransactionInput(input);
    const category = this.categories.getById(payload.category_id);
    if (!category) {
      throw new Error("Category does not exist");
    }

    return this.transactions.update({
      id: input.id,
      ...payload
    });
  }

  deleteTransaction(id: number): { ok: true } {
    this.ensurePositiveInteger(id, "Transaction id");
    this.transactions.remove(id);
    return { ok: true };
  }

  listTransactions(filters: TransactionListFilters): Transaction[] {
    if (filters.text && filters.text.length > MAX_NOTE) {
      throw new Error("Search text is too long");
    }

    if (filters.category_id !== undefined) {
      this.ensurePositiveInteger(filters.category_id, "Category id filter");
    }

    if (filters.start_date) {
      this.ensureValidDate(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureValidDate(filters.end_date, "end_date");
    }

    return this.transactions.list(filters);
  }

  getDashboardTotals(filters: DashboardFilters): DashboardTotals {
    if (filters.start_date) {
      this.ensureValidDate(filters.start_date, "start_date");
    }

    if (filters.end_date) {
      this.ensureValidDate(filters.end_date, "end_date");
    }

    return {
      byMonth: this.transactions.totalsByMonth(filters),
      byCategory: this.transactions.totalsByCategory(filters)
    };
  }

  private validateCategoryName(name: string): string {
    const normalized = name?.trim();
    if (!normalized) {
      throw new Error("Category name is required");
    }

    if (normalized.length > MAX_CATEGORY_NAME) {
      throw new Error(`Category name must be <= ${MAX_CATEGORY_NAME} characters`);
    }

    return normalized;
  }

  private validateTransactionInput(
    input: TransactionCreateInput | TransactionUpdateInput
  ): TransactionCreateInput {
    this.ensurePositiveInteger(input.category_id, "Category id");

    const title = input.title?.trim();
    if (!title) {
      throw new Error("Transaction title is required");
    }

    if (title.length > MAX_TITLE) {
      throw new Error(`Transaction title must be <= ${MAX_TITLE} characters`);
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Transaction amount must be greater than 0");
    }

    const currency = input.currency?.trim().toUpperCase();
    if (!currency) {
      throw new Error("Currency is required");
    }

    if (currency.length > MAX_CURRENCY) {
      throw new Error(`Currency must be <= ${MAX_CURRENCY} characters`);
    }

    const note = input.note?.trim() || null;
    if (note && note.length > MAX_NOTE) {
      throw new Error(`Note must be <= ${MAX_NOTE} characters`);
    }

    if (input.created_at) {
      this.ensureValidDate(input.created_at, "created_at");
    }

    return {
      category_id: input.category_id,
      title,
      amount: input.amount,
      currency,
      note,
      created_at: input.created_at
    };
  }

  private ensurePositiveInteger(value: number, label: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${label} must be a positive integer`);
    }
  }

  private ensureValidDate(value: string, label: string): void {
    if (Number.isNaN(Date.parse(value))) {
      throw new Error(`${label} must be a valid date string`);
    }
  }
}

export function createTrackerService(db: SqliteDatabase): TrackerService {
  return new TrackerService(new CategoryRepository(db), new TransactionRepository(db));
}
