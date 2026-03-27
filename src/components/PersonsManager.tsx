import { useCallback, useEffect, useMemo, useState } from "react";
import { FeedbackNotice } from "./FeedbackNotice";
import type {
  ActivityLogDetail,
  Person,
  PersonCsvImportResult,
  PersonFilters,
  PersonTransparencyData,
  PersonTransparencyFilters,
  ScoreConfigGroup
} from "../types";

type Props = {
  normalizeError: (error: unknown) => Error;
};

type PersonForm = {
  index_num: string;
  name: string;
  role: string;
  phone_number: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 10;

const emptyForm: PersonForm = {
  index_num: "",
  name: "",
  role: "",
  phone_number: "",
  is_active: true
};

const defaultTransparencyFilters: PersonTransparencyFilters = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  sort_by: "activity_date",
  sort_dir: "desc"
};

export function PersonsManager({ normalizeError }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [items, setItems] = useState<Person[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [appliedFilters, setAppliedFilters] = useState<PersonFilters>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

  const [createForm, setCreateForm] = useState<PersonForm>(emptyForm);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [details, setDetails] = useState<Person | null>(null);
  const [transparency, setTransparency] = useState<PersonTransparencyData | null>(null);
  const [transparencyFilters, setTransparencyFilters] = useState<PersonTransparencyFilters>(
    defaultTransparencyFilters
  );
  const [catalogGroups, setCatalogGroups] = useState<ScoreConfigGroup[]>([]);
  const [explainedLog, setExplainedLog] = useState<ActivityLogDetail | null>(null);
  const [explainedLogId, setExplainedLogId] = useState<number | null>(null);

  const isDetailOpen = selectedPersonId !== null;

  const subtitle = useMemo(
    () => `Page ${page} / ${Math.max(totalPages, 1)} · ${total} persons`,
    [page, total, totalPages]
  );

  const toIsActiveFilter = (): boolean | undefined => {
    if (activeFilter === "active") {
      return true;
    }

    if (activeFilter === "inactive") {
      return false;
    }

    return undefined;
  };

  const loadList = useCallback(async (filters: PersonFilters) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await window.desktop.person.list(filters);
      setItems(response.items);
      setPage(response.page);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [normalizeError]);

  const loadDetails = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const person = await window.desktop.person.get(id);
      setDetails(person);
      if (!person) {
        setSelectedPersonId(null);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [normalizeError]);

  const loadCatalogGroups = useCallback(async () => {
    try {
      const catalog = await window.desktop.activity.getCatalog();
      setCatalogGroups(catalog.groups);
    } catch {
      setCatalogGroups([]);
    }
  }, []);

  const loadTransparency = useCallback(async (personId: number, filters: PersonTransparencyFilters) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await window.desktop.person.getTransparency(personId, filters);
      setTransparency(response);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [normalizeError]);

  const loadExplainLog = async (logId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const detail = await window.desktop.activity.get(logId);
      setExplainedLog(detail);
      setExplainedLogId(logId);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadList(appliedFilters);
  }, [appliedFilters, loadList]);

  useEffect(() => {
    if (selectedPersonId !== null) {
      void loadDetails(selectedPersonId);
      void loadCatalogGroups();
    }
  }, [selectedPersonId, loadDetails, loadCatalogGroups]);

  useEffect(() => {
    if (selectedPersonId !== null) {
      void loadTransparency(selectedPersonId, transparencyFilters);
    }
  }, [selectedPersonId, transparencyFilters, loadTransparency]);

  const refresh = async () => {
    await loadList(appliedFilters);

    if (selectedPersonId !== null) {
      await loadDetails(selectedPersonId);
      await loadTransparency(selectedPersonId, transparencyFilters);
    }
  };

  const applySearch = async () => {
    setStatus(null);
    setAppliedFilters({
      text: searchText.trim() || undefined,
      is_active: toIsActiveFilter(),
      page: 1,
      pageSize
    });
  };

  const gotoPage = async (nextPage: number) => {
    setAppliedFilters({
      ...appliedFilters,
      page: nextPage,
      pageSize
    });
  };

  const createPerson = async () => {
    setError(null);
    setStatus(null);

    try {
      await window.desktop.person.create({
        index_num: createForm.index_num,
        name: createForm.name,
        role: createForm.role,
        phone_number: createForm.phone_number || null,
        is_active: createForm.is_active
      });

      setCreateForm(emptyForm);
      setStatus("Person created.");
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const updateSelected = async () => {
    if (!details) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      await window.desktop.person.update({
        id: details.id,
        name: details.name,
        role: details.role,
        phone_number: details.phone_number,
        is_active: details.is_active === 1
      });

      setStatus("Person updated.");
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const deactivate = async (id: number) => {
    setError(null);
    setStatus(null);

    try {
      await window.desktop.person.deactivate(id);
      setStatus("Person deactivated.");
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const reactivate = async (id: number) => {
    setError(null);
    setStatus(null);

    try {
      await window.desktop.person.reactivate(id);
      setStatus("Person reactivated.");
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this person permanently?")) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      await window.desktop.person.delete(id);

      if (selectedPersonId === id) {
        setSelectedPersonId(null);
        setDetails(null);
      }

      setStatus("Person deleted.");
      await refresh();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const exportCsv = async () => {
    setError(null);
    setStatus(null);

    try {
      const result = await window.desktop.person.exportCsv({
        text: appliedFilters.text,
        is_active: appliedFilters.is_active
      });

      if (result.ok) {
        setStatus(`CSV exported to ${result.path}`);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  const importCsv = async () => {
    setError(null);
    setStatus(null);

    try {
      const result: PersonCsvImportResult = await window.desktop.person.importCsv();
      if (result.ok) {
        setStatus(
          `CSV import done. Inserted ${result.inserted ?? 0}, updated ${result.updated ?? 0}, skipped ${result.skipped ?? 0}.`
        );
        await refresh();
      }
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };

  if (isDetailOpen && details) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>Person Details</h2>
          <button
            className="ghost"
            onClick={() => {
              setSelectedPersonId(null);
              setTransparency(null);
              setExplainedLog(null);
              setExplainedLogId(null);
              setTransparencyFilters(defaultTransparencyFilters);
            }}
          >
            Back to list
          </button>
        </div>

        <FeedbackNotice message={error} variant="error" />
        <FeedbackNotice message={status} variant="success" />

        <div className="grid-form">
          <label>
            Index Number
            <input value={details.index_num} disabled />
          </label>
          <label>
            Name
            <input
              value={details.name}
              onChange={(event) =>
                setDetails((prev) => (prev ? { ...prev, name: event.target.value } : prev))
              }
            />
          </label>
          <label>
            Role
            <input
              value={details.role}
              onChange={(event) =>
                setDetails((prev) => (prev ? { ...prev, role: event.target.value } : prev))
              }
            />
          </label>
          <label>
            Phone Number
            <input
              value={details.phone_number ?? ""}
              onChange={(event) =>
                setDetails((prev) => (prev ? { ...prev, phone_number: event.target.value || null } : prev))
              }
            />
          </label>
          <label>
            Active
            <select
              value={details.is_active === 1 ? "1" : "0"}
              onChange={(event) =>
                setDetails((prev) =>
                  prev
                    ? {
                        ...prev,
                        is_active: event.target.value === "1" ? 1 : 0
                      }
                    : prev
                )
              }
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </label>
          <label>
            Created At
            <input value={details.created_at} disabled />
          </label>
        </div>

        <div className="form-row action-row">
          <button onClick={updateSelected} disabled={isLoading}>
            Save
          </button>
          {details.is_active === 1 ? (
            <button className="ghost" onClick={() => deactivate(details.id)} disabled={isLoading}>
              Deactivate
            </button>
          ) : (
            <button className="ghost" onClick={() => reactivate(details.id)} disabled={isLoading}>
              Reactivate
            </button>
          )}
          <button className="danger" onClick={() => remove(details.id)} disabled={isLoading}>
            Delete
          </button>
        </div>

        <hr />

        <h3>Transparency Summary</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="hint">Total Points</p>
            <strong>{transparency?.summary.total_points ?? 0}</strong>
          </div>
          <div className="stat-card">
            <p className="hint">Participation %</p>
            <strong>{(transparency?.summary.participation_percent ?? 0).toFixed(2)}%</strong>
          </div>
          <div className="stat-card">
            <p className="hint">Log Count</p>
            <strong>{transparency?.summary.log_count ?? 0}</strong>
          </div>
          <div className="stat-card">
            <p className="hint">Last Activity Date</p>
            <strong>{transparency?.summary.last_activity_date ?? "-"}</strong>
          </div>
        </div>

        <h3>Log Filters & Sort</h3>
        <div className="grid-form">
          <label>
            Start Date
            <input
              type="date"
              value={transparencyFilters.start_date ?? ""}
              onChange={(event) =>
                setTransparencyFilters((prev) => ({
                  ...prev,
                  start_date: event.target.value || undefined,
                  page: 1,
                  pageSize: DEFAULT_PAGE_SIZE
                }))
              }
            />
          </label>

          <label>
            End Date
            <input
              type="date"
              value={transparencyFilters.end_date ?? ""}
              onChange={(event) =>
                setTransparencyFilters((prev) => ({
                  ...prev,
                  end_date: event.target.value || undefined,
                  page: 1,
                  pageSize: DEFAULT_PAGE_SIZE
                }))
              }
            />
          </label>

          <label>
            Group
            <select
              value={transparencyFilters.group_id ?? ""}
              onChange={(event) =>
                setTransparencyFilters((prev) => ({
                  ...prev,
                  group_id: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                  pageSize: DEFAULT_PAGE_SIZE
                }))
              }
            >
              <option value="">All groups</option>
              {catalogGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Activity Type
            <select
              value={transparencyFilters.activity_type_id ?? ""}
              onChange={(event) =>
                setTransparencyFilters((prev) => ({
                  ...prev,
                  activity_type_id: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                  pageSize: DEFAULT_PAGE_SIZE
                }))
              }
            >
              <option value="">All activity types</option>
              {catalogGroups.flatMap((group) => group.activity_types).map((activityType) => (
                <option key={activityType.id} value={activityType.id}>
                  {activityType.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Sort
            <select
              value={`${transparencyFilters.sort_by ?? "activity_date"}:${transparencyFilters.sort_dir ?? "desc"}`}
              onChange={(event) => {
                const [sort_by, sort_dir] = event.target.value.split(":") as [
                  "activity_date" | "total_points" | "created_at",
                  "asc" | "desc"
                ];
                setTransparencyFilters((prev) => ({ ...prev, sort_by, sort_dir, page: 1, pageSize: DEFAULT_PAGE_SIZE }));
              }}
            >
              <option value="activity_date:desc">Date (newest first)</option>
              <option value="activity_date:asc">Date (oldest first)</option>
              <option value="total_points:desc">Points (high to low)</option>
              <option value="total_points:asc">Points (low to high)</option>
              <option value="created_at:desc">Created (newest first)</option>
              <option value="created_at:asc">Created (oldest first)</option>
            </select>
          </label>
        </div>

        <h3>Breakdown by Group</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Logs</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {(transparency?.breakdown_by_group ?? []).map((row) => (
                <tr key={row.group_id}>
                  <td>
                    {row.group_code} · {row.group_name}
                  </td>
                  <td>{row.log_count}</td>
                  <td>{row.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Breakdown by Activity Type</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity Type</th>
                <th>Group</th>
                <th>Logs</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {(transparency?.breakdown_by_type ?? []).map((row) => (
                <tr key={row.activity_type_id}>
                  <td>
                    {row.activity_type_code} · {row.activity_type_name}
                  </td>
                  <td>
                    {row.group_code} · {row.group_name}
                  </td>
                  <td>{row.log_count}</td>
                  <td>{row.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Trend by Date</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Logs</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {(transparency?.trend_by_date ?? []).map((point) => (
                <tr key={point.activity_date}>
                  <td>{point.activity_date}</td>
                  <td>{point.log_count}</td>
                  <td>{point.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Logs</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Group</th>
                <th>Total Points</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(transparency?.logs.items ?? []).map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.activity_date}</td>
                  <td>{log.group_name}</td>
                  <td>{log.total_points}</td>
                  <td>{log.notes || "-"}</td>
                  <td>
                    <button className="ghost" onClick={() => void loadExplainLog(log.id)}>
                      Explain score
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-row pagination-row">
          <span className="hint">
            Page {transparency?.logs.page ?? 1} / {Math.max(transparency?.logs.totalPages ?? 0, 1)} ·{" "}
            {transparency?.logs.total ?? 0} logs
          </span>
          <button
            className="ghost"
            onClick={() =>
              setTransparencyFilters((prev) => ({
                ...prev,
                page: Math.max(1, (prev.page ?? 1) - 1),
                pageSize: DEFAULT_PAGE_SIZE
              }))
            }
            disabled={(transparency?.logs.page ?? 1) <= 1}
          >
            Previous
          </button>
          <button
            className="ghost"
            onClick={() =>
              setTransparencyFilters((prev) => ({
                ...prev,
                page: Math.min(Math.max(transparency?.logs.totalPages ?? 1, 1), (prev.page ?? 1) + 1),
                pageSize: DEFAULT_PAGE_SIZE
              }))
            }
            disabled={(transparency?.logs.page ?? 1) >= (transparency?.logs.totalPages ?? 0)}
          >
            Next
          </button>
        </div>

        <h3>Explain Score</h3>
        <div className="preview-box">
          {explainedLog && explainedLogId ? (
            <>
              <p className="hint">
                Log #{explainedLogId} · Total Points: {explainedLog.total_points}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Config Version</th>
                      <th>Qty</th>
                      <th>Points/Unit</th>
                      <th>Total</th>
                      <th>Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explainedLog.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.activity_type_code} · {item.activity_type_name}
                        </td>
                        <td>{item.config_version_id}</td>
                        <td>{item.quantity}</td>
                        <td>{item.points_per_unit}</td>
                        <td>{item.total_points}</td>
                        <td>{item.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="hint">Pick a log and click Explain score to view formulas and config version used.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Persons</h2>
        <span className="hint">{subtitle}</span>
      </div>

      <FeedbackNotice message={error} variant="error" />
      <FeedbackNotice message={status} variant="success" />

      <h3>Create Person</h3>
      <div className="grid-form">
        <input
          placeholder="Index number"
          value={createForm.index_num}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, index_num: event.target.value }))}
        />
        <input
          placeholder="Name"
          value={createForm.name}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
        />
        <input
          placeholder="Role"
          value={createForm.role}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}
        />
        <input
          placeholder="Phone number"
          value={createForm.phone_number}
          onChange={(event) => setCreateForm((prev) => ({ ...prev, phone_number: event.target.value }))}
        />
        <select
          value={createForm.is_active ? "1" : "0"}
          onChange={(event) =>
            setCreateForm((prev) => ({
              ...prev,
              is_active: event.target.value === "1"
            }))
          }
        >
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>

      <div className="form-row action-row">
        <button onClick={createPerson} disabled={isLoading}>
          Create
        </button>
        <button className="ghost" onClick={exportCsv} disabled={isLoading}>
          Export CSV
        </button>
        <button className="ghost" onClick={importCsv} disabled={isLoading}>
          Import CSV
        </button>
      </div>

      <h3>Search & Filters</h3>
      <div className="form-row action-row">
        <input
          placeholder="Search name, index, role"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="ghost" onClick={applySearch} disabled={isLoading}>
          Apply
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Index #</th>
              <th>Name</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Active</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((person) => (
              <tr
                key={person.id}
                className="clickable-row"
                onClick={() => setSelectedPersonId(person.id)}
                title="Open details"
              >
                <td>{person.id}</td>
                <td>{person.index_num}</td>
                <td>{person.name}</td>
                <td>{person.role}</td>
                <td>{person.phone_number || "-"}</td>
                <td>{person.is_active === 1 ? "Yes" : "No"}</td>
                <td>{person.created_at}</td>
                <td>
                  <div className="row-actions">
                    {person.is_active === 1 ? (
                      <button
                        className="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deactivate(person.id);
                        }}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        className="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          void reactivate(person.id);
                        }}
                      >
                        Reactivate
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void remove(person.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-row pagination-row">
        <button className="ghost" onClick={() => gotoPage(Math.max(1, page - 1))} disabled={isLoading || page <= 1}>
          Previous
        </button>
        <button
          className="ghost"
          onClick={() => gotoPage(Math.min(Math.max(totalPages, 1), page + 1))}
          disabled={isLoading || page >= totalPages}
        >
          Next
        </button>
      </div>
    </section>
  );
}
