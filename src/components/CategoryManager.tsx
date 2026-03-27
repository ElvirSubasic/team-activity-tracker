import { useMemo, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type { Category } from "../types";

type CategoryManagerProps = {
  categories: Category[];
  isLoading: boolean;
  onCreate: (name: string) => Promise<void>;
  onUpdate: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export function CategoryManager({
  categories,
  isLoading,
  onCreate,
  onUpdate,
  onDelete
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canCreate = useMemo(() => newName.trim().length > 0 && !isLoading, [newName, isLoading]);

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }

    setMessage(null);
    try {
      await onCreate(newName.trim());
      setNewName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create category");
    }
  };

  const beginEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setMessage(null);
  };

  const handleUpdate = async () => {
    if (!editingId) {
      return;
    }

    setBusyId(editingId);
    setMessage(null);
    try {
      await onUpdate(editingId, editingName);
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update category");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);
    setMessage(null);
    try {
      await onDelete(id);
      if (editingId === id) {
        setEditingId(null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete category");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Categories</h2>
      </div>

      <form
        className="inline-form form-section"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <label>
          New Category Name
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="e.g. Campaign Planning"
            maxLength={80}
            disabled={isLoading}
          />
        </label>
        <button className="btn-sm" type="submit" disabled={!canCreate}>
          Add Category
        </button>
      </form>

      {isLoading ? <p className="hint">Loading categories...</p> : null}
      <FeedbackNotice message={message} variant="error" />

      <ul className="list">
        {categories.map((category) => {
          const isEditing = editingId === category.id;
          const isBusy = busyId === category.id;

          return (
            <li key={category.id} className="list-item">
              {isEditing ? (
                <form
                  className="inline-form row-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleUpdate();
                  }}
                >
                  <label>
                    Edit Name
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={80}
                    />
                  </label>
                  <div className="row-actions">
                    <button className="btn-sm" type="submit" disabled={isBusy || editingName.trim().length === 0}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="ghost btn-sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditingName("");
                      }}
                      disabled={isBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <span>{category.name}</span>
                  <div className="row-actions">
                    <button type="button" className="ghost btn-sm" onClick={() => beginEdit(category)} disabled={busyId !== null}>
                      Edit
                    </button>
                    <button type="button" className="danger btn-sm" onClick={() => handleDelete(category.id)} disabled={busyId !== null}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}

        {categories.length === 0 && !isLoading ? <li className="hint">No categories yet.</li> : null}
      </ul>
    </section>
  );
}
