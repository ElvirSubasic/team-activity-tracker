import { useMemo, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type { Category, Transaction, TransactionFilters } from "../types";

type TransactionManagerProps = {
  categories: Category[];
  transactions: Transaction[];
  activeFilters: TransactionFilters;
  isLoading: boolean;
  onCreate: (input: {
    category_id: number;
    title: string;
    amount: number;
    currency: string;
    note?: string | null;
    created_at?: string;
  }) => Promise<void>;
  onUpdate: (input: {
    id: number;
    category_id: number;
    title: string;
    amount: number;
    currency: string;
    note?: string | null;
    created_at?: string;
  }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onApplyFilters: (filters: TransactionFilters) => Promise<void>;
  onResetFilters: () => Promise<void>;
};

type FormState = {
  categoryId: string;
  title: string;
  amount: string;
  currency: string;
  note: string;
  date: string;
};

const initialForm: FormState = {
  categoryId: "",
  title: "",
  amount: "",
  currency: "USD",
  note: "",
  date: ""
};

function toDateFilterStart(date: string): string | undefined {
  return date ? `${date} 00:00:00` : undefined;
}

function toDateFilterEnd(date: string): string | undefined {
  return date ? `${date} 23:59:59` : undefined;
}

function toRecordDate(date: string): string | undefined {
  return date ? `${date} 12:00:00` : undefined;
}

export function TransactionManager({
  categories,
  transactions,
  activeFilters,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  onApplyFilters,
  onResetFilters
}: TransactionManagerProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [textFilter, setTextFilter] = useState(activeFilters.text ?? "");
  const [categoryFilter, setCategoryFilter] = useState(
    activeFilters.category_id ? String(activeFilters.category_id) : ""
  );
  const [startDateFilter, setStartDateFilter] = useState(
    activeFilters.start_date?.slice(0, 10) ?? ""
  );
  const [endDateFilter, setEndDateFilter] = useState(activeFilters.end_date?.slice(0, 10) ?? "");

  const categoryMap = useMemo(() => {
    const next = new Map<number, string>();
    for (const category of categories) {
      next.set(category.id, category.name);
    }
    return next;
  }, [categories]);

  const canSubmit = useMemo(() => {
    return (
      form.categoryId.length > 0 &&
      form.title.trim().length > 0 &&
      Number(form.amount) > 0 &&
      form.currency.trim().length > 0
    );
  }, [form]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setMessage("Please fill required fields and use amount > 0.");
      return;
    }

    setMessage(null);
    const payload = {
      category_id: Number(form.categoryId),
      title: form.title.trim(),
      amount: Number(form.amount),
      currency: form.currency.trim().toUpperCase(),
      note: form.note.trim() || null,
      created_at: toRecordDate(form.date)
    };

    try {
      if (editingId) {
        await onUpdate({ id: editingId, ...payload });
      } else {
        await onCreate(payload);
      }
      resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save transaction");
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setMessage(null);
    setForm({
      categoryId: String(transaction.category_id),
      title: transaction.title,
      amount: String(transaction.amount),
      currency: transaction.currency,
      note: transaction.note ?? "",
      date: transaction.created_at.slice(0, 10)
    });
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);
    setMessage(null);
    try {
      await onDelete(id);
      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete transaction");
    } finally {
      setBusyId(null);
    }
  };

  const applyFilters = async () => {
    setMessage(null);
    try {
      await onApplyFilters({
        text: textFilter.trim() || undefined,
        category_id: categoryFilter ? Number(categoryFilter) : undefined,
        start_date: toDateFilterStart(startDateFilter),
        end_date: toDateFilterEnd(endDateFilter)
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to filter transactions");
    }
  };

  const resetFilters = async () => {
    setTextFilter("");
    setCategoryFilter("");
    setStartDateFilter("");
    setEndDateFilter("");
    setMessage(null);

    try {
      await onResetFilters();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to reset filters");
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Transactions</h2>
      </div>

      <div className="grid-form">
        <select
          value={form.categoryId}
          onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
        >
          <option value="">Select category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Title"
          value={form.title}
          maxLength={120}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
        />

        <input
          type="number"
          min={0.01}
          step={0.01}
          placeholder="Amount"
          value={form.amount}
          onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
        />

        <input
          type="text"
          placeholder="Currency (e.g. USD)"
          maxLength={10}
          value={form.currency}
          onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
        />

        <input
          type="date"
          value={form.date}
          onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
        />

        <input
          type="text"
          placeholder="Note (optional)"
          maxLength={1000}
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
        />
      </div>

      <div className="form-row">
        <button type="button" onClick={handleSubmit} disabled={!canSubmit || categories.length === 0}>
          {editingId ? "Update Transaction" : "Add Transaction"}
        </button>
        {editingId ? (
          <button type="button" className="ghost" onClick={resetForm}>
            Cancel Edit
          </button>
        ) : null}
      </div>

      <h3>Filters</h3>
      <div className="grid-form">
        <input
          type="text"
          placeholder="Search title or note"
          value={textFilter}
          onChange={(event) => setTextFilter(event.target.value)}
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDateFilter}
          onChange={(event) => setStartDateFilter(event.target.value)}
        />
        <input
          type="date"
          value={endDateFilter}
          onChange={(event) => setEndDateFilter(event.target.value)}
        />
      </div>

      <div className="form-row">
        <button type="button" className="ghost" onClick={applyFilters}>
          Apply Filters
        </button>
        <button type="button" className="ghost" onClick={resetFilters}>
          Clear Filters
        </button>
      </div>

      {isLoading ? <p className="hint">Loading transactions...</p> : null}
      <FeedbackNotice message={message} variant="error" />

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.created_at.slice(0, 10)}</td>
                <td>{transaction.title}</td>
                <td>{categoryMap.get(transaction.category_id) ?? "Unknown"}</td>
                <td>{transaction.amount.toFixed(2)}</td>
                <td>{transaction.currency}</td>
                <td>{transaction.note ?? "-"}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="ghost" onClick={() => handleEdit(transaction)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={busyId === transaction.id}
                      onClick={() => handleDelete(transaction.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="hint center">
                  No transactions match your filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
